import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, SegmentedButtons } from 'react-native-paper';
import { AuthInput } from './AuthInput';
import { useAuth } from '../../context/AuthContext';
import { validateEmail, validatePassword } from '../../lib/auth';

interface SignUpFormProps {
  onLoginPress: () => void;
}

type UserRole = 'patient' | 'caregiver';

export const SignUpForm: React.FC<SignUpFormProps> = ({ onLoginPress }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [isLoading, setIsLoading] = useState(false);

  // Error states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');

  const { signUp } = useAuth();

  const validateForm = () => {
    let isValid = true;
    
    // Reset all errors
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setFirstNameError('');
    setLastNameError('');

    // Email validation
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    // Password validation
    if (!validatePassword(password)) {
      setPasswordError('Password must be at least 8 characters with numbers and special characters');
      isValid = false;
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      isValid = false;
    }

    // Name validation
    if (!firstName.trim()) {
      setFirstNameError('First name is required');
      isValid = false;
    }

    if (!lastName.trim()) {
      setLastNameError('Last name is required');
      isValid = false;
    }

    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await signUp(email, password, firstName, lastName, role);
      // Success message or redirect will be handled by AuthContext
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Create Account</Text>

      <AuthInput
        label="First Name"
        value={firstName}
        onChangeText={setFirstName}
        error={firstNameError}
        autoCapitalize="words"
        testID="signup-firstname-input"
      />

      <AuthInput
        label="Last Name"
        value={lastName}
        onChangeText={setLastName}
        error={lastNameError}
        autoCapitalize="words"
        testID="signup-lastname-input"
      />

      <AuthInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        testID="signup-email-input"
      />

      <AuthInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        testID="signup-password-input"
      />

      <AuthInput
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={confirmPasswordError}
        secureTextEntry
        testID="signup-confirm-password-input"
      />

      <Text variant="bodyMedium" style={styles.roleLabel}>I am a:</Text>
      <SegmentedButtons
        value={role}
        onValueChange={value => setRole(value as UserRole)}
        buttons={[
          { value: 'patient', label: 'Patient' },
          { value: 'caregiver', label: 'Caregiver' }
        ]}
        style={styles.roleSelector}
      />

      <Button
        mode="contained"
        onPress={handleSignUp}
        loading={isLoading}
        disabled={isLoading}
        style={styles.signupButton}
        testID="signup-submit-button"
      >
        Sign Up
      </Button>

      <View style={styles.loginContainer}>
        <Text variant="bodyMedium">Already have an account? </Text>
        <Button
          mode="text"
          onPress={onLoginPress}
          style={styles.textButton}
          labelStyle={styles.loginButtonLabel}
          testID="login-button"
        >
          Login
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
  roleLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  roleSelector: {
    marginBottom: 16,
  },
  signupButton: {
    marginTop: 16,
    marginBottom: 8,
  },
  textButton: {
    marginVertical: 4,
  },
  loginContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  loginButtonLabel: {
    marginLeft: -8,
  },
}); 