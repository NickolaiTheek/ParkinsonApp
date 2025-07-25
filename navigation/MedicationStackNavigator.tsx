import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MedicationListScreen from '../screens/MedicationListScreen';
import MedicationFormScreen from '../screens/MedicationFormScreen';
import { useTheme } from 'react-native-paper';

export type MedicationStackParamList = {
  MedicationList: undefined;
  MedicationForm: { medicationId?: string };
};

const Stack = createStackNavigator<MedicationStackParamList>();

const MedicationStackNavigator = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="MedicationList"
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.onPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="MedicationList" 
        component={MedicationListScreen} 
        options={{ 
          title: 'Medications',
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="MedicationForm" 
        component={MedicationFormScreen} 
        options={({ route }) => ({ 
          title: route.params?.medicationId ? 'Edit Medication' : 'Add Medication' 
        })} 
      />
    </Stack.Navigator>
  );
};

export default MedicationStackNavigator; 