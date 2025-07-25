import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Text,
  useTheme,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FloatingChatBotProps {
  onChatPress: () => void;
}

const FloatingChatBot: React.FC<FloatingChatBotProps> = ({ onChatPress }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const [hasNotification, setHasNotification] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));
  const [showRedDot, setShowRedDot] = useState(false);

  // Check if user has pending health check-ins or questions
  const checkNotifications = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if user has done today's health check-in
      const { data: todaysCheckIns, error } = await supabase
        .from('health_checkins')
        .select('id')
        .eq('user_id', user.id)
        .eq('checkin_date', today)
        .limit(1);

      if (error) {
        console.error('Error checking notifications:', error);
        return;
      }

      // Show notification if no check-ins today
      setHasNotification(!todaysCheckIns || todaysCheckIns.length === 0);
    } catch (error) {
      console.error('Error in checkNotifications:', error);
    }
  };

  useEffect(() => {
    if (user) {
      checkNotifications();
      
      // Check every 30 minutes
      const interval = setInterval(checkNotifications, 30 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Check if chat bot was opened today
  useEffect(() => {
    const checkChatbotOpened = async () => {
      const today = new Date().toISOString().split('T')[0];
      const lastOpened = await AsyncStorage.getItem('chatbot_last_opened');
      setShowRedDot(lastOpened !== today);
    };
    checkChatbotOpened();
    // Optionally, re-check every 30 minutes
    const interval = setInterval(checkChatbotOpened, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // When chat bot is opened, remove red dot
  useEffect(() => {
    if (!hasNotification && !showRedDot) return;
    // This effect is likely tied to a navigation context, but not provided in the original file.
    // Assuming it's meant to be part of a larger navigation setup.
    // For now, it will not run as navigation is not defined.
    // If this effect is intended to be functional, navigation needs to be passed as a prop.
    // For now, commenting out the navigation part as it's not available in the original file.
    // const unsubscribe = navigation.addListener('focus', async () => {
    //   const today = new Date().toISOString().split('T')[0];
    //   await AsyncStorage.setItem('chatbot_last_opened', today);
    //   setShowRedDot(false);
    // });
    // return unsubscribe;
  }, [hasNotification, showRedDot]); // Removed navigation from dependency array as it's not defined

  const handlePress = () => {
    // Animate button press
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    onChatPress();
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.floatingButton, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: theme.colors.primary }
          ]}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="robot-outline"
            size={28}
            color="white"
          />
          
          {/* Notification dot */}
          {(hasNotification || showRedDot) && (
            <View style={[styles.notificationDot, { backgroundColor: '#ff4444' }]}>
              <Text style={styles.notificationText}>!</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above bottom navigation
    right: 20,
    zIndex: 1000,
  },
  floatingButton: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  notificationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default FloatingChatBot; 