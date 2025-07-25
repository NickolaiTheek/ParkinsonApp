import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { AuthInput } from './AuthInput';
import { useAuth } from '../../context/AuthContext';
import { validateEmail } from '../../lib/auth';

interface ForgotPasswordFormProps {
  onBackToLoginPress: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onBackToLoginPress,
}) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { resetPassword } = useAuth();

  const validateForm = () => {
    setEmailError('');
    
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return false;
    }

    return true;
  };

  const handleResetPassword = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await resetPassword(email);
      setIsSuccess(true);
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <View style={styles.container}>
        <Text variant="headlineMedium" style={styles.title}>Check Your Email</Text>
        <Text variant="bodyMedium" style={styles.message}>
          We've sent password reset instructions to {email}. Please check your email and follow the link to reset your password.
        </Text>
        <Button
          mode="contained"
          onPress={onBackToLoginPress}
          style={styles.button}
          testID="back-to-login-button"
        >
          Back to Login
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Reset Password</Text>
      <Text variant="bodyMedium" style={styles.message}>
        Enter your email address and we'll send you instructions to reset your password.
      </Text>

      <AuthInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        testID="forgot-password-email-input"
      />

      <Button
        mode="contained"
        onPress={handleResetPassword}
        loading={isLoading}
        disabled={isLoading}
        style={styles.button}
        testID="reset-password-submit-button"
      >
        Send Reset Instructions
      </Button>

      <Button
        mode="text"
        onPress={onBackToLoginPress}
        style={styles.textButton}
        testID="back-to-login-button"
      >
        Back to Login
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    marginBottom: 8,
  },
  textButton: {
    marginVertical: 4,
  },
}); 