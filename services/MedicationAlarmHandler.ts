import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import NotificationService, { MedicationAlarm } from './NotificationService';

// Make TaskManager optional for better compatibility
let TaskManager: any;
try {
  TaskManager = require('expo-task-manager');
} catch (error) {
  console.warn('TaskManager not available, background processing disabled');
}

const MEDICATION_CHECK_TASK = 'medication-response-check';

// Define background task for checking medication responses (only if TaskManager available)
if (TaskManager) {
  TaskManager.defineTask(MEDICATION_CHECK_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error('Background task error:', error);
      return;
    }

    try {
      await checkMissedMedications();
    } catch (error) {
      console.error('Error in background medication check:', error);
    }
  });
}

// Global variable to track ongoing escalations (prevent race conditions)
const ongoingEscalations = new Set<string>();

// Check for medications that haven't been taken after 3 alarms
async function checkMissedMedications(): Promise<void> {
  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - (15 * 60 * 1000));

    // Find alarm sequences where 3rd alarm was sent but patient hasn't responded
    const { data: missedAlarms } = await supabase
      .from('medication_alarms')
      .select(`
        *,
        medication_schedules!inner(
          id,
          medications!inner(name)
        )
      `)
      .eq('alarm_attempt', 3)
      .eq('patient_responded', false)
      .eq('caregiver_alerted', false)
      .lt('alarm_sent_at', fifteenMinutesAgo.toISOString());

    if (!missedAlarms || missedAlarms.length === 0) {
      return;
    }

    // Alert caregivers for each missed medication
    for (const alarm of missedAlarms) {
      const medicationAlarm: MedicationAlarm = {
        id: alarm.id,
        patientId: alarm.patient_id,
        medicationScheduleId: alarm.medication_schedule_id,
        medicationName: alarm.medication_schedules.medications.name,
        scheduledTime: new Date(alarm.scheduled_time),
        attempt: 3,
      };

      await NotificationService.alertCaregivers(medicationAlarm);
    }

  } catch (error) {
    console.error('Error checking missed medications:', error);
  }
}

// Handle notification responses (when patient taps notification)
export async function handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
  const { notification } = response;
  const data = notification.request.content.data;

  console.log(`[MedicationAlarmHandler] 🔔 Handling notification response:`, {
    type: data?.type,
    actionIdentifier: response.actionIdentifier,
    data: data
  });

  if (data?.type === 'escalation-check') {
    // 🚀 NEW: Handle automatic escalation checks
    await handleEscalationCheck(data);
  } else if (data?.type === 'medication-alarm') {
    const { medicationScheduleId, action } = data;

    switch (response.actionIdentifier) {
      case 'MARK_TAKEN':
        await NotificationService.markMedicationTaken(medicationScheduleId);
        break;
      
      case 'SNOOZE':
        await snoozeAlarm(medicationScheduleId, 5); // 5 minute snooze
        break;
      
      case Notifications.DEFAULT_ACTION_IDENTIFIER:
        // User tapped the notification itself
        // This could open the medication screen
        break;
    }
  } else if (data?.type === 'caregiver-alert') {
    // Handle caregiver alert responses
    await handleCaregiverResponse(data, response.actionIdentifier);
  }
}

