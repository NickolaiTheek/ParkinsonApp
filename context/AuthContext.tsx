import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage'; // For saving theme
import {
  // AuthError, // Should come from lib/errors
  signInWithEmail,
  signUpWithEmail,
  signOut as authSignOut,
  resetPasswordForEmail,
  updatePassword,
  refreshSession,
  // handleAuthError, // Should come from lib/errors
  // AuthenticationError, // Should come from lib/errors
} from '../lib/auth';
// Import error utilities from lib/errors.ts
import { AuthError, AuthenticationError, handleAuthError } from '../lib/errors';
import { getProfile, updateProfile, getCaregiverPatients, getPatientCaregivers } from '../lib/supabase';

interface SignUpResult {
  error: AuthError | null;
  needsConfirmation?: boolean;
}

export type AppTheme = 'light' | 'dark' | 'system';

interface AuthContextType {
  session: Session | null;
  user: UserProfile | null;
  loading: boolean;
  initialLoading: boolean;
  authError: string | null;
  isProfileSetupComplete: boolean;
  patients: UserProfile[];
  caregivers: UserProfile[];
  currentTheme: AppTheme;
  setCurrentTheme: (theme: AppTheme) => void;
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  signUp: (
    email: string, 
    password: string, 
    firstName: string,
    lastName: string,
    userType: 'patient' | 'caregiver',
    dateOfBirth?: string,
    gender?: string,
    phoneNumber?: string
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthError | null>;
  updateUserPassword: (newPassword: string) => Promise<AuthError | null>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  loadRelationships: (profile: UserProfile | null) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isProfileSetupComplete, setIsProfileSetupComplete] = useState<boolean>(false);
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [caregivers, setCaregivers] = useState<UserProfile[]>([]);
  const [currentTheme, setCurrentThemeState] = useState<AppTheme>('system'); // Default theme

