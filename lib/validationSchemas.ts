import * as yup from 'yup';

const passwordRules = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
// Minimum 8 characters, 1 uppercase letter, 1 lowercase letter, 1 number

export const loginSchema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
  password: yup
    .string()
    .required('Password is required'),
});

export const registerSchema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
  password: yup
    .string()
    .matches(passwordRules, {
      message: 'Password must contain at least 8 characters, 1 uppercase, 1 lowercase, and 1 number',
    })
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  firstName: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters'),
  lastName: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters'),
  userType: yup
    .string()
    .oneOf(['patient', 'caregiver'], 'Please select a user type')
    .required('User type is required'),
  dateOfBirth: yup
    .string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Please use YYYY-MM-DD format')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  gender: yup
    .string()
    .oneOf(['male', 'female', 'other', ''], 'Invalid gender')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  phoneNumber: yup
    .string()
    .matches(/^\+?[\d\s-]{10,}$/, 'Please enter a valid phone number')
    .nullable()
    .transform((value) => (value === '' ? null : value)),
});

export const forgotPasswordSchema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
}); 