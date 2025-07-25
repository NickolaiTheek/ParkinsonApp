import { AuthError as SupabaseAuthError } from '@supabase/supabase-js';

// Definition of AuthError type
export type AuthError = {
  message: string;
  status?: number;
  details?: string;
};

// Definition of AuthenticationError class
export class AuthenticationError extends Error {
  status?: number;
  
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthenticationError';
    this.status = status;
  }
}

// Definition of handleAuthError function
export const handleAuthError = (error: any): AuthError => {
  console.error('Auth error details:', {
    error,
    name: error.name,
    message: error.message,
    status: error.status,
    details: error.details,
    hint: error.hint,
    code: error.code
  });

  if (error instanceof AuthenticationError) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof SupabaseAuthError) {
    return {
      message: error.message,
      status: error.status || 500,
      details: error.details || error.hint,
    };
  }

  // Handle PostgreSQL/Database errors
  if (error.code) {
    switch (error.code) {
      case '23505': // unique_violation
        return {
          message: 'This email is already registered.',
          status: 409,
          details: error.detail,
        };
      case '23503': // foreign_key_violation
        return {
          message: 'Invalid reference to another record.',
          status: 400,
          details: error.detail,
        };
      case '42P01': // undefined_table
        return {
          message: 'Database table not found. Please contact support.',
          status: 500,
          details: error.message,
        };
      default:
        return {
          message: 'A database error occurred. Please try again.',
          status: 500,
          details: error.message,
        };
    }
  }

  // Generic error
  return {
    message: error.message || 'An unexpected error occurred',
    status: error.status || 500,
    details: error.details || error.toString(),
  };
}; 