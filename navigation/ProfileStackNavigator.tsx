import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Connections: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

const ProfileStackNavigator = () => {
  return (
    <Stack.Navigator 
        initialRouteName="Profile" 
        screenOptions={{ headerShown: false }} // Or true if you want headers for these screens
    >
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen 
        name="Connections" 
        component={ConnectionsScreen}
        options={{ 
          headerShown: true,
          title: 'Manage Connections'
        }}
      />
    </Stack.Navigator>
  );
};

export default ProfileStackNavigator; 