// 🚀 NEW: Handle escalation check notifications
async function handleEscalationCheck(data: any): Promise<void> {
  try {
    console.log(`[MedicationAlarmHandler] 🔍 Processing escalation check for medication: ${data.medicationName}`);
    
    const { medicationId, medicationName, scheduleTime, originalNotificationId } = data;
    
    // Create a unique key for this escalation to prevent duplicates
    const escalationKey = `${medicationId}-${scheduleTime}`;
    
    // Check if this escalation is already being processed
    if (ongoingEscalations.has(escalationKey)) {
      console.log(`[MedicationAlarmHandler] ⏭️ Escalation already in progress for ${medicationName} - skipping duplicate`);
      return;
    }
    
    // Mark this escalation as in progress
    ongoingEscalations.add(escalationKey);
    
    // Auto-remove from set after 2 minutes to prevent permanent blocking
    setTimeout(() => {
      ongoingEscalations.delete(escalationKey);
    }, 120000);
    
    // Check if medication was taken by looking for recent administration logs
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[MedicationAlarmHandler] No authenticated user for escalation check');
      ongoingEscalations.delete(escalationKey);
      return;
    }

    // Look for medication logs in the last 5 minutes (extended window for testing)
    const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000));
    
    const { data: recentLogs, error: logError } = await supabase
      .from('medication_administration_logs')
      .select('status, taken_at')
      .eq('medication_id', medicationId)
      .eq('user_id', user.id)
      .eq('status', 'taken')
      .gte('taken_at', fiveMinutesAgo.toISOString())
      .order('taken_at', { ascending: false })
      .limit(1);

    if (logError) {
      console.error('[MedicationAlarmHandler] Error checking medication logs:', logError);
      // Proceed with escalation on error to be safe
    }

    if (recentLogs && recentLogs.length > 0) {
      console.log(`[MedicationAlarmHandler] ✅ Medication ${medicationName} was taken recently - no escalation needed`);
      console.log(`[MedicationAlarmHandler] Last taken at: ${recentLogs[0].taken_at}`);
      ongoingEscalations.delete(escalationKey);
      return;
    }

    console.log(`[MedicationAlarmHandler] ⚠️ No recent logs found for ${medicationName} - triggering escalation`);
    
    // Calculate the original scheduled time
    const originalTime = new Date();
    if (scheduleTime) {
      const [hours, minutes] = scheduleTime.split(':').map(Number);
      originalTime.setHours(hours, minutes, 0, 0);
    }
    
    // Trigger the escalation system directly
    await triggerEscalationDirectly(medicationId, medicationName, originalTime, user.id);
    
    console.log(`[MedicationAlarmHandler] ✅ Escalation triggered for missed ${medicationName}`);
    
    // Remove from ongoing set after successful escalation
    ongoingEscalations.delete(escalationKey);
    
  } catch (error) {
    console.error('[MedicationAlarmHandler] Error in escalation check:', error);
    // Clean up on error
    const escalationKey = `${data.medicationId}-${data.scheduleTime}`;
    ongoingEscalations.delete(escalationKey);
  }
}

// Local escalation function to avoid circular imports
async function triggerEscalationDirectly(medicationId: string, medicationName: string, scheduledTime: Date, userId: string) {
  try {
    console.log(`[MedicationAlarmHandler] 🚨 Triggering escalation for missed ${medicationName} at ${scheduledTime.toISOString()}`);
    
    // Use CURRENT TIME as the starting point for escalation, not the original scheduled time
    const now = new Date();
    
    // Create a medication alarm for the escalation system
    const escalationAlarm: MedicationAlarm = {
      id: `escalation-${medicationId}-${now.getTime()}`,
      patientId: userId,
      medicationScheduleId: medicationId, // Use medication ID as schedule ID for now
      medicationName: medicationName,
      scheduledTime: now, // Start escalation from current time, not past scheduled time
      attempt: 1,
    };
    
    console.log(`[MedicationAlarmHandler] Starting 3-alarm escalation sequence for ${medicationName} from current time`);
    
    // Start the 3-alarm escalation system immediately (in test mode for quick escalation)
    await NotificationService.scheduleMedicationAlarms(escalationAlarm, true);
    
    console.log(`[MedicationAlarmHandler] ✅ Escalation system activated for ${medicationName}`);
    
  } catch (error) {
    console.error(`[MedicationAlarmHandler] ❌ Failed to trigger escalation:`, error);
  }
}

// Snooze alarm for specified minutes
async function snoozeAlarm(medicationScheduleId: string, minutes: number): Promise<void> {
  try {
    const snoozeTime = new Date(Date.now() + (minutes * 60 * 1000));
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💊 Medication Reminder (Snoozed)',
        body: 'Time to take your medication',
        sound: 'default',
        data: {
          type: 'medication-alarm',
          medicationScheduleId,
          snoozed: true,
        },
      },
      trigger: {
        date: snoozeTime,
      },
    });

    console.log(`Medication alarm snoozed for ${minutes} minutes`);
  } catch (error) {
    console.error('Failed to snooze alarm:', error);
  }
}

