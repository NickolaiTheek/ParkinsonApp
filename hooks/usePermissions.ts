import { useAuth } from '../context/AuthContext';
import { hasPermission, checkPermission, getPermissions, Permission } from '../lib/permissions';

export const usePermissions = () => {
  const { user } = useAuth();

  return {
    /**
     * Check if the current user has a specific permission
     */
    can: (action: string, subject: string, targetUserId?: string): boolean => {
      return hasPermission(user, action, subject, targetUserId);
    },

    /**
     * Throw an error if the current user doesn't have the specified permission
     */
    enforce: (action: string, subject: string, targetUserId?: string): void => {
      checkPermission(user, action, subject, targetUserId);
    },

    /**
     * Get all permissions for the current user
     */
    getAllPermissions: (): Permission[] => {
      if (!user) return [];
      return getPermissions(user.user_type);
    },

    /**
     * Check if the current user is a patient
     */
    isPatient: (): boolean => {
      return user?.user_type === 'patient';
    },

    /**
     * Check if the current user is a caregiver
     */
    isCaregiver: (): boolean => {
      return user?.user_type === 'caregiver';
    },

    /**
     * Check if the current user owns a resource
     */
    isOwner: (resourceUserId: string): boolean => {
      return user?.id === resourceUserId;
    },
  };
}; 