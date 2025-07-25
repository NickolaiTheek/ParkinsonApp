import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, Avatar, useTheme, Surface, ActivityIndicator } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, UserProfile } from '../lib/supabase';
import { format } from 'date-fns';

const AnimatedSurface = Animated.createAnimatedComponent(Surface);

interface PatientHealthData {
  medicationAdherence: { taken: number; total: number; percentage: number; };
  nextAppointment: { daysUntil: number; doctorName?: string; appointmentDate?: string; };
  sleepQuality: { hours: number; quality: string; lastNight: boolean; };
}

interface PatientDataViewProps {
  patient: UserProfile;
}

const PatientDataView: React.FC<PatientDataViewProps> = ({ patient }) => {
  const theme = useTheme();
  const [healthData, setHealthData] = useState<PatientHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPatientHealthData = useCallback(async (patientId: string) => {
    setIsLoading(true);
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // 1. Fetch medication adherence using the same logic as HomeScreen
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'short' });
      
      // Get today's scheduled medications - use user_id in medication_schedules
      const { data: schedules, error: schedulesError } = await supabase
        .from('medication_schedules')
        .select(`
          id,
          medication_id,
          scheduled_time,
          days_of_week,
          medications!inner(
            id,
            name
          )
        `)
        .eq('user_id', patientId)
        .contains('days_of_week', [dayOfWeek]);

      if (schedulesError) throw schedulesError;

      const totalScheduled = schedules?.length || 0;

      // Get today's taken medications
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const { data: logs, error: logsError } = await supabase
        .from('medication_administration_logs')
        .select('id, medication_id, status')
        .eq('user_id', patientId)
        .gte('taken_at', todayStart.toISOString())
        .lt('taken_at', todayEnd.toISOString())
        .eq('status', 'taken');

      if (logsError) throw logsError;

      const totalTaken = logs?.length || 0;
      const medicationPercentage = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;

      // 2. Fetch next appointment - use patient_id for doctor_appointments
      const { data: appointments, error: appointmentsError } = await supabase
        .from('doctor_appointments')
        .select('appointment_date, doctor_name, notes')
        .eq('patient_id', patientId)
        .gte('appointment_date', todayStr)
        .order('appointment_date', { ascending: true })
        .limit(1);

      if (appointmentsError) throw appointmentsError;

      let nextAppointmentData = { daysUntil: -1, doctorName: undefined, appointmentDate: undefined };
      if (appointments && appointments.length > 0) {
        const appointment = appointments[0];
        const appointmentDate = new Date(appointment.appointment_date);
        const todayDate = new Date(todayStr);
        const diffTime = appointmentDate.getTime() - todayDate.getTime();
        nextAppointmentData = {
          daysUntil: Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24))),
          doctorName: appointment.doctor_name,
          appointmentDate: appointment.appointment_date,
        };
      }

      // 3. Fetch sleep data using the same logic as HomeScreen
      const { data: sleepMetrics, error: sleepError } = await supabase
        .from('health_metrics')
        .select(`
          value,
          recorded_at,
          health_metric_categories!inner(name)
        `)
        .eq('patient_id', patientId)
        .eq('health_metric_categories.name', 'Sleep Duration')
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (sleepError) throw sleepError;

      let sleepQualityData = { hours: 0, quality: 'Unknown', lastNight: false };
      if (sleepMetrics && sleepMetrics.length > 0) {
        const hours = parseFloat(sleepMetrics[0].value);
        sleepQualityData = {
          hours,
          quality: hours >= 8 ? 'Great' : hours >= 7 ? 'Good' : hours >= 5 ? 'Fair' : 'Poor',
          lastNight: true
        };
      }

      const newHealthData: PatientHealthData = {
        medicationAdherence: { 
          taken: totalTaken, 
          total: totalScheduled, 
          percentage: medicationPercentage 
        },
        nextAppointment: nextAppointmentData,
        sleepQuality: sleepQualityData,
      };

      setHealthData(newHealthData);

    } catch (error) {
      console.error('Error fetching patient health data:', error);
      Alert.alert('Error', 'Failed to load patient health data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (patient?.id) {
      fetchPatientHealthData(patient.id);
    }
  }, [patient?.id, fetchPatientHealthData]);

  const getInitials = (firstName?: string, lastName?: string) => (firstName && lastName ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() : 'P');
  const getAdherenceColor = (p: number) => (p >= 80 ? '#22c55e' : p >= 60 ? '#f59e0b' : '#ef4444');
  const getDaysColor = (d: number) => (d === -1 ? theme.colors.outline : d === 0 ? '#ef4444' : d <= 3 ? '#f59e0b' : '#22c55e');
  const getSleepQualityColor = (q: string) => (q === 'Great' ? '#22c55e' : q === 'Good' ? '#3b82f6' : q === 'Fair' ? '#f59e0b' : '#ef4444');

  // Add a utility to get display name from patient profile, similar to CaregiverDashboard
  const getPatientDisplayName = (p: UserProfile) => {
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

  if (isLoading) return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.centered}>
      <ActivityIndicator size="large" color="#10b981" />
      <Text style={styles.loadingText}>Loading patient data...</Text>
    </Animated.View>
  );
  
  if (!healthData) return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.centered}>
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#f59e0b" />
      <Text style={styles.noDataText}>No health data available</Text>
      <Text style={styles.noDataSubtext}>Patient health data could not be loaded</Text>
    </Animated.View>
  );

  return (
    <Animated.View entering={FadeInDown.duration(500)}>
      {/* Enhanced Patient Header */}
      <Card style={styles.patientHeaderCard} elevation={0}>
        <LinearGradient 
          colors={['#10b981', '#059669', '#047857']} 
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.avatarContainer}>
              <Avatar.Text 
                size={72} 
                label={getInitials(patient.first_name, patient.last_name)} 
                style={styles.avatar}
                labelStyle={styles.avatarLabel}
              />
              <View style={styles.onlineIndicator} />
            </View>
            <View style={styles.patientInfo}>
              <Text variant="headlineMedium" style={styles.headerName}>
                {patient.first_name} {patient.last_name}
              </Text>
              <Text variant="bodyLarge" style={styles.headerEmail}>{patient.email}</Text>
              <View style={styles.statusContainer}>
                <MaterialCommunityIcons name="heart-pulse" size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.statusText}>Active Patient</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Card>

      {/* Enhanced Stats Grid */}
      <View style={styles.statsContainer}>
        <View style={styles.sectionHeader}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Health Overview</Text>
          <Text variant="bodyMedium" style={styles.sectionSubtitle}>Latest health metrics and status</Text>
        </View>
        
        {/* Primary Health Metrics Row */}
        <View style={styles.primaryMetricsRow}>
          <StatCard 
            icon="pill" 
            value={`${healthData.medicationAdherence.percentage}%`} 
            label="Medication Adherence" 
            subtext={`${healthData.medicationAdherence.taken}/${healthData.medicationAdherence.total} taken today`} 
            color={getAdherenceColor(healthData.medicationAdherence.percentage)} 
            delay={100}
            trend={healthData.medicationAdherence.percentage >= 80 ? 'up' : healthData.medicationAdherence.percentage >= 60 ? 'stable' : 'down'}
            isPrimary={true}
          />
          <StatCard 
            icon="calendar-heart" 
            value={healthData.nextAppointment.daysUntil === -1 ? 'None' : healthData.nextAppointment.daysUntil === 0 ? 'Today' : `${healthData.nextAppointment.daysUntil}d`} 
            label="Next Appointment" 
            subtext={healthData.nextAppointment.doctorName ? `Dr. ${healthData.nextAppointment.doctorName}` : 'No upcoming appointments'} 
            color={getDaysColor(healthData.nextAppointment.daysUntil)} 
            delay={200}
            trend={healthData.nextAppointment.daysUntil <= 1 ? 'urgent' : 'stable'}
            isPrimary={true}
          />
        </View>
        
        {/* Secondary Health Metrics Row */}
        <View style={styles.secondaryMetricsRow}>
          <StatCard 
            icon="sleep" 
            value={healthData.sleepQuality.hours > 0 ? `${healthData.sleepQuality.hours}h` : '--'} 
            label="Sleep Quality" 
            subtext={healthData.sleepQuality.quality} 
            color={getSleepQualityColor(healthData.sleepQuality.quality)} 
            delay={300}
            trend={healthData.sleepQuality.hours >= 8 ? 'up' : healthData.sleepQuality.hours >= 6 ? 'stable' : 'down'}
            isPrimary={false}
          />
          <StatCard 
            icon="heart-pulse" 
            value="Stable" 
            label="Overall Health" 
            subtext="Based on recent metrics" 
            color="#3b82f6" 
            delay={400}
            trend="stable"
            isPrimary={false}
          />
        </View>
      </View>
    </Animated.View>
  );
};

