import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

type Props = {
  title: string;
  subtitle?: string;
};

const AuthHeader: React.FC<Props> = ({ title, subtitle }) => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        {title}
      </Text>
      {subtitle && (
        <Text variant="bodyLarge" style={styles.subtitle}>
          {subtitle}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1a1a1a',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#666666',
  },
});

export default AuthHeader; 