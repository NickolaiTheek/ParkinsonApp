import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient } from '@supabase/supabase-js';

// URL and anon key should be in your .env file
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or anonymous key');
}

// Custom storage adapter for Supabase
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    // In test environment, always use AsyncStorage
    if (process.env.NODE_ENV === 'test') {
      return AsyncStorage.getItem(key);
    }
    return Platform.OS === 'web'
      ? AsyncStorage.getItem(key)
      : SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return Platform.OS === 'web'
      ? AsyncStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return Platform.OS === 'web'
      ? AsyncStorage.removeItem(key)
      : SecureStore.deleteItemAsync(key);
  },
};

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

// Types for user profiles
export interface UserProfile {
  id: string;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  role: 'patient' | 'caregiver' | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  diagnosis_date?: string | null;
  medication_sensitivity?: string | null;
  emergency_contact?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  phone_number?: string | null;
  preferences?: { [key: string]: any } | null;
  created_at?: string;
  updated_at?: string;
  profile_setup_complete?: boolean | null;
}

// Error handling types
export type AuthError = {
  message: string;
  status?: number;
};

// Helper function to handle auth errors
export const handleAuthError = (error: any): AuthError => {
  console.error('Auth error:', error);
  return {
    message: error.message || 'An unexpected error occurred',
    status: error.status || 500,
  };
};

// Add migration helper
export const migrateRoleToUserType = async (supabase: SupabaseClient) => {
  // First, add user_type column if it doesn't exist
  const { error: addColumnError } = await supabase.rpc('add_user_type_column');
  if (addColumnError) {
    console.error('Error adding user_type column:', addColumnError);
  }

  // Then migrate data from role to user_type
  const { error: migrationError } = await supabase.rpc('migrate_role_to_user_type');
  if (migrationError) {
    console.error('Error migrating role to user_type:', migrationError);
  }
};

// Update getProfile to ensure new fields are handled
export const getProfile = async (userId: string): Promise<UserProfile> => {
  console.log('Getting profile for user:', userId);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, role, avatar_url, date_of_birth, diagnosis_date, medication_sensitivity, emergency_contact, gender, phone_number, preferences, created_at, updated_at, profile_setup_complete')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    throw error;
  }

  if (!data) {
    console.log('No profile found for user, attempting to create default profile...', userId);
    const { data: authUserResponse, error: authUserError } = await supabase.auth.getUser();
    if (authUserError || !authUserResponse.user) {
      console.error('Error fetching auth user data or no auth user found:', authUserError);
      throw new Error('User not found and unable to fetch auth details to create profile.');
    }
    const authUser = authUserResponse.user;
    
    const trim = (str: string | undefined | null) => str?.trim() || '';
    const coalesce = (val: string | undefined | null, defaultVal: string) => val ?? defaultVal;
    
    const calculatedFirstName = authUser.user_metadata?.first_name || '';
    const calculatedLastName = authUser.user_metadata?.last_name || '';
    let calculatedFullName = authUser.user_metadata?.full_name || '';
    if (!calculatedFullName && (calculatedFirstName || calculatedLastName)) {
        calculatedFullName = `${calculatedFirstName} ${calculatedLastName}`.trim();
    }

    const defaultProfileData = {
      id: userId,
      email: authUser.email,
      role: (authUser.user_metadata?.role || 'patient') as 'patient' | 'caregiver',
      first_name: calculatedFirstName || null,
      last_name: calculatedLastName || null,
      full_name: calculatedFullName || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      avatar_url: null,
      diagnosis_date: null,
      medication_sensitivity: null,
      emergency_contact: null,
      preferences: null,
      gender: authUser.user_metadata?.gender || null,
      phone_number: authUser.user_metadata?.phone_number || null,
      date_of_birth: authUser.user_metadata?.date_of_birth || null,
      profile_setup_complete: false,
    };

    console.log('Attempting to insert default profile:', defaultProfileData);
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert(defaultProfileData)
      .select()
      .single();

    if (createError) {
      console.error('Error creating default profile after fetching auth user:', {
        message: createError.message,
        details: createError.details,
        code: createError.code,
      });
      throw createError;
    }
    console.log('Default profile created successfully:', newProfile);
    return newProfile as UserProfile;
  }

  let profileData = { ...data }; // Create a mutable copy

  if (!profileData.full_name && (profileData.first_name || profileData.last_name)) {
    profileData.full_name = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();
  }

  return {
    ...profileData,
    role: profileData.role, 
    preferences: typeof profileData.preferences === 'string' ? JSON.parse(profileData.preferences) : profileData.preferences,
    profile_setup_complete: profileData.profile_setup_complete === true,
  } as UserProfile;
};

export const updateProfile = async (userId: string, updates: Partial<UserProfile>) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as UserProfile;
};

type DatabaseProfile = {
  id: string;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  role?: 'patient' | 'caregiver';
  avatar_url?: string | null;
  date_of_birth?: string | null;
  diagnosis_date?: string | null;
  medication_sensitivity?: string | null;
  emergency_contact?: string | null;
  gender?: string | null;
  phone_number?: string | null;
  preferences?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  profile_setup_complete?: boolean | null;
};

type DatabaseCaregiverPatient = {
  patient: DatabaseProfile;
};

type DatabasePatientCaregiver = {
  caregiver: DatabaseProfile;
};

export const getCaregiverPatients = async (caregiverId: string): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('patient_caregiver_connections')
    .select(`
      patient:patient_id (
        id,
        first_name,
        last_name,
        email,
        role,
        date_of_birth,
        gender,
        phone_number,
        created_at,
        updated_at
      )
    `)
    .eq('caregiver_id', caregiverId)
    .eq('connection_status', 'active');

  if (error) throw error;
  return (data as unknown as DatabaseCaregiverPatient[]).map(item => ({
    ...item.patient,
    role: item.patient.role || 'patient'
  } as UserProfile));
};

export const getPatientCaregivers = async (patientId: string): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('patient_caregiver_connections')
    .select(`
      caregiver:caregiver_id (
        id,
        first_name,
        last_name,
        email,
        role,
        phone_number,
        created_at,
        updated_at
      )
    `)
    .eq('patient_id', patientId)
    .eq('connection_status', 'active');

  if (error) throw error;
  return (data as unknown as DatabasePatientCaregiver[]).map(item => ({
    ...item.caregiver,
    role: item.caregiver.role || 'caregiver'
  } as UserProfile));
};