const StatCard = ({ icon, value, label, subtext, color, delay, trend, isPrimary }: any) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      case 'urgent': return 'alert-circle';
      default: return 'trending-neutral';
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return '#22c55e';
      case 'down': return '#ef4444';
      case 'urgent': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <AnimatedSurface 
      entering={FadeInDown.delay(delay)} 
      style={[
        isPrimary ? styles.primaryStatCard : styles.secondaryStatCard,
        { shadowColor: color }
      ]} 
      elevation={0}
    >
      <LinearGradient 
        colors={['#ffffff', '#fafbfc']} 
        style={styles.statCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Card Header with Icon and Trend */}
        <View style={styles.statCardHeader}>
          <View style={[styles.statIcon, { backgroundColor: `${color}12` }]}>
            <MaterialCommunityIcons name={icon} size={isPrimary ? 32 : 28} color={color} />
          </View>
          <View style={[styles.trendIndicator, { backgroundColor: `${getTrendColor()}12` }]}>
            <MaterialCommunityIcons name={getTrendIcon()} size={16} color={getTrendColor()} />
          </View>
        </View>
        
        {/* Card Content */}
        <View style={styles.statCardContent}>
          <Text variant="bodyMedium" style={styles.statLabel}>{label}</Text>
          <Text 
            variant={isPrimary ? "displaySmall" : "headlineMedium"} 
            style={[
              styles.statValue, 
              { 
                color,
                fontSize: isPrimary ? 36 : 28,
                marginBottom: isPrimary ? 12 : 8,
              }
            ]}
          >
            {value}
          </Text>
          {subtext && (
            <Text variant="bodySmall" style={styles.statSubtext} numberOfLines={2}>
              {subtext}
            </Text>
          )}
        </View>
        
        {/* Progress Bar for Primary Cards */}
        {isPrimary && (icon === 'pill' || icon === 'sleep') && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBackground}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    backgroundColor: color,
                    width: icon === 'pill' 
                      ? `${Math.min(100, parseInt(value))}%`
                      : `${Math.min(100, (parseFloat(value) / 8) * 100)}%`
                  }
                ]} 
              />
            </View>
          </View>
        )}
      </LinearGradient>
    </AnimatedSurface>
  );
};

