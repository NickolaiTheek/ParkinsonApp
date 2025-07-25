import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthenticationError } from './errors';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 30;

interface RateLimitInfo {
  count: number;
  timestamp: number;
}

interface LoginAttemptInfo {
  attempts: number;
  lastAttempt: number;
  lockedUntil?: number;
}

// Rate limiting
export const checkRateLimit = async (key: string): Promise<void> => {
  const rateLimitKey = `rateLimit:${key}`;
  try {
    const stored = await AsyncStorage.getItem(rateLimitKey);
    const now = Date.now();
    let info: RateLimitInfo;

    if (stored) {
      info = JSON.parse(stored);
      if (now - info.timestamp > RATE_LIMIT_WINDOW) {
        // Reset if window has passed
        info = { count: 1, timestamp: now };
      } else if (info.count >= MAX_REQUESTS_PER_WINDOW) {
        throw new AuthenticationError(
          'Too many requests. Please try again later.',
          429
        );
      } else {
        info.count += 1;
      }
    } else {
      info = { count: 1, timestamp: now };
    }

    await AsyncStorage.setItem(rateLimitKey, JSON.stringify(info));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    console.error('Rate limit check failed:', error);
    // Allow the request if rate limiting fails
  }
};

// Login attempt tracking
export const checkLoginAttempts = async (email: string): Promise<void> => {
  const attemptsKey = `loginAttempts:${email}`;
  try {
    const stored = await AsyncStorage.getItem(attemptsKey);
    const now = Date.now();
    let info: LoginAttemptInfo;

    if (stored) {
      info = JSON.parse(stored);
      
      // Check if account is locked
      if (info.lockedUntil && now < info.lockedUntil) {
        const minutesLeft = Math.ceil((info.lockedUntil - now) / (60 * 1000));
        throw new AuthenticationError(
          `Account is locked. Please try again in ${minutesLeft} minutes.`,
          423
        );
      }

      // Reset attempts if lockout period has passed
      if (info.lockedUntil && now >= info.lockedUntil) {
        info = { attempts: 1, lastAttempt: now };
      }
      // Reset attempts if last attempt was more than lockout duration ago
      else if (now - info.lastAttempt >= LOCKOUT_DURATION) {
        info = { attempts: 1, lastAttempt: now };
      }
      // Increment attempts
      else {
        info.attempts += 1;
        info.lastAttempt = now;

        // Lock account if max attempts reached
        if (info.attempts >= MAX_LOGIN_ATTEMPTS) {
          info.lockedUntil = now + LOCKOUT_DURATION;
          await AsyncStorage.setItem(attemptsKey, JSON.stringify(info));
          throw new AuthenticationError(
            'Too many failed login attempts. Account is locked for 15 minutes.',
            423
          );
        }
      }
    } else {
      info = { attempts: 1, lastAttempt: now };
    }

    await AsyncStorage.setItem(attemptsKey, JSON.stringify(info));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    console.error('Login attempt check failed:', error);
    // Allow the login if tracking fails
  }
};

// Reset login attempts after successful login
export const resetLoginAttempts = async (email: string): Promise<void> => {
  const attemptsKey = `loginAttempts:${email}`;
  try {
    await AsyncStorage.removeItem(attemptsKey);
  } catch (error) {
    console.error('Failed to reset login attempts:', error);
  }
};

// Clear expired rate limits and login attempts
export const clearExpiredSecurityRecords = async (): Promise<void> => {
  try {
    const now = Date.now();
    const keys = await AsyncStorage.getAllKeys();
    
    for (const key of keys) {
      if (key.startsWith('rateLimit:') || key.startsWith('loginAttempts:')) {
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const info = JSON.parse(stored);
          
          if (key.startsWith('rateLimit:')) {
            if (now - info.timestamp > RATE_LIMIT_WINDOW) {
              await AsyncStorage.removeItem(key);
            }
          } else { // loginAttempts
            if (now - info.lastAttempt > LOCKOUT_DURATION) {
              await AsyncStorage.removeItem(key);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear expired security records:', error);
  }
}; 