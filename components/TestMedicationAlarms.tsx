import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Text, Card } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import NotificationService, { MedicationAlarm } from '../services/NotificationService';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

// Simple UUID generator for testing
const generateTestUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const TestMedicationAlarms: React.FC = () => {
  const { user } = useAuth();
  const [isScheduling, setIsScheduling] = useState(false);

  useEffect(() => {
    // Add notification listener to track when notifications actually fire
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      const now = new Date();
      console.log(`[TestAlarms] 🔔 NOTIFICATION RECEIVED at ${now.toISOString()}:`);
      console.log(`   Title: ${notification.request.content.title}`);
      console.log(`   Body: ${notification.request.content.body}`);
      console.log(`   ID: ${notification.request.identifier}`);
      console.log(`   Data:`, notification.request.content.data);
    });

    return () => {
      notificationListener.remove();
    };
  }, []);

  const scheduleTestAlarm = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);

      // Clear any existing scheduled notifications first
      console.log('[TestAlarms] Clearing existing notifications...');
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Create a test alarm for 30 seconds from now
      const testTime = new Date();
      testTime.setSeconds(testTime.getSeconds() + 30);

      // Generate proper UUIDs for test data
      const testScheduleId = generateTestUUID();
      const testAlarmId = generateTestUUID();
      const testMedicationId = generateTestUUID();

      // Create a real medication first
      console.log('[TestAlarms] Creating test medication in database...');
      const { data: medicationData, error: medicationError } = await supabase
        .from('medications')
        .insert({
          id: testMedicationId,
          user_id: user.id,
          patient_id: user.id,
          name: 'Test Medication',
          dosage: '1 tablet',
          frequency: 'As needed for testing',
          instructions: 'Test medication for alarm system testing',
          start_date: new Date().toISOString().split('T')[0],
        });

      if (medicationError) {
        console.error('[TestAlarms] Failed to create test medication:', medicationError);
        Alert.alert('Error', `Failed to create test medication: ${medicationError.message}`);
        return;
      }

      console.log('[TestAlarms] Test medication created successfully:', medicationData);

      // Create a real medication schedule in the database for testing
      console.log('[TestAlarms] Creating test medication schedule in database...');
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('medication_schedules')
        .insert({
          id: testScheduleId,
          user_id: user.id,
          medication_id: testMedicationId,
          scheduled_time: '16:00:00',
          days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        });

      if (scheduleError) {
        console.error('[TestAlarms] Failed to create test medication schedule:', scheduleError);
        Alert.alert('Error', `Failed to create test medication schedule: ${scheduleError.message}`);
        return;
      }

      console.log('[TestAlarms] Test medication schedule created successfully:', scheduleData);

      const testAlarm: MedicationAlarm = {
        id: testAlarmId,
        patientId: user.id,
        medicationScheduleId: testScheduleId,
        medicationName: 'Test Medication',
        scheduledTime: testTime,
        attempt: 1,
      };

      console.log('[TestAlarms] Starting test alarm scheduling...');
      console.log('[TestAlarms] Test alarm data:', testAlarm);
      console.log('[TestAlarms] Current time:', new Date().toISOString());
      console.log('[TestAlarms] Target time:', testTime.toISOString());

      // Use test mode for quick 5-second intervals instead of 5-minute intervals
      await NotificationService.scheduleMedicationAlarms(testAlarm, true);
      
      console.log('[TestAlarms] Test alarm scheduled successfully');

      // Debug: Check what notifications are actually scheduled
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log('[TestAlarms] 🔍 DEBUG - Currently scheduled notifications:');
      scheduledNotifications.forEach((notification, index) => {
        const trigger = notification.trigger as any;
        console.log(`  ${index + 1}. ID: ${notification.identifier}`);
        console.log(`     Trigger: ${JSON.stringify(trigger)}`);
        console.log(`     Title: ${notification.content.title}`);
      });
      
      Alert.alert(
        'Test Alarm Scheduled! 🎯', 
        `✅ 3-Step Alarm System Activated!\n\n📱 Patient Notifications:\n• 1st alarm: 30 seconds\n• 2nd alarm: 40 seconds (10s later)\n• 3rd alarm: 50 seconds (20s later)\n\n👥 Caregiver Alert:\n• Auto-alert: 60 seconds (30s later)\n\n🔔 Watch for notifications every 10 seconds!\n\nCheck console for detailed schedule info.`
      );

      // Clean up test medication schedule after 2 minutes (after all alarms are done)
      setTimeout(async () => {
        console.log('[TestAlarms] Cleaning up test data...');
        
        // Delete schedule first (due to foreign key constraint)
        const { error: deleteScheduleError } = await supabase
          .from('medication_schedules')
          .delete()
          .eq('id', testScheduleId);
        
        if (deleteScheduleError) {
          console.error('[TestAlarms] Failed to cleanup test medication schedule:', deleteScheduleError);
        } else {
          console.log('[TestAlarms] ✅ Test medication schedule cleaned up successfully');
        }

        // Delete medication
        const { error: deleteMedicationError } = await supabase
          .from('medications')
          .delete()
          .eq('id', testMedicationId);
        
        if (deleteMedicationError) {
          console.error('[TestAlarms] Failed to cleanup test medication:', deleteMedicationError);
        } else {
          console.log('[TestAlarms] ✅ Test medication cleaned up successfully');
        }
      }, 120000); // 2 minutes

    } catch (error) {
      console.error('[TestAlarms] Failed to schedule test alarm:', error);
      Alert.alert('Error', `Failed to schedule test alarm: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleSimpleTest = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);
      console.log('[TestAlarms] Clearing existing notifications...');
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      console.log('[TestAlarms] Scheduling simple test notification...');

      // Schedule a simple test notification in 10 seconds
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🧪 Simple Test Notification',
          body: 'This is a test notification to verify local notifications work!',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          seconds: 10,
        },
      });

      Alert.alert(
        'Simple Test Scheduled! ⏰',
        'You will receive a test notification in 10 seconds. This tests local notifications without push tokens.'
      );

    } catch (error) {
      console.error('[TestAlarms] Failed to schedule simple test:', error);
      Alert.alert('Error', `Failed to schedule simple test: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleStaggeredTest = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);
      console.log('[TestAlarms] Starting staggered test...');
      await Notifications.cancelAllScheduledNotificationsAsync();

      const now = Date.now();

      // Schedule 4 individual notifications with 10-second intervals
      const notifications = [
        { delay: 10, title: '🔔 Test 1', body: 'First notification (10s)' },
        { delay: 20, title: '🔔 Test 2', body: 'Second notification (20s)' },
        { delay: 30, title: '🔔 Test 3', body: 'Third notification (30s)' },
        { delay: 40, title: '🔔 Test 4', body: 'Fourth notification (40s)' },
      ];

      for (const notif of notifications) {
        console.log(`[TestAlarms] Scheduling ${notif.title} for ${notif.delay} seconds from now`);
        
        await Notifications.scheduleNotificationAsync({
          identifier: `staggered-test-${notif.delay}`,
          content: {
            title: notif.title,
            body: notif.body,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            seconds: notif.delay,
          },
        });

        console.log(`[TestAlarms] ✅ ${notif.title} scheduled successfully`);
      }

      // Debug: Check scheduled notifications
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      console.log('[TestAlarms] 🔍 Staggered test - scheduled notifications:');
      scheduled.forEach((notification, index) => {
        const trigger = notification.trigger as any;
        console.log(`  ${index + 1}. ${notification.content.title} - Trigger: ${JSON.stringify(trigger)}`);
      });

      Alert.alert(
        'Staggered Test Scheduled! ⏰',
        'You will receive 4 notifications:\n• 10s: Test 1\n• 20s: Test 2\n• 30s: Test 3\n• 40s: Test 4\n\nWatch the console for timing details!'
      );

    } catch (error) {
      console.error('[TestAlarms] Failed to schedule staggered test:', error);
      Alert.alert('Error', `Failed to schedule staggered test: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleDateBasedTest = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);
      console.log('[TestAlarms] Starting date-based test...');
      await Notifications.cancelAllScheduledNotificationsAsync();

      const now = new Date();
      console.log(`[TestAlarms] Current time: ${now.toISOString()}`);

      // Schedule 4 notifications using Date objects instead of seconds
      const notifications = [
        { delay: 10, title: '📅 Date Test 1', body: 'First date notification (10s)' },
        { delay: 20, title: '📅 Date Test 2', body: 'Second date notification (20s)' },
        { delay: 30, title: '📅 Date Test 3', body: 'Third date notification (30s)' },
        { delay: 40, title: '📅 Date Test 4', body: 'Fourth date notification (40s)' },
      ];

      for (const notif of notifications) {
        const triggerDate = new Date(now.getTime() + (notif.delay * 1000));
        console.log(`[TestAlarms] Scheduling ${notif.title} for ${triggerDate.toISOString()} (${notif.delay}s from now)`);
        
        await Notifications.scheduleNotificationAsync({
          identifier: `date-test-${notif.delay}`,
          content: {
            title: notif.title,
            body: notif.body,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            date: triggerDate, // Using date instead of seconds
          },
        });

        console.log(`[TestAlarms] ✅ ${notif.title} scheduled for ${triggerDate.toISOString()}`);
      }

      // Debug: Check scheduled notifications
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      console.log('[TestAlarms] 🔍 Date-based test - scheduled notifications:');
      scheduled.forEach((notification, index) => {
        const trigger = notification.trigger as any;
        console.log(`  ${index + 1}. ${notification.content.title} - Trigger: ${JSON.stringify(trigger)}`);
      });

      Alert.alert(
        'Date-Based Test Scheduled! 📅',
        'Testing with Date objects instead of seconds.\n\nYou should receive 4 notifications:\n• 10s: Date Test 1\n• 20s: Date Test 2\n• 30s: Date Test 3\n• 40s: Date Test 4'
      );

    } catch (error) {
      console.error('[TestAlarms] Failed to schedule date-based test:', error);
      Alert.alert('Error', `Failed to schedule date-based test: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleImmediateTest = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);
      console.log('[TestAlarms] Starting immediate test...');
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Test immediate notifications with trigger: null
      console.log('[TestAlarms] Scheduling immediate notification with trigger: null');
      
      await Notifications.scheduleNotificationAsync({
        identifier: 'immediate-test',
        content: {
          title: '⚡ Immediate Test',
          body: 'This should fire immediately with trigger: null',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // This should fire immediately
      });

      console.log('[TestAlarms] ✅ Immediate notification scheduled');

      Alert.alert(
        'Immediate Test Scheduled! ⚡',
        'This notification should appear immediately.\n\nIf this works, the issue is with delayed triggers.'
      );

    } catch (error) {
      console.error('[TestAlarms] Failed to schedule immediate test:', error);
      Alert.alert('Error', `Failed to schedule immediate test: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const checkCaregiverConnections = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Checking caregiver connections...');
      
      // Check all connections for this user
      const { data: connections, error } = await supabase
        .from('patient_caregiver_connections')
        .select('*')
        .eq('patient_id', user.id);

      console.log('[TestAlarms] Patient connections:', { connections, error });
      
      if (error) {
        Alert.alert('Database Error', error.message);
        return;
      }

      const activeConnections = connections?.filter(c => c.connection_status === 'active') || [];
      
      Alert.alert(
        'Connection Status',
        `Found ${connections?.length || 0} total connections\n${activeConnections.length} active connections\n\nCheck console logs for details.`
      );

    } catch (error: any) {
      console.error('[TestAlarms] Error checking connections:', error);
      Alert.alert('Error', `Failed to check connections: ${error.message}`);
    }
  };

  const initializeNotificationsManually = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Manually initializing notification service...');
      
      // Import and initialize the notification service
      const success = await NotificationService.initialize();
      
      if (success) {
        Alert.alert(
          'Notifications Initialized! ✅',
          'Push token has been saved. Caregiver alerts should now work properly.\n\nIf you are the caregiver, you should now receive notifications on this device.'
        );
      } else {
        Alert.alert(
          'Initialization Failed ❌',
          'Could not initialize notifications. Please check permissions and try again.'
        );
      }
      
    } catch (error: any) {
      console.error('[TestAlarms] Error initializing notifications:', error);
      Alert.alert('Error', `Failed to initialize: ${error.message}`);
    }
  };

  const checkNotificationSettings = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Checking notification settings for user:', user.id);
      
      // Check current user's notification settings
      const { data: settings, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      console.log('[TestAlarms] User notification settings:', { settings, error });
      
      if (error && error.code !== 'PGRST116') {
        Alert.alert('Database Error', error.message);
        return;
      }

      const hasToken = settings?.expo_push_token ? 'Yes' : 'No';
      const tokenPreview = settings?.expo_push_token ? settings.expo_push_token.substring(0, 20) + '...' : 'None';
      
      Alert.alert(
        'Notification Settings',
        `User ID: ${user.id}\nEmail: ${user.email}\nRole: ${user.role}\n\nHas Push Token: ${hasToken}\nToken Preview: ${tokenPreview}\n\nCheck console for full details.`
      );

    } catch (error: any) {
      console.error('[TestAlarms] Error checking notification settings:', error);
      Alert.alert('Error', `Failed to check settings: ${error.message}`);
    }
  };

  const forceCaregiverSetup = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Force setting up caregiver notifications...');
      
      const success = await NotificationService.initializePushTokenForce();
      
      if (success) {
        Alert.alert(
          'Caregiver Setup Complete! ✅',
          `Mock push token created for development.\n\nUser: ${user.email}\nRole: ${user.role}\n\nCaregivers should now receive alerts when patients miss medications.`
        );
      } else {
        Alert.alert(
          'Setup Failed ❌',
          'Could not set up caregiver notifications. Check console logs for details.'
        );
      }
      
    } catch (error: any) {
      console.error('[TestAlarms] Error setting up caregiver notifications:', error);
      Alert.alert('Error', `Setup failed: ${error.message}`);
    }
  };

  const initializeRealPushToken = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Initializing real push token...');
      
      const success = await NotificationService.initializeRealPushToken();
      
      if (success) {
        Alert.alert(
          'Real Push Token Setup! 🚀',
          `Real/Enhanced push token created.\n\nUser: ${user.email}\nRole: ${user.role}\n\nThis device can now receive notifications from other devices.`
        );
      } else {
        Alert.alert(
          'Setup Failed ❌',
          'Could not set up real push token. Check console logs for details.'
        );
      }
      
    } catch (error: any) {
      console.error('[TestAlarms] Error setting up real push token:', error);
      Alert.alert('Error', `Setup failed: ${error.message}`);
    }
  };

  const checkPendingAlerts = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      console.log('[TestAlarms] Checking for pending caregiver alerts...');
      
      await NotificationService.checkAndShowPendingCaregiverAlerts();
      
      Alert.alert(
        'Alert Check Complete ✅',
        `Checked for pending caregiver alerts.\n\nUser: ${user.email}\nRole: ${user.role}\n\nAny pending alerts should now appear as local notifications on this device.\n\nCheck console for details.`
      );
      
    } catch (error: any) {
      console.error('[TestAlarms] Error checking pending alerts:', error);
      Alert.alert('Error', `Failed to check alerts: ${error.message}`);
    }
  };

  const checkPollingStatus = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      const isActive = NotificationService.isCaregiverPollingActive();
      
      Alert.alert(
        'Auto-Polling Status 🔄',
        `Automatic caregiver alert polling is currently: ${isActive ? '✅ ACTIVE' : '❌ INACTIVE'}\n\nUser: ${user.email}\nRole: ${user.role}\n\n${isActive ? 'Caregiver alerts will appear automatically every 10 seconds.' : 'You need to manually check for alerts.'}`
      );
      
    } catch (error: any) {
      console.error('[TestAlarms] Error checking polling status:', error);
      Alert.alert('Error', `Failed to check polling status: ${error.message}`);
    }
  };

  const testAutomatedSystem = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      setIsScheduling(true);
      console.log('[TestAlarms] Testing automated regular notification -> escalation system...');
      await Notifications.cancelAllScheduledNotificationsAsync();

      // Import the notification utils
      const { scheduleLocalNotification } = await import('../src/utils/notificationUtils');

      // Schedule a regular medication notification that will automatically trigger escalation
      const testMedicationId = generateTestUUID();
      const testTime = '20:00'; // 8 PM format

      console.log(`[TestAlarms] Scheduling regular medication notification for immediate delivery...`);

      // Schedule for 10 seconds from now
      const notificationId = await scheduleLocalNotification(
        'Medication Reminder: Test Auto-Escalation Med',
        'Time to take your Test Auto-Escalation Med.',
        10, // 10 seconds
        {
          medicationId: testMedicationId,
          scheduleTime: testTime,
        }
      );

      if (notificationId) {
        Alert.alert(
          'Automated System Test Scheduled! 🤖',
          `✅ Testing Complete Automation!\n\n📱 What will happen:\n• 10s: Regular medication notification\n• 2m 10s: Automatic escalation check\n• If not marked as taken → 3-alarm sequence starts\n\n🔔 3-Alarm Timing (if triggered):\n• 1st alarm: immediately\n• 2nd alarm: +10 seconds\n• 3rd alarm: +20 seconds\n• Caregiver alert: +30 seconds\n\n🎯 This simulates the real patient experience!\n\nDon't mark the medication as taken to see escalation.`
        );
        console.log(`[TestAlarms] ✅ Automated system test scheduled with notification ID: ${notificationId}`);
      } else {
        Alert.alert('Error', 'Failed to schedule automated test');
      }

    } catch (error) {
      console.error('[TestAlarms] Failed to test automated system:', error);
      Alert.alert('Error', `Failed to test automated system: ${error.message || 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  if (!user) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>Test Medication Alarms</Text>
          <Text style={styles.subtitle}>Please log in to test the alarm system</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.title}>🧪 Test Medication Alarms</Text>
        <Text style={styles.subtitle}>
          Test the notification system with different options
        </Text>
        
        <Button
          mode="contained"
          onPress={scheduleSimpleTest}
          loading={isScheduling}
          disabled={isScheduling}
          style={[styles.button, { marginBottom: 8 }]}
          icon="bell-outline"
        >
          {isScheduling ? 'Scheduling...' : 'Simple Test (10s)'}
        </Button>

        <Button
          mode="outlined"
          onPress={testAutomatedSystem}
          loading={isScheduling}
          disabled={isScheduling}
          style={[styles.button, { marginBottom: 8 }]}
          icon="robot"
        >
          {isScheduling ? 'Testing...' : 'Test Automated System (Complete Flow)'}
        </Button>

        <Button
          mode="outlined"
          onPress={scheduleTestAlarm}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="alarm"
        >
          {isScheduling ? 'Scheduling...' : 'Full Alarm System (30s)'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={scheduleStaggeredTest}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Scheduling...' : 'Staggered Test'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={scheduleDateBasedTest}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Scheduling...' : 'Date-Based Test'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={scheduleImmediateTest}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Scheduling...' : 'Immediate Test'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={checkCaregiverConnections}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="account-group"
        >
          {isScheduling ? 'Checking...' : 'Check Caregiver Connections'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={initializeNotificationsManually}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Initializing...' : 'Initialize Notifications Manually'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={checkNotificationSettings}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="cog"
        >
          {isScheduling ? 'Checking...' : 'Check Notification Settings'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={forceCaregiverSetup}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Setting up...' : 'Force Caregiver Setup'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={initializeRealPushToken}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Setting up...' : 'Initialize Real Push Token'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={checkPendingAlerts}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="bell-outline"
        >
          {isScheduling ? 'Checking...' : 'Check Pending Alerts'}
        </Button>
        
        <Button
          mode="outlined"
          onPress={checkPollingStatus}
          loading={isScheduling}
          disabled={isScheduling}
          style={styles.button}
          icon="radar"
        >
          {isScheduling ? 'Checking...' : 'Check Auto-Polling Status'}
        </Button>
        
        <Text style={styles.note}>
          📱 Try "Test Automated System" to see the complete patient experience: regular notification → automatic escalation → caregiver alerts
        </Text>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16,
    borderRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    marginVertical: 12,
    borderRadius: 8,
  },
  note: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default TestMedicationAlarms; 