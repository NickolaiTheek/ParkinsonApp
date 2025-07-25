import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from 'react-native-paper';
import DoctorAppointmentsScreen from '../screens/DoctorAppointmentsScreen';

export type DoctorAppointmentsStackParamList = {
  DoctorAppointmentsList: undefined;
};

const Stack = createStackNavigator<DoctorAppointmentsStackParamList>();

const DoctorAppointmentsStackNavigator: React.FC = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="DoctorAppointmentsList"
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen 
        name="DoctorAppointmentsList" 
        component={DoctorAppointmentsScreen} 
        options={{ 
          title: 'Doctor Appointments',
          headerShown: false // Hide header since the screen has its own custom gradient header
        }}
      />
    </Stack.Navigator>
  );
};

export default DoctorAppointmentsStackNavigator; 