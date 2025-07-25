import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { Theme } from './theme';
import { securityCleanupService } from './services/SecurityCleanupService';
import { en, registerTranslation } from 'react-native-paper-dates';
import { requestNotificationPermissions } from './src/utils/notificationUtils';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';

// Import our new notification services
import NotificationService from './services/NotificationService';
import MedicationAlarmHandler from './services/MedicationAlarmHandler';

export default function App() {
  registerTranslation('en', en);
  
  useEffect(() => {
    console.log('[App.tsx] useEffect triggered. Setting up security service and notification permissions.');
    
    // Initialize app services
    const initializeApp = async () => {
      try {
        // Start security cleanup service
        securityCleanupService.start();

        // Initialize notification system
        console.log('[App.tsx] Initializing notification system...');
        const notificationPermissions = await requestNotificationPermissions();
        
        if (notificationPermissions) {
          console.log('[App.tsx] Notification permissions granted.');
          
          // Initialize notification service - this will get and save push token
          const initSuccess = await NotificationService.initialize();
          console.log('[App.tsx] NotificationService.initialize() result:', initSuccess);
          
          if (initSuccess) {
            // Initialize notification categories (action buttons)
            await MedicationAlarmHandler.initializeNotificationCategories();
            
            // Start medication monitoring background task
            await MedicationAlarmHandler.startMedicationMonitoring();
            
            // Set up notification response handler
            Notifications.addNotificationResponseReceivedListener(
              MedicationAlarmHandler.handleNotificationResponse
            );

            // 🚀 NEW: Add notification received listener for escalation checks
            Notifications.addNotificationReceivedListener(async (notification) => {
              if (notification.request.content.data?.type === 'escalation-check') {
                console.log('[App.tsx] 🔍 Received escalation check notification - handling automatically');
                try {
                  await MedicationAlarmHandler.handleNotificationResponse({
                    notification,
                    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
                  } as any);
                } catch (error) {
                  console.error('[App.tsx] Error handling escalation check:', error);
                }
              }
            });
            
            console.log('[App.tsx] Medication alarm system initialized successfully!');
          } else {
            console.log('[App.tsx] NotificationService failed to initialize, but app will continue with limited functionality');
          }
        } else {
          console.log('[App.tsx] Notification permissions not granted. Alarm system disabled.');
        }
      } catch (error) {
        console.error('[App.tsx] Failed to initialize app services:', error);
      }
    };

    initializeApp();

    return () => {
      // Cleanup on app unmount
      securityCleanupService.stop();
      MedicationAlarmHandler.stopMedicationMonitoring();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={Theme}>
          <AuthProvider>
            <AppNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
} 