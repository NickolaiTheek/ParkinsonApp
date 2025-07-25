import { AuthError as SupabaseAuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { checkRateLimit, checkLoginAttempts, resetLoginAttempts } from './security';
import { AuthError, AuthenticationError, handleAuthError } from './errors';

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): boolean => {
  // At least 8 characters, 1 number, 1 special character
  const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;
  return passwordRegex.test(password);
};

export const validateName = (name: string): boolean => {
  return name.trim().length >= 2;
};

export interface SignUpOptions {
  firstName: string;
  lastName: string;
  user_type: 'patient' | 'caregiver';
  date_of_birth?: string;
  gender?: string;
  phone_number?: string;
}

export const signInWithEmail = async (email: string, password: string) => {
  if (!validateEmail(email)) {
    throw new AuthenticationError('Invalid email format');
  }

  if (!validatePassword(password)) {
    throw new AuthenticationError(
      'Password must contain at least 8 characters, including uppercase, lowercase, and numbers'
    );
  }

  // Check rate limiting for the IP/device
  await checkRateLimit('auth:signIn');

  // Check for too many failed login attempts
  await checkLoginAttempts(email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new AuthenticationError(error.message, error.status);
  }

  // Reset login attempts on successful login
  await resetLoginAttempts(email);
  return { data, error: null };
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  metadata: {
    firstName: string;
    lastName: string;
    role: 'patient' | 'caregiver';
    date_of_birth?: string;
    gender?: string;
    phone_number?: string;
  }
) => {
  if (!validateEmail(email)) {
    throw new AuthenticationError('Invalid email format');
  }

  if (!validatePassword(password)) {
    throw new AuthenticationError(
      'Password must be at least 8 characters, including uppercase, lowercase, and numbers'
    );
  }

  await checkRateLimit('auth:signUp');

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: metadata.firstName,
        last_name: metadata.lastName,
        role: metadata.role,
        date_of_birth: metadata.date_of_birth,
        gender: metadata.gender,
        phone_number: metadata.phone_number,
      },
    },
  });

  if (signUpError) {
    console.error('Supabase signUp error:', signUpError);
    throw signUpError;
  }

  // Check if email confirmation is required and the user is not yet confirmed
  const needsConfirmation = data.user && data.user.identities && data.user.identities.length > 0 && !data.session;
  
  console.log('signUpWithEmail result:', { userId: data.user?.id, needsConfirmation });

  return { data, error: null, needsConfirmation };
};

export const resetPasswordForEmail = async (email: string) => {
  if (!validateEmail(email)) {
    throw new AuthenticationError('Invalid email format');
  }

  // Check rate limiting for the IP/device
  await checkRateLimit('auth:resetPassword');

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'parkinsonapp://reset-password',
  });

  if (error) {
    throw new AuthenticationError(error.message, error.status);
  }

  return { data, error: null };
};

export const updatePassword = async (newPassword: string) => {
  if (!validatePassword(newPassword)) {
    throw new AuthenticationError(
      'Password must contain at least 8 characters, including uppercase, lowercase, and numbers'
    );
  }

  // Check rate limiting for the IP/device
  await checkRateLimit('auth:updatePassword');

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new AuthenticationError(error.message, error.status);
  }

  return { data, error: null };
};

export const refreshSession = async () => {
  // Check rate limiting for the IP/device
  await checkRateLimit('auth:refreshSession');

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    throw new AuthenticationError(error.message, error.status);
  }
  return { data, error: null };
};

export const signOut = async () => {
  // Check rate limiting for the IP/device
  await checkRateLimit('auth:signOut');

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new AuthenticationError(error.message, error.status);
  }
  return { data: null, error: null };
}; 