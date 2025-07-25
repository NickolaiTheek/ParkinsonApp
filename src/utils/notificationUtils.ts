import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Direct imports instead of dynamic imports to avoid module loading issues
import NotificationService from '../../services/NotificationService';
import { handleNotificationResponse } from '../../services/MedicationAlarmHandler';

// Set the notification handler for how notifications should be handled when the app is active
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Check if this is an escalation check notification
    if (notification.request.content.data?.type === 'escalation-check') {
      // Auto-handle escalation checks silently
      console.log('[notificationUtils] 🔍 Auto-handling escalation check notification silently');
      
      // Import and handle the escalation check immediately
      try {
        await handleNotificationResponse({
          notification,
          actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
        } as any);
      } catch (error) {
        console.error('[notificationUtils] Error auto-handling escalation check:', error);
      }
      
      // Don't show this notification to the user
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    // Handle regular notifications normally
    if (Platform.OS === 'android') {
      return {
        shouldShowBanner: true, // Use banner for Android
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    } else {
      // For iOS and other platforms (if any)
      return {
        shouldShowAlert: true, // Keeps existing behavior for iOS
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    }
  },
});

/**
 * Requests notification permissions from the user.
 * For iOS, this will prompt the user.
 * For Android, permissions are often granted by default but this ensures they are checked.
 * On Android 13+, explicit permission is required.
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  console.log('[notificationUtils.ts] requestNotificationPermissions function started');

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permissions not granted. Status:', finalStatus);
    // Optionally, inform the user that they need to enable notifications in settings
    return false;
  }
  console.log('Notification permissions granted.');

  // For Android, ensure a notification channel is set up if using custom sounds or other channel-specific features
  // For basic local notifications, a default channel is often sufficient.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default', // The user-visible name of the channel
      importance: Notifications.AndroidImportance.MAX, // The importance of the channel
      vibrationPattern: [0, 250, 250, 250], // Vibration pattern
      lightColor: '#FF231F7C', // Color of the notification light (if device supports it)
    });
    console.log('Default Android notification channel set.');
  }

  return true;
};

/**
 * Schedules a local notification.
 * @param title The title of the notification.
 * @param body The body text of the notification.
 * @param secondsUntilTrigger The number of seconds until the notification should trigger.
 * @param data Optional data to pass with the notification.
 * @param triggerOverride Optional trigger override. If provided, use it; otherwise, default to the seconds-based trigger.
 */
export const scheduleLocalNotification = async (
  title: string,
  body: string,
  secondsUntilTrigger: number,
  data: Record<string, any> = {},
  triggerOverride: Notifications.NotificationTriggerInput | null = undefined
): Promise<string | null> => {
  try {
    console.log(
      `[notificationUtils.ts] scheduleLocalNotification called with title: ${title}, body: ${body}, secondsUntilTrigger: ${secondsUntilTrigger}, data:`,
      data,
      `triggerOverride:`, triggerOverride
    );

    // Use triggerOverride if provided, otherwise default to seconds-based trigger
    const triggerInput: Notifications.NotificationTriggerInput | null = 
      triggerOverride !== undefined ? triggerOverride : { seconds: secondsUntilTrigger };

    console.log(
      `[notificationUtils.ts] Scheduling notification "${title}" with trigger:`, triggerInput
    );

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default', // Play the default notification sound
      },
      trigger: triggerInput, // Use the determined triggerInput
    });
    console.log(
      `[notificationUtils.ts] Notification scheduled successfully with ID: ${notificationId}`
    );

    // 🚀 NEW: Auto-schedule escalation check for medication reminders
    if (data.medicationId && title.includes('Medication Reminder')) {
      console.log(`[notificationUtils] 🔄 Scheduling automatic escalation check for medication notification`);
      
      // Schedule escalation check 2 minutes after the original notification
      // This gives the patient time to see and respond to the initial notification
      const escalationCheckDelay = secondsUntilTrigger + 120; // +2 minutes
      
      await Notifications.scheduleNotificationAsync({
        identifier: `escalation-check-${notificationId}`,
        content: {
          title: '🔍 Checking Medication Response',
          body: `Checking if medication was taken...`,
          data: {
            type: 'escalation-check',
            originalNotificationId: notificationId,
            medicationId: data.medicationId,
            medicationName: extractMedicationName(title),
            scheduleTime: data.scheduleTime,
            checkOnly: true, // This is just a check, not a user-facing notification
          },
        },
        trigger: {
          seconds: Math.max(1, Math.round(escalationCheckDelay)),
          repeats: false,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });
      
      console.log(`[notificationUtils] ✅ Escalation check scheduled for ${escalationCheckDelay} seconds from now`);
    }

    return notificationId;
  } catch (error) {
    console.error(
      '[notificationUtils.ts] Error scheduling notification:',
      error
    );
    return null;
  }
};

// Helper function to extract medication name from notification title
const extractMedicationName = (title: string): string => {
  // Extract from "Medication Reminder: [Name]" format
  const match = title.match(/Medication Reminder:\s*(.+)/);
  return match ? match[1] : 'Unknown Medication';
};

/**
 * Cancels a scheduled local notification.
 * @param notificationId The identifier of the notification to cancel.
 */
export const cancelScheduledNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('[cancelScheduledNotification] Notification cancelled:', notificationId);
  } catch (error) {
    console.error('[cancelScheduledNotification] Error cancelling notification:', error);
  }
};

/**
 * Cancels all scheduled local notifications.
 */
export const cancelAllScheduledNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[cancelAllScheduledNotifications] All notifications cancelled.');
  } catch (error) {
    console.error('[cancelAllScheduledNotifications] Error cancelling all notifications:', error);
  }
}; 