import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { AuthInput } from './AuthInput';
import { useAuth } from '../../context/AuthContext';
import { validateEmail, validatePassword } from '../../lib/auth';

interface LoginFormProps {
  onSignUpPress: () => void;
  onForgotPasswordPress: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSignUpPress,
  onForgotPasswordPress,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();

  const validateForm = () => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    if (!validatePassword(password)) {
      setPasswordError('Password must be at least 8 characters with numbers and special characters');
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Welcome Back</Text>
      
      <AuthInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        testID="login-email-input"
      />

      <AuthInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        testID="login-password-input"
      />

      <Button
        mode="contained"
        onPress={handleLogin}
        loading={isLoading}
        disabled={isLoading}
        style={styles.loginButton}
        testID="login-submit-button"
      >
        Login
      </Button>

      <Button
        mode="text"
        onPress={onForgotPasswordPress}
        style={styles.textButton}
        testID="forgot-password-button"
      >
        Forgot Password?
      </Button>

      <View style={styles.signupContainer}>
        <Text variant="bodyMedium">Don't have an account? </Text>
        <Button
          mode="text"
          onPress={onSignUpPress}
          style={styles.textButton}
          labelStyle={styles.signupButtonLabel}
          testID="signup-button"
        >
          Sign Up
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    marginBottom: 24,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 16,
    marginBottom: 8,
  },
  textButton: {
    marginVertical: 4,
  },
  signupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  signupButtonLabel: {
    marginLeft: -8,
  },
}); 