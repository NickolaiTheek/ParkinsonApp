import { UserProfile } from './supabase';

export type UserRole = 'patient' | 'caregiver';

export interface Permission {
  action: string;
  subject: string;
}

export const PERMISSIONS = {
  PATIENT: [
    { action: 'read', subject: 'own_profile' },
    { action: 'update', subject: 'own_profile' },
    { action: 'read', subject: 'own_medical_records' },
    { action: 'create', subject: 'own_journal_entries' },
    { action: 'read', subject: 'own_journal_entries' },
    { action: 'update', subject: 'own_journal_entries' },
    { action: 'delete', subject: 'own_journal_entries' },
    { action: 'read', subject: 'own_caregivers' },
    { action: 'manage', subject: 'own_health_metrics' },
    { action: 'manage', subject: 'own_symptom_logs' },
    { action: 'manage', subject: 'own_exercise_logs' },
    { action: 'manage', subject: 'own_medication_logs' },
    { action: 'read', subject: 'own_appointments' },
  ],
  CAREGIVER: [
    { action: 'read', subject: 'own_profile' },
    { action: 'update', subject: 'own_profile' },
    { action: 'read', subject: 'patient_profiles' },
    { action: 'read', subject: 'patient_medical_records' },
    { action: 'read', subject: 'patient_journal_entries' },
    { action: 'create', subject: 'patient_appointments' },
    { action: 'read', subject: 'patient_appointments' },
    { action: 'update', subject: 'patient_appointments' },
    { action: 'delete', subject: 'patient_appointments' },
    { action: 'read', subject: 'patient_health_metrics' },
    { action: 'read', subject: 'patient_symptom_logs' },
    { action: 'read', subject: 'patient_exercise_logs' },
    { action: 'read', subject: 'patient_medication_logs' },
  ],
} as const;

export const hasPermission = (
  user: UserProfile | null,
  action: string,
  subject: string,
  targetUserId?: string
): boolean => {
  if (!user) return false;

  const userPermissions = PERMISSIONS[user.user_type.toUpperCase() as keyof typeof PERMISSIONS];
  if (!userPermissions) return false;

  // Check if the user has the exact permission
  const hasExactPermission = userPermissions.some(
    (permission) => permission.action === action && permission.subject === subject
  );

  if (hasExactPermission) {
    // For own resource access
    if (subject.startsWith('own_')) {
      return !targetUserId || targetUserId === user.id;
    }
    // For patient resource access (caregivers only)
    if (subject.startsWith('patient_')) {
      // Note: This should be enhanced with a check against caregiver_patients table
      return user.user_type === 'caregiver';
    }
    return true;
  }

  // Check if the user has a 'manage' permission that includes this action
  const hasManagePermission = userPermissions.some(
    (permission) =>
      permission.action === 'manage' &&
      permission.subject === subject
  );

  if (hasManagePermission) {
    // For own resource access
    if (subject.startsWith('own_')) {
      return !targetUserId || targetUserId === user.id;
    }
    return true;
  }

  return false;
};

export const getPermissions = (userType: UserRole): Permission[] => {
  return PERMISSIONS[userType.toUpperCase() as keyof typeof PERMISSIONS] || [];
};

export const checkPermission = (
  user: UserProfile | null,
  action: string,
  subject: string,
  targetUserId?: string
): void => {
  if (!hasPermission(user, action, subject, targetUserId)) {
    throw new Error(
      `User does not have permission to ${action} ${subject}`
    );
  }
}; 