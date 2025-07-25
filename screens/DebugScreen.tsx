import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import ConnectionDebug from '../components/ConnectionDebug';
import ConnectionTest from '../components/ConnectionTest';
import ConnectionFlowTest from '../components/ConnectionFlowTest';

const DebugScreen: React.FC = () => {
  const theme = useTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ConnectionFlowTest />
      <ConnectionTest />
      <ConnectionDebug />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default DebugScreen; 