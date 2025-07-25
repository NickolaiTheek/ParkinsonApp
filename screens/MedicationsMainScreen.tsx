import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useTheme } from 'react-native-paper';
import { View, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MedicationListScreen from './MedicationListScreen';
import MedicationCalendarScreen from './MedicationCalendarScreen';

const Tab = createMaterialTopTabNavigator();
const { width } = Dimensions.get('window');

const MedicationsMainScreen = () => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Tab.Navigator
          screenOptions={{
            tabBarStyle: styles.tabBarStyle,
            tabBarActiveTintColor: '#FFFFFF',
            tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.7)',
            tabBarIndicatorStyle: styles.tabBarIndicator,
            tabBarLabelStyle: styles.tabBarLabel,
            tabBarItemStyle: styles.tabBarItem,
            tabBarPressColor: 'rgba(255, 255, 255, 0.1)',
            tabBarPressOpacity: 0.8,
          }}
        >
          <Tab.Screen
            name="List"
            component={MedicationListScreen}
            options={{ 
              tabBarLabel: 'My Medications',
              tabBarAccessibilityLabel: 'My Medications Tab'
            }}
          />
          <Tab.Screen
            name="Calendar"
            component={MedicationCalendarScreen}
            options={{ 
              tabBarLabel: 'Calendar',
              tabBarAccessibilityLabel: 'Calendar Tab'
            }}
          />
        </Tab.Navigator>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerGradient: {
    flex: 1,
  },
  tabBarStyle: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
    height: 56,
    paddingHorizontal: 16,
  },
  tabBarLabel: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  tabBarItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tabBarIndicator: {
    backgroundColor: '#FFFFFF',
    height: 3,
    borderRadius: 2,
    marginHorizontal: 16,
    bottom: 4,
  },
});

export default MedicationsMainScreen; 