  // Load theme from AsyncStorage on initial load
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('appTheme') as AppTheme | null;
        if (savedTheme) {
          setCurrentThemeState(savedTheme);
          console.log('[AuthContext] Loaded theme from AsyncStorage:', savedTheme);
        }
      } catch (error) {
        console.error('[AuthContext] Error loading theme from AsyncStorage:', error);
      }
    };
    loadTheme();
  }, []);
  
  // Update user profile and AsyncStorage when theme changes
  const setCurrentTheme = async (theme: AppTheme) => {
    try {
      await AsyncStorage.setItem('appTheme', theme);
      setCurrentThemeState(theme);
      console.log('[AuthContext] Theme saved to AsyncStorage and state:', theme);
      if (user && user.id) {
        // Update theme in user preferences in DB
        const currentPreferences = user.preferences || {};
        if (currentPreferences.appearance_theme !== theme) {
            const updatedProfile = await updateProfile(user.id, { 
                preferences: { ...currentPreferences, appearance_theme: theme }
            });
            setUser(updatedProfile); // Update user state with new preferences
            console.log('[AuthContext] User theme preference updated in DB.');
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error saving theme:', error);
    }
  };

  useEffect(() => {
    console.log('[AuthContext] Setting up auth listeners...');
    let isMounted = true;

    const fetchInitialSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        console.log('[AuthContext] Initial session check completed. User ID:', currentSession?.user?.id);
        setSession(currentSession);

        if (currentSession?.user) {
          await fetchUserProfile(currentSession.user.id);
        }
      } catch (error) {
        console.error("[AuthContext] Error during initial getSession:", error);
      } finally {
        if (isMounted) {
          setInitialLoading(false);
          setLoading(false);
        }
      }
    };

    fetchInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!isMounted) return;

      console.log('[AuthContext] Auth state changed event:', _event, 'User ID:', currentSession?.user?.id);
      setSession(currentSession);
      
      if (currentSession?.user) {
        setLoading(true);
        await fetchUserProfile(currentSession.user.id);
        setLoading(false);
      } else {
        setUser(null);
        setPatients([]);
        setCaregivers([]);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    console.log('Fetching user profile for:', userId);
    try {
      let profile = await getProfile(userId);
      console.log('Fetched profile initially:', profile);

      if (profile) {
        // Attempt to parse full_name if it looks like JSON and first/last are missing
        if (profile.full_name && (profile.full_name.startsWith('{') && profile.full_name.endsWith('}')) && (!profile.first_name || !profile.last_name)) {
          try {
            const parsedNameData = JSON.parse(profile.full_name);
            if (parsedNameData.first_name) {
              profile.first_name = parsedNameData.first_name;
            }
            if (parsedNameData.last_name) {
              profile.last_name = parsedNameData.last_name;
            }
            console.log('[AuthContext] Parsed full_name into first/last name:', profile);
          } catch (e) {
            console.warn('[AuthContext] full_name looked like JSON but failed to parse:', profile.full_name, e);
          }
        }
        
        // Ensure full_name is a proper string if first_name and last_name exist but full_name is not set or is the JSON
        if ((profile.first_name || profile.last_name) && (!profile.full_name || (profile.full_name.startsWith('{') && profile.full_name.endsWith('}')))) {
            profile.full_name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
            console.log('[AuthContext] Reconstructed full_name:', profile.full_name);
        }

        // Update isProfileSetupComplete based on profile data and profile_setup_complete flag
        const isComplete = profile.profile_setup_complete === true;
        setIsProfileSetupComplete(isComplete);
        console.log('[AuthContext] Profile setup complete:', isComplete);
      }

      setUser(profile);
      if (profile?.preferences?.appearance_theme) {
        const dbTheme = profile.preferences.appearance_theme as AppTheme;
        // Synchronize AsyncStorage with DB if they differ or AsyncStorage was not set
        const asyncTheme = await AsyncStorage.getItem('appTheme');
        if (dbTheme !== asyncTheme) {
            await AsyncStorage.setItem('appTheme', dbTheme);
            console.log('[AuthContext] Synced AsyncStorage theme with DB theme:', dbTheme);
        }
        setCurrentThemeState(dbTheme);
        console.log('[AuthContext] Loaded theme from user profile DB:', dbTheme);
      } else {
        // If no theme in DB, ensure current state (possibly from AsyncStorage) is not overridden to undefined
        // Or, if AsyncStorage also had no theme, it defaults to 'system' as per useState initial
        console.log('[AuthContext] No theme preference in DB, using current state/default:', currentTheme);
      }
      if (profile) {
        await loadRelationships(profile);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null);
      setIsProfileSetupComplete(false); // Ensure this is reset on error
    }
  };

  const loadRelationships = useCallback(async (profile: UserProfile | null) => {
    if (!profile) {
        console.log('[AuthContext] loadRelationships: No profile provided, clearing state.');
        setPatients([]);
        setCaregivers([]);
        return;
    }
    console.log(`[AuthContext] loadRelationships: Starting for user ${profile.id}, role: ${profile.role}`);
    
    try {
      const userRole = profile.role;
      if (userRole === 'patient') {
        console.log('[AuthContext] loadRelationships: Is a patient, loading caregivers...');
        console.log('[AuthContext][DEBUG] Patient ID:', profile.id);
        const { data: connections, error: connectionsError } = await supabase
          .from('patient_caregiver_connections')
          .select('caregiver_id')
          .eq('patient_id', profile.id)
          .eq('connection_status', 'active');
        
        console.log('[AuthContext][DEBUG] Connections query result:', connections, 'Error:', connectionsError);
        
        if (connectionsError) {
          console.error('[AuthContext] loadRelationships: Error fetching caregiver connections:', connectionsError);
          setCaregivers([]);
        } else if (connections && connections.length > 0) {
          const caregiverIds = connections.map(conn => conn.caregiver_id);
          console.log('[AuthContext][DEBUG] Caregiver IDs:', caregiverIds);
          const { data: caregiverProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email, role, phone_number, created_at, updated_at')
            .in('id', caregiverIds);
          
          console.log('[AuthContext][DEBUG] Caregiver profiles query result:', caregiverProfiles, 'Error:', profilesError);
          
          if (profilesError) {
            console.error('[AuthContext] loadRelationships: Error fetching caregiver profiles:', profilesError);
            setCaregivers([]);
          } else {
            console.log('[AuthContext][DEBUG] Setting caregivers state with:', caregiverProfiles);
            setCaregivers(caregiverProfiles || []);
          }
        } else {
          console.log('[AuthContext][DEBUG] No caregiver connections found.');
          setCaregivers([]);
        }
        setPatients([]); // A patient has no patients
      } else if (userRole === 'caregiver') {
        console.log('[AuthContext] loadRelationships: Is a caregiver, loading patients...');
        const { data: connections, error: connectionsError } = await supabase
          .from('patient_caregiver_connections')
          .select('patient_id')
          .eq('caregiver_id', profile.id)
          .eq('connection_status', 'active');
        
        console.log('[AuthContext] loadRelationships: Caregiver -> Patient connections query result:', { connections, connectionsError });
        
        if (connectionsError) {
          console.error('[AuthContext] loadRelationships: Error fetching patient connections:', connectionsError);
          setPatients([]);
        } else if (connections && connections.length > 0) {
          const patientIds = connections.map(conn => conn.patient_id);
          console.log('[AuthContext] loadRelationships: Fetching profiles for patient IDs:', patientIds);
          
          const { data: patientProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email, role, phone_number, date_of_birth, gender, created_at, updated_at')
            .in('id', patientIds);
          
          console.log('[AuthContext] loadRelationships: Patient profiles query result:', { patientProfiles, profilesError });
          
          if (profilesError) {
            console.error('[AuthContext] loadRelationships: Error fetching patient profiles:', profilesError);
            setPatients([]);
          } else {
            console.log('[AuthContext] loadRelationships: SUCCESS - Setting patients state with', patientProfiles?.length || 0, 'profiles.');
            setPatients(patientProfiles || []);
          }
        } else {
          console.log('[AuthContext] loadRelationships: No patient connections found.');
          setPatients([]);
        }
        setCaregivers([]); // A caregiver has no caregivers
      } else {
        console.log(`[AuthContext] loadRelationships: User has no role or an unknown role ('${userRole}'), clearing relationships.`);
        setPatients([]);
        setCaregivers([]);
      }
    } catch (error) {
      console.error('[AuthContext] loadRelationships: A critical error occurred:', error);
      setPatients([]);
      setCaregivers([]);
    }
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthError | null> => {
    setLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await signInWithEmail(email, password);
      if (error) throw error;
      // Session and user profile will be set by onAuthStateChange listener
      // and its call to fetchUserProfile
      // No need to call fetchUserProfile directly here if listener is robust
      console.log("[AuthContext] SignIn successful, session:", data.session);
      return null;
    } catch (error) {
      console.error("[AuthContext] SignIn error:", error);
      setUser(null); // Clear user on sign-in error
      setIsProfileSetupComplete(false);
      const handledError = handleAuthError(error);
      setAuthError(handledError.message);
      return handledError;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    userType: 'patient' | 'caregiver',
    dateOfBirth?: string,
    gender?: string,
    phoneNumber?: string
  ): Promise<SignUpResult> => {
    setLoading(true);
    setAuthError(null);
    try {
      console.log('Starting sign up process...', { email, firstName, lastName, userType });

      const { data: authData, error: signUpError, needsConfirmation } = await signUpWithEmail(
        email,
        password,
        {
          firstName,
          lastName,
          role: userType, // Ensure 'role' is used here as per your DB schema
          date_of_birth: dateOfBirth,
          gender,
          phone_number: phoneNumber,
          // profile_setup_complete will be false by default in the DB via trigger/default value
        }
      );

      if (signUpError) {
        console.error('Auth signup failed:', signUpError);
        setAuthError(signUpError.message || 'Sign up failed');
        setUser(null);
        setIsProfileSetupComplete(false);
        setLoading(false);
        return { error: handleAuthError(signUpError), needsConfirmation: false };
      }

      console.log('Auth signup successful (auth.users entry created):', { userId: authData?.user?.id, needsConfirmation });
      
      // The onAuthStateChange listener will handle setting the session and fetching the profile.
      // We just need to return the needsConfirmation status.
      // If confirmation is needed, the user won't be fully logged in until confirmed.
      // The listener will eventually pick up the confirmed session.

      if (needsConfirmation) {
        console.log("[AuthContext] SignUp: Email confirmation needed for", email);
        setAuthError('Please confirm your email address to complete registration.');
        // No need to set user/session here, listener will handle it when session becomes active post-confirmation
        setLoading(false);
        return { error: null, needsConfirmation: true }; 
      }
      
      // If no confirmation is needed, the onAuthStateChange listener should have already been triggered
      // or will be triggered very shortly with the new session.
      // We can rely on that to set the user and session state.
      setLoading(false);
      return { error: null, needsConfirmation: false };

    } catch (error) {
      console.error('Error in signUp:', error);
      setUser(null);
      setIsProfileSetupComplete(false);
      setAuthError('An unexpected error occurred during sign up.');
      setLoading(false);
      return { error: handleAuthError(error), needsConfirmation: false };
    }
  };

  const signOut = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await authSignOut();
      // onAuthStateChange will handle setting user and session to null
      setUser(null);
      setSession(null);
      setIsProfileSetupComplete(false);
      setPatients([]);
      setCaregivers([]);
      // Optionally clear theme from AsyncStorage or reset to default on sign out
      // await AsyncStorage.removeItem('appTheme');
      // setCurrentThemeState('system'); 
      console.log("[AuthContext] SignOut successful");
    } catch (error) {
      console.error('Error signing out:', error);
      setAuthError(handleAuthError(error).message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<AuthError | null> => {
    try {
      await resetPasswordForEmail(email);
      return null;
    } catch (error) {
      return handleAuthError(error);
    }
  };

  const updateUserPassword = async (newPassword: string): Promise<AuthError | null> => {
    try {
      await updatePassword(newPassword);
      return null;
    } catch (error) {
      return handleAuthError(error);
    }
  };

  const updateUserProfile = async (updates: Partial<UserProfile>): Promise<UserProfile> => {
    if (!user?.id) throw new Error('No user ID found');
    
    try {
      console.log('[AuthContext] Updating profile with:', updates);
      const updatedProfile = await updateProfile(user.id, updates);
      
      // Update the profile setup complete state if it's being updated
      if (updates.profile_setup_complete !== undefined) {
        setIsProfileSetupComplete(updates.profile_setup_complete);
        console.log('[AuthContext] Updated profile setup complete:', updates.profile_setup_complete);
      }
      
      setUser(updatedProfile);
      return updatedProfile;
    } catch (error) {
      console.error('[AuthContext] Error updating profile:', error);
      throw error;
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const value = {
    session,
    user,
    loading,
    initialLoading,
    authError,
    isProfileSetupComplete,
    patients,
    caregivers,
    currentTheme,
    setCurrentTheme,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateUserPassword,
    updateUserProfile,
    loadRelationships,
    clearAuthError,
  };

  console.log('[AuthContext] AuthProvider providing value:', value);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 