// Handle caregiver response to alerts
async function handleCaregiverResponse(data: any, actionIdentifier: string): Promise<void> {
  try {
    switch (actionIdentifier) {
      case 'CALL_PATIENT':
        // This would trigger a phone call or open calling app
        console.log('Caregiver wants to call patient');
        break;
      
      case 'MARK_TAKEN':
        // Caregiver marks medication as taken on behalf of patient
        await NotificationService.markMedicationTaken(data.medicationScheduleId);
        
        // Log caregiver intervention
        await supabase
          .from('caregiver_alerts')
          .update({
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('medication_schedule_id', data.medicationScheduleId)
          .eq('acknowledged', false);
        break;
      
      case 'EMERGENCY':
        // This could trigger emergency protocols
        console.log('Caregiver marked as emergency situation');
        await handleEmergencyResponse(data);
        break;
    }
  } catch (error) {
    console.error('Error handling caregiver response:', error);
  }
}

// Handle emergency response
async function handleEmergencyResponse(data: any): Promise<void> {
  try {
    // Log emergency situation
    await supabase
      .from('caregiver_alerts')
      .insert({
        patient_id: data.patientId,
        caregiver_id: data.caregiverId,
        medication_schedule_id: null, // Always null to avoid foreign key issues
        alert_type: 'emergency',
        alert_message: 'Emergency response triggered by caregiver',
      });

    // Could trigger additional emergency protocols here
    // - Contact additional emergency contacts
    // - Send location information
    // - Alert medical services
    
  } catch (error) {
    console.error('Error handling emergency response:', error);
  }
}

// Initialize notification categories with actions
export async function initializeNotificationCategories(): Promise<void> {
  try {
    // Medication reminder category with actions
    await Notifications.setNotificationCategoryAsync('medication-reminder', [
      {
        identifier: 'MARK_TAKEN',
        buttonTitle: '✅ Taken',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'SNOOZE',
        buttonTitle: '⏰ Snooze 5min',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);

    // Caregiver alert category with actions
    await Notifications.setNotificationCategoryAsync('caregiver-alert', [
      {
        identifier: 'CALL_PATIENT',
        buttonTitle: '📞 Call',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'MARK_TAKEN',
        buttonTitle: '✅ Mark Taken',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'EMERGENCY',
        buttonTitle: '🚨 Emergency',
        options: {
          opensAppToForeground: true,
        },
      },
    ]);

    console.log('Notification categories initialized');
  } catch (error) {
    console.error('Failed to initialize notification categories:', error);
  }
}

// Start background task for checking medication responses
export async function startMedicationMonitoring(): Promise<void> {
  try {
    if (!TaskManager) {
      console.log('TaskManager not available, skipping background monitoring setup');
      return;
    }

    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(MEDICATION_CHECK_TASK);
    console.log(`[MedicationAlarmHandler] Task ${MEDICATION_CHECK_TASK} is registered:`, isRegistered);
    
    if (!isRegistered) {
      console.log(`[MedicationAlarmHandler] Task not registered, but TaskManager.defineTask should have already defined it`);
    }

    console.log('Medication monitoring setup completed (using defineTask)');
  } catch (error) {
    console.error('Failed to start medication monitoring:', error);
  }
}

// Stop background monitoring
export async function stopMedicationMonitoring(): Promise<void> {
  try {
    if (!TaskManager) {
      console.log('TaskManager not available, skipping background monitoring cleanup');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(MEDICATION_CHECK_TASK);
    if (isRegistered) {
      await TaskManager.unregisterTaskAsync(MEDICATION_CHECK_TASK);
    }
  } catch (error) {
    console.error('Failed to stop medication monitoring:', error);
  }
}

export default {
  handleNotificationResponse,
  initializeNotificationCategories,
  startMedicationMonitoring,
  stopMedicationMonitoring,
  checkMissedMedications,
}; 