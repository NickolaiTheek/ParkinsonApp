import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Clipboard,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  Surface,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';

const AnimatedCard = Animated.createAnimatedComponent(Card);

interface InvitationData {
  code: string;
  expires: string;
}

const PatientInviteCard: React.FC = () => {
  const { user, caregivers } = useAuth();
  const theme = useTheme();
  
  // Only show for patients
  if (!user || (user.role !== 'patient' && user.user_type !== 'patient')) {
    console.log('PatientInviteCard: Not rendering for non-patient user:', {
      hasUser: !!user,
      role: user?.role,
      userType: user?.user_type
    });
    return null;
  }
  
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string>('');
  const [showConnectedCaregivers, setShowConnectedCaregivers] = useState(false);
  
  // Animation values
  const scaleAnim = useSharedValue(1);

  // Show existing connections warning if any caregivers are connected
  const hasExistingConnections = caregivers && caregivers.length > 0;

  const generateInvitation = useCallback(async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Double-check role before generating invitation
    if (user.role !== 'patient') {
      Alert.alert('Error', 'Only patients can generate invitation codes. Caregivers should accept codes from patients.');
      return;
    }

    console.log('=== Generate Invitation Debug ===');
    console.log('User ID:', user.id);
    console.log('User email:', user.email);
    console.log('User role:', user.role);

    setIsGenerating(true);
    setError(null);
    setInvitation(null);

    try {
      // Get the current session to ensure we have a valid token
      console.log('1. Getting session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('Session data:', {
        sessionExists: !!session,
        userExists: !!session?.user,
        tokenExists: !!session?.access_token,
        userIdMatch: session?.user?.id === user.id,
        sessionUserId: session?.user?.id,
        contextUserId: user.id,
        sessionUserEmail: session?.user?.email,
        contextUserEmail: user.email,
        sessionUserRole: session?.user?.user_metadata?.role,
        contextUserRole: user.role,
        tokenLength: session?.access_token?.length
      });
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        console.error('No session found');
        throw new Error('No active session found. Please log in again.');
      }

      // Critical check: Ensure session user matches current user
      if (session.user?.id !== user.id) {
        console.error('Session user mismatch!', {
          sessionUserId: session.user?.id,
          contextUserId: user.id,
          sessionEmail: session.user?.email,
          contextEmail: user.email
        });
        throw new Error('Session mismatch detected. Please log out and log in again.');
      }

      // Check session user role
      if (session.user?.user_metadata?.role !== 'patient') {
        console.error('Session user is not a patient:', session.user?.user_metadata?.role);
        throw new Error('Only patients can generate invitation codes. Please ensure you are logged in as a patient.');
      }

      console.log('2. Calling function with headers...');
      console.log('Authorization header:', `Bearer ${session.access_token.substring(0, 20)}...`);

      const { data, error: funcError } = await supabase.functions.invoke('generate-invitation', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('3. Function response:', {
        data,
        error: funcError,
        hasError: !!funcError,
        errorMessage: funcError?.message,
        errorDetails: funcError?.details
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error.details || data.error.message);

      console.log('4. Success! Setting invitation:', data);
      setInvitation({ 
        code: data.invitation_code, 
        expires: data.expires_at 
      });
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
    } catch (err: any) {
      console.error('Error generating invitation:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: err.cause
      });
      setError(err.message || 'Failed to generate invitation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [user]);

  const copyToClipboard = useCallback(async () => {
    if (!invitation) return;
    
    try {
      Clipboard.setString(invitation.code);
      Alert.alert('Copied!', 'Invitation code copied to clipboard');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  }, [invitation]);

  const shareInvitation = useCallback(async () => {
    if (!invitation) return;
    
    try {
      const result = await Share.share({
        message: `I'd like to connect with you on my Parkinson's care app. Please use invitation code: ${invitation.code}`,
        title: 'Patient Care Connection',
      });
      
      if (result.action === Share.sharedAction) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to share invitation');
    }
  }, [invitation]);

  const handlePress = useCallback(() => {
    scaleAnim.value = withSpring(0.95, { damping: 15, stiffness: 400 }, () => {
      scaleAnim.value = withSpring(1, { damping: 15, stiffness: 400 });
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const formatExpiryDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <AnimatedCard
      entering={FadeInDown.delay(300).springify()}
      style={[styles.card, animatedStyle]}
      elevation={3}
    >
      <LinearGradient
        colors={['#3b82f6', '#1d4ed8']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons name="account-plus" size={28} color="#FFFFFF" />
          <Text variant="titleLarge" style={styles.title}>
            Connect with Caregiver
          </Text>
        </View>
        
        <Text variant="bodyMedium" style={[styles.cardDescription, { color: theme.colors.onSurfaceVariant }]}>
          Generate an invitation code for your caregiver to connect and monitor your health data.
        </Text>

        {/* Show existing connections if any */}
        {hasExistingConnections && (
          <View style={[styles.connectionInfo, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="account-check" size={20} color={theme.colors.primary} />
            <Text variant="bodySmall" style={[styles.connectionText, { color: theme.colors.primary }]}>
              You have {caregivers.length} connected caregiver{caregivers.length > 1 ? 's' : ''}
            </Text>
            <TouchableOpacity 
              onPress={() => setShowConnectedCaregivers(!showConnectedCaregivers)}
              style={styles.toggleButton}
            >
              <Text variant="bodySmall" style={[styles.toggleText, { color: theme.colors.primary }]}>
                {showConnectedCaregivers ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Show connected caregivers list */}
        {hasExistingConnections && showConnectedCaregivers && (
          <View style={[styles.caregiversList, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="bodySmall" style={[styles.caregiversTitle, { color: theme.colors.onSurfaceVariant }]}>
              Connected Caregivers:
            </Text>
            {caregivers.map((caregiver, index) => (
              <View key={caregiver.id} style={styles.caregiverItem}>
                <MaterialCommunityIcons name="account" size={16} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={[styles.caregiverName, { color: theme.colors.onSurfaceVariant }]}>
                  {caregiver.first_name} {caregiver.last_name} ({caregiver.email})
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Warning for existing connections */}
        {hasExistingConnections && (
          <View style={[styles.warningBox, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <MaterialCommunityIcons name="information" size={16} color={theme.colors.tertiary} />
            <Text variant="bodySmall" style={[styles.warningText, { color: theme.colors.tertiary }]}>
              Generating a new code will allow additional caregivers to connect. Existing connections will remain active.
            </Text>
          </View>
        )}

        {!invitation && !isGenerating && (
          <Button
            mode="contained"
            onPress={() => {
              generateInvitation();
            }}
            style={styles.generateButton}
            contentStyle={styles.generateButtonContent}
            icon="qrcode"
            loading={isGenerating}
          >
            Generate Invitation Code
          </Button>
        )}

        {isGenerating && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text variant="bodyMedium" style={styles.loadingText}>
              Generating invitation...
            </Text>
          </View>
        )}

        {invitation && (
          <View style={styles.invitationContainer}>
            <Surface style={styles.codeContainer} elevation={2}>
              <Text variant="headlineMedium" style={styles.invitationCode}>
                {invitation.code}
              </Text>
              <Text variant="bodySmall" style={styles.expiryText}>
                Expires: {formatExpiryDate(invitation.expires)}
              </Text>
            </Surface>

            <View style={styles.qrContainer}>
              <QRCode
                value={invitation.code}
                size={120}
                color={theme.colors.onSurface}
                backgroundColor={theme.colors.surface}
              />
              <Text variant="bodySmall" style={styles.qrText}>
                QR Code for easy sharing
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <Button
                mode="contained"
                onPress={copyToClipboard}
                style={styles.actionButton}
                buttonColor="rgba(255,255,255,0.2)"
                textColor="#FFFFFF"
                icon="content-copy"
                compact
              >
                Copy
              </Button>
              <Button
                mode="contained"
                onPress={shareInvitation}
                style={styles.actionButton}
                buttonColor="rgba(255,255,255,0.2)"
                textColor="#FFFFFF"
                icon="share"
                compact
              >
                Share
              </Button>
              <Button
                mode="outlined"
                onPress={generateInvitation}
                style={styles.actionButton}
                textColor="#FFFFFF"
                icon="refresh"
                compact
              >
                New Code
              </Button>
            </View>
          </View>
        )}

        {error && (
          <Surface style={styles.errorContainer} elevation={1}>
            <MaterialCommunityIcons name="alert-circle" size={20} color={theme.colors.error} />
            <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </Text>
          </Surface>
        )}
      </LinearGradient>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
  },
  gradient: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    flex: 1,
  },
  cardDescription: {
    marginBottom: 20,
    lineHeight: 20,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  connectionText: {
    flex: 1,
    marginLeft: 4,
  },
  toggleButton: {
    padding: 4,
  },
  toggleText: {
    fontWeight: 'bold',
  },
  caregiversList: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  caregiversTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  caregiverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  caregiverName: {
    flex: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  warningText: {
    flex: 1,
  },
  generateButton: {
    marginTop: 8,
  },
  generateButtonContent: {
    padding: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.9)',
  },
  invitationContainer: {
    gap: 16,
  },
  codeContainer: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  invitationCode: {
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 4,
  },
  expiryText: {
    opacity: 0.7,
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  qrText: {
    opacity: 0.7,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
  },
});

export default PatientInviteCard; 