import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack'; // Import StackNavigator
import { useTheme } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { CommonActions } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import HomeScreen from '../../screens/HomeScreen';
import DoctorAppointmentsScreen from '../../screens/DoctorAppointmentsScreen';
import MedicationStackNavigator from '../../navigation/MedicationStackNavigator'; // Import MedicationStackNavigator
import UnifiedCalendarScreen from '../../screens/UnifiedCalendarScreen'; // New unified calendar
import ExerciseRecommendationsScreen from '../../screens/ExerciseRecommendationsScreen'; // New Exercise screen
import ProfileStackNavigator from '../../navigation/ProfileStackNavigator';
import HealthMetricsDashboardScreen from '../screens/HealthMetricsDashboardScreen.tsx';
import HealthMetricsScreen from '../screens/HealthMetricsScreen.tsx';
import CaregiverAnalyticsScreen from '../../screens/CaregiverAnalyticsScreen'; // Import Analytics screen
import ParkinsonsAssessmentScreen from '../../screens/ParkinsonsAssessmentScreen'; // Import Parkinson's Assessment

export type MainBottomTabParamList = {
  Home: undefined;
  Calendar: undefined; // Single calendar view, no parameters needed
  Exercise: undefined; // Changed from Assessments to Exercise
  Metrics: undefined;
  Assessment: undefined; // Add Assessment tab for patients
  Analytics: undefined; // Add Analytics tab for caregivers
  Profile: undefined;
  LogHealthMetric: undefined;
  DoctorAppointments: undefined; // Add DoctorAppointments to the navigation
  Medications: undefined; // Add back Medications for daily action navigation
};

// Define ParamList for the Home Stack
export type HomeStackParamList = {
  HomeMain: undefined;
  DoctorAppointments: undefined;
  Medications: undefined; // Add medications to home stack for daily actions
};

// Define ParamList for the HealthMetrics Stack
export type HealthMetricsStackParamList = {
  HealthMetricsDashboard: undefined;
  LogHealthMetric: undefined; // Screen for inputting metrics
};

const Tab = createBottomTabNavigator<MainBottomTabParamList>();
const HomeStack = createStackNavigator<HomeStackParamList>(); // Create a StackNavigator for Home
const MetricsStack = createStackNavigator<HealthMetricsStackParamList>(); // Create a StackNavigator for Metrics

// Home Stack Navigator Component
const HomeStackNavigator = () => {
  const theme = useTheme();
  return (
    <HomeStack.Navigator
      initialRouteName="HomeMain"
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <HomeStack.Screen 
        name="HomeMain" 
        component={HomeScreen} 
        options={{ headerShown: false }}
      />
      <HomeStack.Screen 
        name="DoctorAppointments" 
        component={DoctorAppointmentsScreen} 
        options={{ 
          title: 'Doctor Appointments',
          headerShown: false // Hide header since the screen has its own custom gradient header
        }}
      />
      <HomeStack.Screen 
        name="Medications" 
        component={MedicationStackNavigator}
        options={{ headerShown: false }}
      />
    </HomeStack.Navigator>
  );
};

// Metrics Stack Navigator Component
const HealthMetricsStackNavigator = () => {
  const theme = useTheme();
  return (
    <MetricsStack.Navigator
      initialRouteName="HealthMetricsDashboard"
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <MetricsStack.Screen 
        name="HealthMetricsDashboard" 
        component={HealthMetricsDashboardScreen} 
        options={{ title: 'Health Metrics' }}
      />
      <MetricsStack.Screen 
        name="LogHealthMetric" 
        component={HealthMetricsScreen} 
        options={{ title: 'Log New Metric' }} 
      />
    </MetricsStack.Navigator>
  );
};


const MainBottomTabNavigator: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuth();
  
  // Get user type
  const userType = user?.user_type || user?.role;
  const isCaregiver = userType === 'caregiver';

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string = '';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Calendar') {
            iconName = focused ? 'calendar-heart' : 'calendar-outline';
          } else if (route.name === 'Exercise') { // Changed from Assessments to Exercise
            iconName = focused ? 'dumbbell' : 'dumbbell';
          } else if (route.name === 'Metrics') {
            iconName = focused ? 'chart-bar' : 'chart-bar';
          } else if (route.name === 'Assessment') {
            iconName = focused ? 'brain' : 'brain';
          } else if (route.name === 'Analytics') {
            iconName = focused ? 'chart-line' : 'chart-line-variant';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'account-circle' : 'account-circle-outline';
          }
          return (
            <MaterialCommunityIcons name={iconName} size={size} color={color} />
          );
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStackNavigator}
        options={{ headerShown: false }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Get the current navigation state
            const state = navigation.getState();
            const homeRoute = state.routes.find(r => r.name === 'Home');
            
            // If we're already on the Home tab and there are screens in the stack, reset to root
            if (homeRoute?.state?.index && homeRoute.state.index > 0) {
              // Prevent default behavior
              e.preventDefault();
              
              // Navigate to the Home tab and reset its stack
              navigation.navigate('Home', { screen: 'HomeMain' });
            }
          },
        })}
      />
      
      {/* Only show these tabs for patients */}
      {!isCaregiver && (
        <>
          <Tab.Screen 
            name="Calendar" 
            component={UnifiedCalendarScreen}
            options={{ headerShown: false }} 
          />
          <Tab.Screen 
            name="Exercise" 
            component={ExerciseRecommendationsScreen}
            options={{ headerShown: false }} // Hide header since we have custom gradient header
          />
          <Tab.Screen 
            name="Metrics" 
            component={HealthMetricsStackNavigator}
            options={{ headerShown: false }}
          />
          <Tab.Screen 
            name="Assessment" 
            component={ParkinsonsAssessmentScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
      
      {/* Only show this tab for caregivers */}
      {isCaregiver ? (
        <>
          <Tab.Screen 
            name="Analytics" 
            component={CaregiverAnalyticsScreen}
            options={{ headerShown: false }}
          />
          <Tab.Screen 
            name="Profile" 
            component={ProfileStackNavigator}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <Tab.Screen 
          name="Profile" 
          component={ProfileStackNavigator}
          options={{ headerShown: false }}
        />
      )}
    </Tab.Navigator>
  );
};

export default MainBottomTabNavigator; 