const styles = StyleSheet.create({
  centered: { 
    height: 200, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    margin: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  noDataText: {
    marginTop: 16,
    fontSize: 18,
    color: '#1f2937',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  noDataSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  
  // Patient Header Styles
  patientHeaderCard: { 
    marginBottom: 24, 
    backgroundColor: '#ffffff', 
    borderRadius: 24, 
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  gradient: { 
    padding: 24,
  },
  headerContent: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 20,
  },
  avatarContainer: { 
    position: 'relative',
    alignItems: 'center',
  },
  avatar: { 
    backgroundColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarLabel: { 
    color: '#FFFFFF', 
    fontWeight: 'bold',
    fontSize: 24,
  },
  onlineIndicator: { 
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16, 
    height: 16, 
    borderRadius: 8, 
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  patientInfo: { 
    flex: 1,
  },
  headerName: { 
    color: '#FFFFFF', 
    fontWeight: 'bold',
    fontSize: 24,
    marginBottom: 4,
  },
  headerEmail: { 
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    marginBottom: 8,
  },
  statusContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusText: { 
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Stats Section Styles
  statsContainer: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  sectionHeader: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: { 
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
    color: '#1f2937',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  
  // Metrics Layout
  primaryMetricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  secondaryMetricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  
  // Stat Card Styles
  primaryStatCard: { 
    flex: 1,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: '#ffffff',
  },
  secondaryStatCard: { 
    flex: 1,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    backgroundColor: '#ffffff',
  },
  statCardGradient: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 24,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  statIcon: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  trendIndicator: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  statCardContent: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  statLabel: { 
    marginBottom: 12, 
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: { 
    fontWeight: 'bold',
    textAlign: 'left',
    lineHeight: 40,
  },
  statSubtext: { 
    fontSize: 14, 
    color: '#9ca3af',
    lineHeight: 20,
    fontWeight: '500',
    marginTop: 4,
  },
  
  // Progress Bar Styles
  progressContainer: {
    marginTop: 16,
  },
  progressBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
});

export default PatientDataView; 