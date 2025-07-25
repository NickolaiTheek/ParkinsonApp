import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
  Avatar,
  useTheme,
  Surface,
  Chip,
  Divider,
  ActivityIndicator,
  TextInput,
  Button,
  IconButton,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  SlideInRight,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import ConnectionGuide from './ConnectionGuide';
import PatientDataView from './PatientDataView';
import NotificationService from '../services/NotificationService';

const { width: screenWidth } = Dimensions.get('window');
const AnimatedCard = Animated.createAnimatedComponent(Card);
const AnimatedSurface = Animated.createAnimatedComponent(Surface);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface PatientHealthData {
  medicationAdherence: {
    taken: number;
    total: number;
    percentage: number;
  };
  nextAppointment: {
    daysUntil: number;
    doctorName?: string;
    appointmentDate?: string;
  };
  recentSymptoms: {
    severity: number;
    lastLogged?: string;
  };
  sleepQuality: {
    hours: number;
    quality: string;
    lastNight: boolean;
  };
}

interface PatientSummary {
  id: string;
  name: string;
  email: string;
  avatar: string;
  healthData: PatientHealthData;
  lastActive?: string;
}

// Component for connecting with new patients
const ConnectWithPatient: React.FC = () => {
  const theme = useTheme();
  const { user, loadRelationships } = useAuth();
  
  const [inviteCode, setInviteCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const handleConnect = async () => {
    if (!inviteCode.trim()) return;
    setIsConnecting(true);
    setStatus(null);

    try {
      const { error } = await supabase.functions.invoke('accept-invitation-v2', {
        body: { invitation_code: inviteCode.trim() },
      });

      if (error) {
        throw new Error(error.context?.status === 409 ? 'You are already connected to this patient.' : 'Invalid or expired invitation code.');
      }
      setStatus({ message: 'Successfully connected!', type: 'success' });
      setInviteCode('');
      if (user) await loadRelationships(user);
    } catch (e: any) {
      setStatus({ message: e.message || 'An unexpected error occurred.', type: 'error' });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <Text variant="titleMedium" style={{ fontWeight: '600' }}>Connect with New Patient</Text>
      <Text variant="bodySmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>Ask your patient to share their invitation code.</Text>
      <TextInput
        mode="outlined"
        label="Patient Invitation Code"
        value={inviteCode}
        onChangeText={setInviteCode}
        disabled={isConnecting}
      />
      {status && <Text style={{ color: status.type === 'error' ? theme.colors.error : theme.colors.primary, marginTop: 8 }}>{status.message}</Text>}
      <Button
        mode="contained"
        onPress={handleConnect}
        loading={isConnecting}
        disabled={!inviteCode.trim()}
        style={{ marginTop: 8 }}
        icon="account-plus"
      >
        Connect
      </Button>
    </>
  );
};

const CaregiverDashboard: React.FC = () => {
  const theme = useTheme();
  const { user, patients, loading: authLoading, loadRelationships } = useAuth();
  const responsive = useResponsive();
  
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Animation values
  const fadeAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(0.9);

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // This effect now correctly handles the initial selection of a patient.
  // It only runs when the list of patients changes and ensures a default selection is made.
  useEffect(() => {
    if (patients.length > 0 && !patients.some(p => p.id === selectedPatientId)) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (user) {
      await loadRelationships(user);
    }
    setIsRefreshing(false);
  }, [user, loadRelationships]);

  // Animate on mount
  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: 800 });
    scaleAnim.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ scale: scaleAnim.value }],
  }));

  const getInitials = (firstName?: string, lastName?: string) => (firstName && lastName ? `${firstName.charAt(0)}${lastName.charAt(0)}` : 'P').toUpperCase();

  // Utility to get display name from patient profile
  const getPatientDisplayName = (p) => {
    let firstName = p.first_name;
    let lastName = p.last_name;
    if (typeof firstName === 'string' && firstName.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(firstName);
        firstName = parsed.first_name || '';
        lastName = parsed.last_name || '';
      } catch (e) {
        // fallback to raw values
      }
    }
    return `${firstName || ''} ${lastName || ''}`.trim();
  };

  // Start automatic caregiver alert polling
  useEffect(() => {
    let isComponentMounted = true;

    const startPolling = async () => {
      if (user && isComponentMounted) {
        console.log('[CaregiverDashboard] Starting automatic caregiver alert polling...');
        await NotificationService.startCaregiverAlertPolling();
      }
    };

    startPolling();

    // Cleanup function
    return () => {
      isComponentMounted = false;
      console.log('[CaregiverDashboard] Stopping automatic caregiver alert polling...');
      NotificationService.stopCaregiverAlertPolling();
    };
  }, [user]);

  if (authLoading && patients.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading Your Profile...</Text>
      </View>
    );
  }

  if (patients.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#10b981" />
        
        {/* Modern Header */}
        <LinearGradient colors={['#10b981', '#059669', '#047857']} style={styles.headerGradient}>
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <View>
                <Text variant="headlineMedium" style={styles.headerTitle}>Care Dashboard</Text>
                <Text variant="bodyMedium" style={styles.headerSubtitle}>Monitor your patients' health</Text>
              </View>
              <IconButton 
                icon="bell-outline" 
                iconColor="#FFFFFF" 
                size={24}
                style={styles.notificationIcon}
              />
            </View>
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyStateContainer}>
            <LinearGradient colors={['#f0fdf4', '#dcfce7']} style={styles.emptyStateCard}>
              <MaterialCommunityIcons name="account-heart" size={72} color="#10b981" />
              <Text variant="headlineSmall" style={styles.emptyTitle}>No Patients Connected</Text>
              <Text variant="bodyMedium" style={styles.emptySubtitle}>
                Connect with a patient to begin monitoring their health data and provide better care.
            </Text>
            </LinearGradient>
          </Animated.View>

          <AnimatedCard entering={FadeInDown.delay(400)} style={styles.connectionCard} elevation={0}>
            <Card.Content style={styles.connectionCardContent}>
              <View style={styles.connectionHeader}>
                <MaterialCommunityIcons name="account-plus" size={28} color="#10b981" />
                <Text variant="titleMedium" style={styles.connectionTitle}>Connect with Patient</Text>
              </View>
              <ConnectWithPatient />
            </Card.Content>
          </AnimatedCard>

          <Animated.View entering={FadeInDown.delay(600)}>
          <ConnectionGuide userType="caregiver" />
      </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#10b981" />
      
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Replace the LinearGradient header with a modern, minimal white header similar to the patient home screen.
            Use a left-aligned avatar, name, and welcome message, with notification and refresh icons on the right.
            Remove the green gradient, border radius, and floating card look. Do not change any existing functions or business logic. */}
        <View style={styles.modernHeaderContainer}>
          <View style={styles.modernHeaderRow}>
            {user && (
              <Avatar.Text
                size={48}
                label={getInitials(user.first_name, user.last_name)}
                style={styles.modernAvatar}
                labelStyle={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}
              />
            )}
            <View style={styles.modernHeaderTextContainer}>
              <Text style={styles.modernWelcome}>Welcome back,</Text>
              <Text style={styles.modernName}>{user?.first_name} {user?.last_name}</Text>
            </View>
            <View style={styles.modernHeaderActions}>
              <IconButton 
                icon="bell-outline" 
                iconColor="#6b7280" 
                size={22}
                style={styles.modernNotificationIcon}
              />
              <IconButton 
                icon="refresh" 
                iconColor="#6b7280" 
                size={22}
                onPress={onRefresh}
                style={styles.modernRefreshIcon}
              />
            </View>
          </View>
          <Text style={styles.modernDashboardTitle}>Care Dashboard</Text>
          <Text style={styles.modernDashboardSubtitle}>
            Managing {patients.length} patient{patients.length !== 1 ? 's' : ''}
              </Text>
            </View>
            
        {/* Enhanced Patient Selector */}
        <AnimatedCard entering={FadeInDown.delay(100)} style={styles.selectorCard} elevation={0}>
          <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.selectorGradient}>
          <Card.Content style={styles.selectorContent}>
            <View style={styles.selectorHeader}>
                <View style={styles.selectorTitleContainer}>
                  <MaterialCommunityIcons name="account-supervisor" size={26} color="#10b981" />
                  <Text variant="titleLarge" style={styles.selectorTitle}>My Patients</Text>
                  <View style={styles.patientBadge}>
                    <Text style={styles.patientBadgeText}>{patients.length}</Text>
                  </View>
                </View>
            </View>
            
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.patientScrollContainer}
              >
                {patients.map((p, index) => (
                  <AnimatedTouchableOpacity 
                    key={p.id}
                    entering={SlideInRight.delay(index * 100)}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPatientId(p.id);
                  }}
                    style={[
                      styles.modernPatientChip,
                      {
                        backgroundColor: selectedPatientId === p.id ? '#10b981' : '#ffffff',
                        borderColor: selectedPatientId === p.id ? '#10b981' : '#e5e7eb',
                        shadowColor: selectedPatientId === p.id ? '#10b981' : '#000000',
                        shadowOpacity: selectedPatientId === p.id ? 0.25 : 0.1,
                        shadowOffset: { width: 0, height: selectedPatientId === p.id ? 6 : 2 },
                        shadowRadius: selectedPatientId === p.id ? 12 : 4,
                        elevation: selectedPatientId === p.id ? 8 : 2,
                      }
                    ]}
                  >
                  <Avatar.Text
                      size={48} 
                      label={getInitials(p.first_name, p.last_name)} 
                      style={{
                        backgroundColor: selectedPatientId === p.id ? 'rgba(255,255,255,0.2)' : '#10b981',
                        marginBottom: 8,
                      }}
                      labelStyle={{
                        color: selectedPatientId === p.id ? '#ffffff' : '#ffffff',
                        fontSize: 18,
                        fontWeight: 'bold',
                      }}
                    />
                    <Text 
                      variant="titleSmall" 
                      style={{
                        color: selectedPatientId === p.id ? '#ffffff' : '#374151',
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      {getPatientDisplayName(p)}
                </Text>
                    
                    {selectedPatientId === p.id && (
                  <MaterialCommunityIcons 
                        name="check-circle" 
                        size={20} 
                        color="#ffffff" 
                        style={styles.selectedIcon}
                      />
                    )}
                  </AnimatedTouchableOpacity>
                ))}
              </ScrollView>
              </Card.Content>
          </LinearGradient>
            </AnimatedCard>

        {/* Patient Data Section */}
        {selectedPatient ? (
          <Animated.View entering={FadeInUp.delay(300)}>
            <PatientDataView key={selectedPatient.id} patient={selectedPatient} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.selectPatientContainer}>
            <Surface style={styles.selectPatientCard} elevation={0}>
              <MaterialCommunityIcons name="account-search" size={48} color="#6b7280" />
              <Text variant="titleMedium" style={styles.selectPatientTitle}>Select a Patient</Text>
              <Text variant="bodyMedium" style={styles.selectPatientSubtitle}>
                Choose a patient from above to view their health data and care information.
                  </Text>
            </Surface>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc' 
  },
  headerGradient: {
    paddingTop: StatusBar.currentHeight || 44,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  notificationIcon: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  refreshIcon: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  scrollContainer: {
    flex: 1,
    marginTop: -10,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  
  // Empty State Styles
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 20,
  },
  emptyStateCard: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 24, 
    fontWeight: 'bold',
    marginTop: 16,
    color: '#1f2937',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8, 
    color: '#6b7280', 
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  
  // Connection Card Styles
  connectionCard: { 
    borderRadius: 20, 
    marginTop: 24, 
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  connectionCardContent: {
    padding: 0,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  connectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10b981',
  },
  
  // Patient Selector Styles
  selectorCard: { 
    marginBottom: 20, 
    backgroundColor: '#ffffff', 
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  selectorGradient: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  selectorContent: {
    padding: 20,
  },
  selectorHeader: {
    marginBottom: 16,
  },
  selectorTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },
  patientBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
  },
  patientBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  
  // Patient Chip Styles
  patientScrollContainer: {
    paddingHorizontal: 4,
    gap: 16,
  },
  modernPatientChip: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    minWidth: 120,
    position: 'relative',
  },
  selectedIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  
  // Select Patient State
  selectPatientContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 20,
  },
  selectPatientCard: {
    padding: 32,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    maxWidth: screenWidth - 64,
  },
  selectPatientTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  selectPatientSubtitle: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  
  // Legacy styles (keeping for compatibility)
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredContent: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 10 },
  patientChip: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 20, marginRight: 8 },

  // Test Section Styles
  testSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  testSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  caregiverHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 20,
  },
  caregiverAvatar: {
    backgroundColor: '#10b981',
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  caregiverHeaderTextContainer: {
    flex: 1,
  },
  caregiverWelcome: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 4,
  },
  caregiverName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  caregiverHeaderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },
  headerGradientCompact: {
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerRowCompact: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: 0,
  },
  headerActionsCompact: {
    flexDirection: 'row',
    gap: 2,
  },
  notificationIconCompact: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 18,
    margin: 0,
    padding: 0,
  },
  refreshIconCompact: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 18,
    margin: 0,
    padding: 0,
  },
  caregiverHeaderCenterCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
    gap: 2,
  },
  caregiverAvatarCompact: {
    backgroundColor: '#10b981',
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#ffffff',
    marginBottom: 2,
  },
  caregiverWelcomeCompact: {
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 0,
    fontWeight: '400',
  },
  caregiverNameCompact: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 0,
    marginTop: 0,
  },
  dashboardTitleCompact: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 0,
    marginBottom: 0,
  },
  headerSubtitleCompact: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 0,
    marginBottom: 0,
    fontWeight: '400',
  },
  headerGradientScrollable: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  headerRowCompactScrollable: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 0,
    paddingHorizontal: 0,
    marginTop: 14,
  },
  caregiverHeaderCenterCompactScrollable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
    gap: 1,
  },
  modernHeaderContainer: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modernHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modernAvatar: {
    backgroundColor: '#16c47e',
    marginRight: 14,
  },
  modernHeaderTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  modernWelcome: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '400',
    marginBottom: 0,
  },
  modernName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 0,
  },
  modernHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 2,
  },
  modernNotificationIcon: {
    backgroundColor: 'transparent',
    margin: 0,
    padding: 0,
  },
  modernRefreshIcon: {
    backgroundColor: 'transparent',
    margin: 0,
    padding: 0,
  },
  modernDashboardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 0,
    marginBottom: 0,
  },
  modernDashboardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
    marginBottom: 0,
    fontWeight: '400',
  },
});

export default CaregiverDashboard; 