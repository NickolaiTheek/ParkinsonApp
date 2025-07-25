import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import merge from 'deepmerge';

import { useAuth } from '../context/AuthContext';
import { AuthStack } from './AuthStack';
import ProfileStackNavigator from './ProfileStackNavigator'; // For profile setup/editing
import MainBottomTabNavigator from '../src/navigation/MainBottomTabNavigator'; // Corrected import path
import { AppTheme } from '../context/AuthContext';

const Stack = createStackNavigator();

const AppNavigator = () => {
  const { session, user, loading, initialLoading, isProfileSetupComplete } = useAuth();
  const theme = useTheme(); // Use the theme from the root PaperProvider in App.tsx

  useEffect(() => {
    console.log('[AppNavigator] useEffect - Auth state:', { session, user, loading, initialLoading, isProfileSetupComplete });
  }, [session, user, loading, initialLoading, isProfileSetupComplete]);

  if (loading || initialLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // The NavigationContainer needs its own theme object, which is slightly different
  // from Paper's. We merge our Paper theme with the base navigation themes.
  const navigationTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      primary: theme.colors.primary,
      border: theme.colors.outline,
      notification: theme.colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      {session && user ? (
        isProfileSetupComplete ? (
          <MainBottomTabNavigator />
        ) : (
          <ProfileStackNavigator />
        )
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppNavigator; 