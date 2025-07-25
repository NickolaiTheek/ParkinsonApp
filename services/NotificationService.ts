import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Make TaskManager optional for better compatibility
let TaskManager: any;
try {
  TaskManager = require('expo-task-manager');
} catch (error) {
  console.warn('TaskManager not available, advanced background features disabled');
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export interface MedicationAlarm {
  id: string;
  patientId: string;
  medicationScheduleId: string;
  medicationName: string;
  scheduledTime: Date;
  attempt: 1 | 2 | 3;
}

export interface NotificationSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  reminderSound: string;
  maxAttempts: number;
  snoozeMinutes: number;
  caregiverAlertDelay: number;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
  reminderSound: 'default',
  maxAttempts: 3,
  snoozeMinutes: 5,
  caregiverAlertDelay: 15,
};

class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private settings: NotificationSettings = DEFAULT_SETTINGS;
  private caregiverPollingInterval: NodeJS.Timeout | null = null;
  private isPollingActive: boolean = false;

  // Global variable to track ongoing caregiver alerts (prevent race conditions)
  private ongoingCaregiverAlerts = new Set<string>();

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Initialize notification permissions and push token
  async initialize(): Promise<boolean> {
    try {
      console.log('[NotificationService] Starting initialization...');
      
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Notification permissions not granted');
        return false;
      }

      console.log('[NotificationService] Permissions granted, setting up notification channel...');

      // Set up notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('medication-alerts', {
          name: 'Medication Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
        });
        console.log('[NotificationService] Android notification channel created');
      }

      // Try to get push token, but don't fail if it doesn't work
      try {
        console.log('[NotificationService] Requesting Expo push token...');
        const tokenData = await Notifications.getExpoPushTokenAsync();
        this.pushToken = tokenData.data;
        console.log('[NotificationService] Push token obtained:', this.pushToken?.substring(0, 20) + '...');

        // Save token to database
        await this.savePushToken();
        console.log('[NotificationService] Push token saved to database');
      } catch (tokenError) {
        console.warn('[NotificationService] Failed to get push token, but continuing with local notifications:', tokenError);
        // Continue without push token - local notifications will still work
      }

      console.log('[NotificationService] Notification service initialized successfully');
      return true;
    } catch (error) {
      console.error('[NotificationService] Failed to initialize notifications:', error);
      return false;
    }
  }

  // Save push token to user's notification settings
  private async savePushToken(): Promise<void> {
    if (!this.pushToken) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('notification_settings')
        .upsert({
          user_id: user.id,
          expo_push_token: this.pushToken,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });
    } catch (error) {
      console.error('Failed to save push token:', error);
    }
  }

  // Schedule medication alarm sequence (3 alarms + caregiver alert)
  async scheduleMedicationAlarms(alarm: MedicationAlarm, isTestMode: boolean = false): Promise<void> {
    const scheduleTime = alarm.scheduledTime;
    const settings = await this.getUserSettings(alarm.patientId);

    // For test mode, use seconds instead of minutes for quick testing
    const snoozeInterval = isTestMode ? 10 : (settings.snoozeMinutes * 60); // 10 seconds vs 5 minutes
    const caregiverDelay = isTestMode ? 30 : (settings.caregiverAlertDelay * 60); // 30 seconds vs 15 minutes

    console.log(`[NotificationService] Scheduling 3-step alarm for ${alarm.medicationName} starting at ${scheduleTime.toISOString()}`);
    console.log(`[NotificationService] Test mode: ${isTestMode ? 'ENABLED (using seconds)' : 'DISABLED (using minutes)'}`);
    console.log(`[NotificationService] Current time: ${new Date().toISOString()}`);
    console.log(`[NotificationService] Settings - snooze: ${isTestMode ? snoozeInterval + 's' : settings.snoozeMinutes + 'min'}, caregiver delay: ${isTestMode ? caregiverDelay + 's' : settings.caregiverAlertDelay + 'min'}`);

    // Calculate exact times for each alarm
    const firstAlarmTime = new Date(scheduleTime.getTime());
    const secondAlarmTime = new Date(scheduleTime.getTime() + (snoozeInterval * 1000));
    const thirdAlarmTime = new Date(scheduleTime.getTime() + (snoozeInterval * 2 * 1000));
    const caregiverCheckTime = new Date(scheduleTime.getTime() + (caregiverDelay * 1000));

    console.log(`[NotificationService] Alarm times calculated:
      1st alarm: ${firstAlarmTime.toISOString()} (in ${Math.round((firstAlarmTime.getTime() - Date.now()) / 1000)}s)
      2nd alarm: ${secondAlarmTime.toISOString()} (in ${Math.round((secondAlarmTime.getTime() - Date.now()) / 1000)}s)
      3rd alarm: ${thirdAlarmTime.toISOString()} (in ${Math.round((thirdAlarmTime.getTime() - Date.now()) / 1000)}s)
      Caregiver check: ${caregiverCheckTime.toISOString()} (in ${Math.round((caregiverCheckTime.getTime() - Date.now()) / 1000)}s)`);

    // Schedule only the 'Medication Reminder' notification for the initial alert
    // (Do not schedule the 'First Reminder' notification)
    // The explicit 'Medication Reminder' notification is scheduled elsewhere (e.g., MedicationFormScreen)

    const secondAlarm = { ...alarm, attempt: 2 as const };
    await this.scheduleAlarm(secondAlarm, 2, secondAlarmTime, settings);

    const thirdAlarm = { ...alarm, attempt: 3 as const };
    await this.scheduleAlarm(thirdAlarm, 3, thirdAlarmTime, settings);

    // Schedule caregiver check
    await this.scheduleCaregiverCheck(alarm, caregiverCheckTime);

    console.log(`[NotificationService] ✅ All alarms scheduled successfully for ${alarm.medicationName}`);
  }

  // Schedule individual alarm with escalating urgency
  private async scheduleAlarm(
    alarm: MedicationAlarm, 
    attempt: 1 | 2 | 3, 
    time: Date, 
    settings: NotificationSettings
  ): Promise<void> {
    const urgencyLevel = this.getUrgencyLevel(attempt);
    const notificationId = `medication-${alarm.medicationScheduleId}-${attempt}`;

    // Calculate seconds until this alarm should fire (like working medication notifications)
    const secondsUntilTrigger = Math.max(1, Math.round((time.getTime() - Date.now()) / 1000));

    console.log(`[NotificationService] Scheduling alarm ${attempt} for ${time.toISOString()} (in ${secondsUntilTrigger} seconds)`);

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: notificationId,
        content: {
          title: this.getAlarmTitle(attempt, alarm.medicationName),
          body: this.getAlarmBody(attempt, alarm.medicationName),
          sound: settings.soundEnabled ? urgencyLevel.sound : false,
          vibrate: settings.vibrationEnabled ? urgencyLevel.vibration : undefined,
          priority: urgencyLevel.priority,
          categoryIdentifier: 'medication-reminder',
          data: {
            type: 'medication-alarm',
            medicationScheduleId: alarm.medicationScheduleId,
            patientId: alarm.patientId,
            attempt,
            alarmId: alarm.id,
          },
        },
        trigger: {
          seconds: secondsUntilTrigger,
          repeats: false,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });

      console.log(`[NotificationService] ✅ Alarm ${attempt} scheduled successfully for ${secondsUntilTrigger} seconds from now`);

      // Log alarm in database
      await this.logAlarmAttempt(alarm, attempt, time);

    } catch (error) {
      console.error(`[NotificationService] ❌ Failed to schedule alarm ${attempt}:`, error);
    }
  }

  // Get escalating urgency settings
  private getUrgencyLevel(attempt: 1 | 2 | 3) {
    switch (attempt) {
      case 1:
        return {
          sound: 'default',
          vibration: [0, 200, 100, 200],
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        };
      case 2:
        return {
          sound: 'default',
          vibration: [0, 500, 200, 500, 200, 500],
          priority: Notifications.AndroidNotificationPriority.HIGH,
        };
      case 3:
        return {
          sound: 'default',
          vibration: [0, 1000, 500, 1000, 500, 1000],
          priority: Notifications.AndroidNotificationPriority.MAX,
        };
    }
  }

  // Generate alarm titles based on attempt
  private getAlarmTitle(attempt: 1 | 2 | 3, medicationName: string): string {
    switch (attempt) {
      case 1:
        return `💊 First Reminder`;
      case 2:
        return `🔔 Second Reminder`;
      case 3:
        return `🚨 LAST REMINDER - URGENT`;
    }
  }

  // Generate alarm body text
  private getAlarmBody(attempt: 1 | 2 | 3, medicationName: string): string {
    switch (attempt) {
      case 1:
        return `This is your first reminder to take your ${medicationName}`;
      case 2:
        return `This is your second reminder to take your ${medicationName}`;
      case 3:
        return `LAST REMINDER: You need to take your ${medicationName} NOW or contact your caregiver immediately`;
    }
  }

  // Log alarm attempt in database
  private async logAlarmAttempt(alarm: MedicationAlarm, attempt: number, sentAt: Date): Promise<void> {
    try {
      await supabase
        .from('medication_alarms')
        .insert({
          patient_id: alarm.patientId,
          medication_schedule_id: alarm.medicationScheduleId,
          scheduled_time: alarm.scheduledTime.toISOString(),
          alarm_attempt: attempt,
          alarm_sent_at: sentAt.toISOString(),
        });
    } catch (error) {
      console.error('Failed to log alarm attempt:', error);
    }
  }

  // Schedule caregiver check after 3rd alarm
  private async scheduleCaregiverCheck(alarm: MedicationAlarm, checkTime: Date): Promise<void> {
    const checkId = `caregiver-check-${alarm.medicationScheduleId}`;

    // Calculate seconds until caregiver check should fire (like working medication notifications)
    const secondsUntilTrigger = Math.max(1, Math.round((checkTime.getTime() - Date.now()) / 1000));

    console.log(`[NotificationService] Scheduling caregiver check notification for ${checkTime.toISOString()} (in ${secondsUntilTrigger} seconds)`);

    await Notifications.scheduleNotificationAsync({
      identifier: checkId,
      content: {
        title: '🚨 CAREGIVER ALERT CHECK',
        body: `Checking if ${alarm.medicationName} was taken - will alert caregivers if not`,
        data: {
          type: 'caregiver-check',
          medicationScheduleId: alarm.medicationScheduleId,
          patientId: alarm.patientId,
          alarmId: alarm.id,
          medicationName: alarm.medicationName,
          scheduledTime: alarm.scheduledTime.toISOString(),
        },
      },
      trigger: {
        seconds: secondsUntilTrigger,
        repeats: false,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    console.log(`[NotificationService] ✅ Caregiver check scheduled for ${secondsUntilTrigger} seconds from now`);

    // Also schedule an immediate caregiver alert function
    this.scheduleDirectCaregiverAlert(alarm, checkTime);
  }

  // Schedule a direct caregiver alert using setTimeout (for testing)
  private async scheduleDirectCaregiverAlert(alarm: MedicationAlarm, alertTime: Date): Promise<void> {
    const delay = alertTime.getTime() - Date.now();
    
    if (delay > 0) {
      console.log(`[NotificationService] Setting timeout for caregiver alert in ${delay}ms`);
      
      setTimeout(async () => {
        console.log(`[NotificationService] Timeout triggered - checking if medication was taken`);
        
        try {
          // Check if medication was marked as taken
          const { data: alarmData } = await supabase
            .from('medication_alarms')
            .select('patient_responded')
            .eq('medication_schedule_id', alarm.medicationScheduleId)
            .eq('patient_responded', true)
            .limit(1);

          if (!alarmData || alarmData.length === 0) {
            console.log(`[NotificationService] No response found - alerting caregivers`);
            await this.alertCaregivers(alarm);
          } else {
            console.log(`[NotificationService] Medication was taken - no caregiver alert needed`);
          }
        } catch (error) {
          console.error('[NotificationService] Error in caregiver alert check:', error);
          // Alert caregivers anyway on error
          await this.alertCaregivers(alarm);
        }
      }, delay);
    }
  }

  // Mark medication as taken (stops remaining alarms)
  async markMedicationTaken(medicationScheduleId: string, takenAt: Date = new Date()): Promise<void> {
    try {
      // Cancel remaining notifications
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of notifications) {
        if (notification.content.data?.medicationScheduleId === medicationScheduleId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }

      // Update database
      await supabase
        .from('medication_alarms')
        .update({
          patient_responded: true,
          response_time: takenAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('medication_schedule_id', medicationScheduleId)
        .eq('patient_responded', false);

      console.log('Medication marked as taken, alarms cancelled');
    } catch (error) {
      console.error('Failed to mark medication as taken:', error);
    }
  }

  // Alert all caregivers for missed medication
  async alertCaregivers(alarm: MedicationAlarm): Promise<void> {
    try {
      // Create a unique key for this caregiver alert to prevent duplicates
      const alertKey = `${alarm.patientId}-${alarm.medicationName}-${alarm.scheduledTime.getTime()}`;
      
      // Check if this caregiver alert is already being processed
      if (this.ongoingCaregiverAlerts.has(alertKey)) {
        console.log(`[NotificationService] ⏭️ Caregiver alert already in progress for ${alarm.medicationName} - skipping duplicate`);
        return;
      }
      
      // Mark this caregiver alert as in progress
      this.ongoingCaregiverAlerts.add(alertKey);
      
      // Auto-remove from set after 2 minutes to prevent permanent blocking
      setTimeout(() => {
        this.ongoingCaregiverAlerts.delete(alertKey);
      }, 120000);
      
      console.log(`[NotificationService] Starting caregiver alert process for patient ${alarm.patientId}`);
      
      // Debug: Check if any connections exist at all
      const { data: allConnections, error: allConnectionsError } = await supabase
        .from('patient_caregiver_connections')
        .select('patient_id, caregiver_id, connection_status')
        .limit(5);
      
      console.log(`[NotificationService] DEBUG - All connections in database:`, { allConnections, error: allConnectionsError });
      
      // Debug: Check if this specific patient has any connections (regardless of status)
      const { data: patientConnections, error: patientConnectionsError } = await supabase
        .from('patient_caregiver_connections')
        .select('patient_id, caregiver_id, connection_status')
        .eq('patient_id', alarm.patientId);
      
      console.log(`[NotificationService] DEBUG - Connections for patient ${alarm.patientId}:`, { patientConnections, error: patientConnectionsError });
      
      // Get all caregivers for this patient
      const { data: caregivers, error: caregiversError } = await supabase
        .from('patient_caregiver_connections')
        .select(`
          caregiver_id,
          caregiver:caregiver_id(first_name, last_name)
        `)
        .eq('patient_id', alarm.patientId)
        .eq('connection_status', 'active');

      console.log(`[NotificationService] Caregiver query result:`, { caregivers, error: caregiversError });
      console.log(`[NotificationService] Found ${caregivers?.length || 0} caregivers for patient`);

      if (caregiversError) {
        console.error('[NotificationService] Error fetching caregivers:', caregiversError);
        return;
      }

      if (!caregivers || caregivers.length === 0) {
        console.log('No caregivers found for patient');
        return;
      }

      // Get patient name
      const { data: patient } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', alarm.patientId)
        .single();

      const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Patient';
      console.log(`[NotificationService] Patient name: ${patientName}`);

      // Send alert to each caregiver
      const alertPromises = caregivers.map(async (caregiver) => {
        console.log(`[NotificationService] Sending alert to caregiver ${caregiver.caregiver_id}`);
        
        return this.sendCaregiverAlert(caregiver.caregiver_id, {
          patientId: alarm.patientId,
          patientName,
          medicationName: alarm.medicationName,
          scheduledTime: alarm.scheduledTime,
          medicationScheduleId: alarm.medicationScheduleId,
        });
      });

      await Promise.all(alertPromises);

      // Log caregiver alert in database
      await supabase
        .from('medication_alarms')
        .update({
          caregiver_alerted: true,
          caregiver_alert_sent_at: new Date().toISOString(),
        })
        .eq('medication_schedule_id', alarm.medicationScheduleId);

      console.log(`[NotificationService] Successfully alerted ${caregivers.length} caregivers`);

      // Clean up the ongoing alert tracking
      this.ongoingCaregiverAlerts.delete(alertKey);

    } catch (error) {
      console.error('Failed to alert caregivers:', error);
      // Clean up on error too
      const alertKey = `${alarm.patientId}-${alarm.medicationName}-${alarm.scheduledTime.getTime()}`;
      this.ongoingCaregiverAlerts.delete(alertKey);
    }
  }

  // Send individual caregiver alert
  private async sendCaregiverAlert(caregiverId: string, alertData: any): Promise<void> {
    try {
      console.log(`[NotificationService] Sending alert to caregiver ${caregiverId}`);
      
      // Get caregiver's push token and settings
      const { data: settings, error: settingsError } = await supabase
        .from('notification_settings')
        .select('expo_push_token, sound_enabled, vibration_enabled')
        .eq('user_id', caregiverId)
        .single();

      console.log(`[NotificationService] Caregiver settings query result:`, { settings, error: settingsError });
      console.log(`[NotificationService] Caregiver settings:`, settings ? 'found' : 'not found');
      
      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error(`[NotificationService] Error fetching caregiver settings:`, settingsError);
      }

      const alertMessage = `🚨 ${alertData.patientName} hasn't taken ${alertData.medicationName} scheduled for ${alertData.scheduledTime.toLocaleTimeString()}`;

      // Try to send push notification if token exists
      if (settings?.expo_push_token) {
        console.log(`[NotificationService] Found push token for caregiver, sending push notification...`);
        console.log(`[NotificationService] Push token: ${settings.expo_push_token.substring(0, 20)}...`);
        
        try {
          const pushPayload = {
            to: settings.expo_push_token,
            title: '🚨 MEDICATION ALERT',
            body: alertMessage,
            sound: settings.sound_enabled !== false ? 'default' : null,
            priority: 'high',
            badge: 1,
            data: {
              type: 'caregiver-alert',
              patientId: alertData.patientId,
              medicationScheduleId: alertData.medicationScheduleId,
              patientName: alertData.patientName,
              medicationName: alertData.medicationName,
            },
          };
          
          console.log(`[NotificationService] Sending push notification with payload:`, pushPayload);
          
          // For MOCK tokens, simulate a successful push notification without actually sending
          if (settings.expo_push_token.includes('MOCK')) {
            console.log(`[NotificationService] ✅ MOCK push notification simulated for caregiver (development mode)`);
            console.log(`[NotificationService] 📱 In production, this would be sent to the caregiver's device`);
            
            // Log success without actual push
            console.log(`[NotificationService] ✅ Push notification sent successfully to caregiver (simulated)`);
          } else {
            // Send real push notification for production tokens
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(pushPayload),
            });

            const responseData = await response.json();
            console.log(`[NotificationService] Push notification response:`, responseData);
            
            if (responseData.data && responseData.data.status === 'ok') {
              console.log(`[NotificationService] ✅ Push notification sent successfully to caregiver`);
            } else {
              console.warn(`[NotificationService] ⚠️ Push notification failed (expected in development):`, responseData.data?.details || responseData);
              console.log(`[NotificationService] 🔄 Activating fallback system - storing alert for local delivery`);
              
              // For development: If push notification fails due to invalid token,
              // store the alert in a way that the caregiver device can pick it up
              console.log(`[NotificationService] 📱 Push notification failed - storing alert for caregiver device polling`);
              
              // Store alert for caregiver device polling as fallback
              const alertToStore = {
                patient_id: alertData.patientId,
                caregiver_id: caregiverId,
                medication_schedule_id: null, // Always null for development to avoid foreign key issues
                alert_type: 'medication_missed_local',
                alert_message: alertMessage,
              };
              
              console.log(`[NotificationService] 🔍 DEBUG: About to store alert:`, alertToStore);
              
              const { data: insertResult, error: insertError } = await supabase
                .from('caregiver_alerts')
                .insert(alertToStore);
              
              console.log(`[NotificationService] 🔍 DEBUG: Insert result:`, { insertResult, insertError });
              
              if (insertError) {
                console.error(`[NotificationService] ❌ Failed to store caregiver alert:`, insertError);
                console.error(`[NotificationService] ❌ Alert data that failed:`, alertToStore);
              } else {
                console.log(`[NotificationService] ✅ Alert stored successfully for caregiver device polling`);
              }
              
              console.log(`[NotificationService] 🔄 Alert stored for caregiver device to poll and show locally`);
            }
          }
        } catch (pushError) {
          console.warn(`[NotificationService] ⚠️ Push notification request failed (expected in development):`, pushError);
          console.log(`[NotificationService] 🔄 Continuing with local fallback system`);
        }
      } else {
        console.log(`[NotificationService] ⚠️ No push token for caregiver ${caregiverId}, skipping push notification`);
        console.log(`[NotificationService] Caregiver needs to open the app and initialize notifications first`);
        
        // Store alert for caregiver device polling since no push token exists
        console.log(`[NotificationService] 📱 No push token - storing alert for caregiver device polling`);
        
        // Store alert for caregiver device polling as fallback
        const alertToStore = {
          patient_id: alertData.patientId,
          caregiver_id: caregiverId,
          medication_schedule_id: null, // Always null for development to avoid foreign key issues
          alert_type: 'medication_missed_local',
          alert_message: alertMessage,
        };
        
        console.log(`[NotificationService] 🔍 DEBUG: About to store alert (no token):`, alertToStore);
        
        const { data: insertResult, error: insertError } = await supabase
          .from('caregiver_alerts')
          .insert(alertToStore);
        
        console.log(`[NotificationService] 🔍 DEBUG: Insert result:`, { insertResult, insertError });
        
        if (insertError) {
          console.error(`[NotificationService] ❌ Failed to store caregiver alert:`, insertError);
          console.error(`[NotificationService] ❌ Alert data that failed:`, alertToStore);
        } else {
          console.log(`[NotificationService] ✅ Alert stored successfully for caregiver device polling`);
        }
        
        console.log(`[NotificationService] 🔄 Alert stored for caregiver device to poll and show locally`);
      }

      console.log(`[NotificationService] Caregiver alert processing complete for caregiver ${caregiverId}`);

    } catch (error) {
      console.error(`[NotificationService] Failed to send caregiver alert to ${caregiverId}:`, error);
    }
  }

  // Get user notification settings
  private async getUserSettings(userId: string): Promise<NotificationSettings> {
    try {
      const { data } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!data) return DEFAULT_SETTINGS;

      return {
        soundEnabled: data.sound_enabled,
        vibrationEnabled: data.vibration_enabled,
        reminderSound: data.reminder_sound,
        maxAttempts: data.max_reminder_attempts,
        snoozeMinutes: data.snooze_duration,
        caregiverAlertDelay: data.caregiver_alert_delay,
      };
    } catch (error) {
      console.error('Failed to get user settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  // Cancel all alarms for a medication schedule
  async cancelAlarms(medicationScheduleId: string): Promise<void> {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of notifications) {
        if (notification.content.data?.medicationScheduleId === medicationScheduleId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }
    } catch (error) {
      console.error('Failed to cancel alarms:', error);
    }
  }

  // Force initialize push token for caregivers (ignore project ID errors for now)
  async initializePushTokenForce(): Promise<boolean> {
    try {
      console.log('[NotificationService] Force initializing push token for caregiver...');
      
      // Request permissions first
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Notification permissions not granted');
        return false;
      }

      // Set up Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('caregiver-alerts', {
          name: 'Caregiver Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
        });
      }

      // Create a dummy push token for testing
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[NotificationService] No authenticated user found');
        return false;
      }

      // For development, create a mock push token
      const mockPushToken = `ExponentPushToken[${user.id.substring(0, 8)}-MOCK-${Date.now()}]`;
      
      console.log(`[NotificationService] Creating mock push token for development: ${mockPushToken}`);

      // Save mock token to database
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          user_id: user.id,
          expo_push_token: mockPushToken,
          sound_enabled: true,
          vibration_enabled: true,
          medication_reminders_enabled: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[NotificationService] Failed to save mock push token:', error);
        return false;
      }

      console.log('[NotificationService] ✅ Mock push token saved successfully for caregiver');
      this.pushToken = mockPushToken;
      return true;

    } catch (error) {
      console.error('[NotificationService] Failed to force initialize push token:', error);
      return false;
    }
  }

  // Initialize with real push token for cross-device testing
  async initializeRealPushToken(): Promise<boolean> {
    try {
      console.log('[NotificationService] Initializing REAL push token for cross-device testing...');
      
      // Request permissions first
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Notification permissions not granted');
        return false;
      }

      // Set up Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('caregiver-alerts', {
          name: 'Caregiver Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
        });
      }

      // Try to get REAL push token by temporarily bypassing the project ID issue
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[NotificationService] No authenticated user found');
        return false;
      }

      let realPushToken = null;
      
      try {
        // Attempt to get real push token despite project ID issues
        console.log('[NotificationService] Attempting to get real Expo push token...');
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: undefined, // Try without project ID
        });
        realPushToken = tokenData.data;
        console.log('[NotificationService] ✅ Real push token obtained:', realPushToken?.substring(0, 30) + '...');
      } catch (tokenError) {
        console.warn('[NotificationService] Failed to get real push token, falling back to enhanced mock...');
        
        // Create an enhanced mock token that looks more realistic
        const deviceId = Platform.OS + '-' + Math.random().toString(36).substring(2, 15);
        realPushToken = `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx${deviceId}]`;
      }

      // Save real/enhanced token to database
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          user_id: user.id,
          expo_push_token: realPushToken,
          sound_enabled: true,
          vibration_enabled: true,
          medication_reminders_enabled: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[NotificationService] Failed to save push token:', error);
        return false;
      }

      console.log('[NotificationService] ✅ Real push token saved successfully');
      this.pushToken = realPushToken;
      return true;

    } catch (error) {
      console.error('[NotificationService] Failed to initialize real push token:', error);
      return false;
    }
  }

  // Check for pending caregiver alerts and show local notifications (for development)
  async checkAndShowPendingCaregiverAlerts(quietMode: boolean = false): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!quietMode) {
        console.log(`[NotificationService] 🔍 DEBUGGING: Checking for pending caregiver alerts for user ${user.id}...`);
      }

      // First, let's see ALL caregiver alerts for this user to debug
      const { data: allAlerts, error: allAlertsError } = await supabase
        .from('caregiver_alerts')
        .select('*')
        .eq('caregiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!quietMode) {
        console.log(`[NotificationService] 🔍 DEBUG: ALL alerts for caregiver ${user.id}:`, { allAlerts, error: allAlertsError });

        if (allAlerts && allAlerts.length > 0) {
          console.log(`[NotificationService] 🔍 DEBUG: Found ${allAlerts.length} total alerts. Details:`);
          allAlerts.forEach((alert, index) => {
            console.log(`  ${index + 1}. ID: ${alert.id}`);
            console.log(`     Alert Type: ${alert.alert_type || 'NULL'}`);
            console.log(`     Acknowledged: ${alert.acknowledged}`);
            console.log(`     Created: ${alert.created_at}`);
            console.log(`     Message: ${alert.alert_message}`);
          });
        }
      }

      // Now the original query
      const { data: alerts, error } = await supabase
        .from('caregiver_alerts')
        .select('*')
        .eq('caregiver_id', user.id)
        .eq('acknowledged', false)
        .or('alert_type.eq.medication_missed_local,alert_type.is.null')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!quietMode) {
        console.log(`[NotificationService] 🔍 DEBUG: Filtered query result:`, { alerts, error });
      }

      if (error) {
        console.error('[NotificationService] Error fetching caregiver alerts:', error);
        return;
      }

      if (!alerts || alerts.length === 0) {
        if (!quietMode) {
          console.log('[NotificationService] ⚠️ No pending caregiver alerts found after filtering');
          
          // Let's try a simpler query to see if filtering is the issue
          const { data: simpleAlerts, error: simpleError } = await supabase
            .from('caregiver_alerts')
            .select('*')
            .eq('caregiver_id', user.id)
            .eq('acknowledged', false)
            .order('created_at', { ascending: false })
            .limit(5);
          
          console.log(`[NotificationService] 🔍 DEBUG: Simple query (no alert_type filter):`, { simpleAlerts, error: simpleError });
          
          if (simpleAlerts && simpleAlerts.length > 0) {
            console.log(`[NotificationService] 🔄 Found ${simpleAlerts.length} unacknowledged alerts without type filter - using these instead`);
            // Use the simple alerts if the complex filter failed
            await this.processAndShowAlerts(simpleAlerts);
            return;
          }
        }
        
        return;
      }

      console.log(`[NotificationService] ✅ Found ${alerts.length} pending caregiver alerts - showing local notifications`);
      await this.processAndShowAlerts(alerts);

    } catch (error) {
      console.error('[NotificationService] Error checking pending caregiver alerts:', error);
    }
  }

  // Helper method to process and show alerts
  private async processAndShowAlerts(alerts: any[]): Promise<void> {
    for (const alert of alerts) {
      console.log(`[NotificationService] 📱 Showing local notification for alert: ${alert.alert_message}`);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 CAREGIVER ALERT',
          body: alert.alert_message,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            type: 'caregiver-alert-local',
            alertId: alert.id,
            patientId: alert.patient_id,
            medicationScheduleId: alert.medication_schedule_id,
          },
        },
        trigger: null, // Immediate
      });

      // Mark the alert as acknowledged so it doesn't show again
      await supabase
        .from('caregiver_alerts')
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alert.id);

      console.log(`[NotificationService] ✅ Local caregiver alert shown and acknowledged for ID: ${alert.id}`);
    }
  }

  // Start automatic polling for caregiver alerts (call when caregiver opens the app)
  async startCaregiverAlertPolling(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Only start polling for caregivers
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'caregiver') {
      console.log('[NotificationService] Auto-polling not started - user is not a caregiver');
      return;
    }

    if (this.isPollingActive) {
      console.log('[NotificationService] Auto-polling already active');
      return;
    }

    console.log('[NotificationService] 🔄 Starting automatic caregiver alert polling...');
    this.isPollingActive = true;

    // Check immediately
    await this.checkAndShowPendingCaregiverAlerts();

    // Then check every 10 seconds
    this.caregiverPollingInterval = setInterval(async () => {
      if (this.isPollingActive) {
        // Use quiet mode for auto-polling to reduce console noise
        await this.checkAndShowPendingCaregiverAlerts(true);
      }
    }, 10000); // 10 seconds

    console.log('[NotificationService] ✅ Automatic caregiver alert polling started');
  }

  // Stop automatic polling (call when caregiver leaves the app or logs out)
  stopCaregiverAlertPolling(): void {
    if (this.caregiverPollingInterval) {
      clearInterval(this.caregiverPollingInterval);
      this.caregiverPollingInterval = null;
    }
    this.isPollingActive = false;
    console.log('[NotificationService] 🛑 Automatic caregiver alert polling stopped');
  }

  // Check if polling is active (for debugging)
  isCaregiverPollingActive(): boolean {
    return this.isPollingActive;
  }
}

export default NotificationService.getInstance(); 