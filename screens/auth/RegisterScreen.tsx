import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, HelperText, SegmentedButtons, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { RootStackParamList } from '../../navigation/AppNavigator';
import AuthHeader from '../../components/auth/AuthHeader';
import AuthInput from '../../components/auth/AuthInput';
import { useAuth } from '../../context/AuthContext';
import { registerSchema } from '../../lib/validationSchemas';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

type FormData = {
  userType: 'patient' | 'caregiver';
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  gender: string;
  phoneNumber: string;
};

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: yupResolver(registerSchema),
    defaultValues: {
      userType: 'patient',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      dateOfBirth: '',
      gender: '',
      phoneNumber: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setError('');

    try {
      const error = await signUp(
        data.email,
        data.password,
        data.firstName,
        data.lastName,
        data.userType,
        data.dateOfBirth,
        data.gender,
        data.phoneNumber
      );

      if (error) {
        setError(error.message);
      }
      // If successful, AuthContext will automatically handle the session
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <AuthHeader
          title="Create Account"
          subtitle="Sign up to get started"
        />

        <View style={styles.form}>
          <Controller
            control={control}
            name="userType"
            render={({ field: { onChange, value } }) => (
              <SegmentedButtons
                value={value}
                onValueChange={value => onChange(value)}
                buttons={[
                  { value: 'patient', label: 'Patient' },
                  { value: 'caregiver', label: 'Caregiver' },
                ]}
                style={styles.segmentedButtons}
              />
            )}
          />

          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="First Name"
                value={value}
                onChangeText={onChange}
                error={!!errors.firstName}
                errorText={errors.firstName?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="lastName"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Last Name"
                value={value}
                onChangeText={onChange}
                error={!!errors.lastName}
                errorText={errors.lastName?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Email"
                value={value}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
                error={!!errors.email}
                errorText={errors.email?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Password"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showPassword}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
                error={!!errors.password}
                errorText={errors.password?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Confirm Password"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showConfirmPassword}
                right={
                  <TextInput.Icon
                    icon={showConfirmPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  />
                }
                error={!!errors.confirmPassword}
                errorText={errors.confirmPassword?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="dateOfBirth"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Date of Birth (YYYY-MM-DD)"
                value={value}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                error={!!errors.dateOfBirth}
                errorText={errors.dateOfBirth?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="gender"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Gender (optional)"
                value={value}
                onChangeText={onChange}
                placeholder="male, female, or other"
                error={!!errors.gender}
                errorText={errors.gender?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            control={control}
            name="phoneNumber"
            render={({ field: { onChange, value } }) => (
              <AuthInput
                label="Phone Number (optional)"
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
                placeholder="+1234567890"
                error={!!errors.phoneNumber}
                errorText={errors.phoneNumber?.message}
                disabled={isSubmitting}
              />
            )}
          />

          {error ? <HelperText type="error" visible>{error}</HelperText> : null}

          <Button
            mode="contained"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.button}
          >
            Create Account
          </Button>

          <Button
            mode="text"
            onPress={() => navigation.navigate('Login')}
            style={styles.button}
            disabled={isSubmitting}
          >
            Already have an account? Sign In
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  form: {
    flex: 1,
    gap: 16,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  button: {
    marginTop: 8,
  },
});

export default RegisterScreen; 