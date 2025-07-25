import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Dimensions,
  StatusBar,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {
  Text,
  useTheme,
  Card,
  ActivityIndicator,
  Surface,
  Chip,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  Layout,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Calendar, DateData } from 'react-native-calendars';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const AnimatedCard = Animated.createAnimatedComponent(Card);

// Types
interface CalendarEvent {
  id: string;
  type: 'medication' | 'appointment';
  title: string;
  time: string;
  date: string;
  description?: string;
  status?: string;
  // Additional fields for medication events
  medicationId?: string;
  scheduleId?: string;
  dosage?: string;
  instructions?: string;
  logStatus?: 'taken' | 'skipped';
  medicationLogId?: string;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  schedule_times: string[];
  frequency: string;
  start_date: string;
  end_date?: string;
}

interface DoctorAppointment {
  id: string;
  doctor_name: string;
  doctor_specialty: string;
  appointment_date: string;
  appointment_time: string;
  location: string;
  status: string;
}

interface MedicationLog {
  id: string;
  medication_id: string;
  schedule_id?: string;
  user_id: string;
  taken_at: string;
  status: 'taken' | 'skipped';
  notes?: string;
  intended_dose_time: string;
}

const UnifiedCalendarScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<StackNavigationProp<any>>();
  const { user } = useAuth();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  
  // New state for medication interactions
  const [isLogging, setIsLogging] = useState(false);
  const isProcessingRef = useRef(false);

  // Dynamic styles based on device type
  const getResponsiveStyles = () => ({
    headerPadding: {
      paddingTop: insets.top + 16, // Fixed padding instead of responsive.spacing.sm
    },
    contentPadding: {
      padding: responsive.spacing.padding,
      paddingBottom: responsive.spacing.xxl,
    },
    calendarContainer: {
      borderRadius: responsive.cardSize.borderRadius,
      padding: responsive.cardSize.padding,
      marginBottom: responsive.spacing.lg,
      ...responsive.cardSize.shadowOffset && {
        shadowOffset: responsive.cardSize.shadowOffset,
        shadowRadius: responsive.cardSize.shadowRadius,
        elevation: responsive.cardSize.elevation,
      },
    },
    sectionGap: {
      marginBottom: responsive.spacing.sectionGap,
    },
    titleSize: {
      fontSize: responsive.fontSizes.titleLarge,
    },
    statsGrid: {
      flexDirection: 'row' as const,
      gap: responsive.spacing.md,
      flexWrap: responsive.isTablet ? 'wrap' as const : 'nowrap' as const,
    },
    statCard: {
      flex: responsive.isTablet ? 0 : 1,
      width: responsive.isTablet ? 
        (responsive.width - responsive.spacing.padding * 2 - responsive.spacing.md) / 2 : 
        undefined,
      minHeight: responsive.cardSize.minHeight * 0.8,
      padding: responsive.cardSize.padding,
      borderRadius: responsive.cardSize.borderRadius,
    },
  });

  const styles = getResponsiveStyles();

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load medications with schedules
      const { data: medicationsData, error: medicationsError } = await supabase
        .from('medications')
        .select(`
          id,
          name,
          dosage,
          instructions,
          start_date,
          end_date,
          medication_schedules(
            id,
            scheduled_time,
            days_of_week
          )
        `)
        .eq('user_id', user.id);

      if (medicationsError) throw medicationsError;

      // Load appointments
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('doctor_appointments')
        .select('*')
        .eq('patient_id', user.id)
        .order('appointment_date', { ascending: true });

      if (appointmentsError) throw appointmentsError;

      // Load medication administration logs for today
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const { data: logsData, error: logsError } = await supabase
        .from('medication_administration_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('intended_dose_time', todayStart.toISOString())
        .lt('intended_dose_time', todayEnd.toISOString());

      if (logsError) throw logsError;

      setMedications(medicationsData || []);
      setAppointments(appointmentsData || []);

      // Process events for calendar with medication interactions
      processEventsForCalendar(medicationsData || [], appointmentsData || [], logsData || []);
    } catch (error: any) {
      console.error('Error loading calendar data:', error);
      Alert.alert('Error', 'Failed to load calendar data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const processEventsForCalendar = (meds: any[], appts: DoctorAppointment[], logs: MedicationLog[]) => {
    const calendarEvents: CalendarEvent[] = [];

    console.log('[UnifiedCalendar] Processing events for calendar:', {
      medicationsCount: meds.length,
      appointmentsCount: appts.length,
      logsCount: logs.length,
      today: format(new Date(), 'yyyy-MM-dd'),
      todayDayOfWeek: new Date().getDay()
    });

    // Create logs map for quick lookup
    const logsMap = new Map<string, MedicationLog>();
    logs.forEach(log => {
      const intendedTime = parseISO(log.intended_dose_time);
      const logKey = `${log.medication_id}-${format(intendedTime, 'yyyy-MM-dd')}-${format(intendedTime, 'HH:mm')}`;
      logsMap.set(logKey, log);
    });

    // Add appointments
    appts.forEach(appointment => {
      calendarEvents.push({
        id: `appointment-${appointment.id}`,
        type: 'appointment',
        title: `Dr. ${appointment.doctor_name}`,
        time: appointment.appointment_time,
        date: appointment.appointment_date,
        description: appointment.doctor_specialty,
        status: appointment.status,
      });
    });

    // Add today's medications from schedules
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayDayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Day name to number mapping to handle both string and numeric formats
    const dayNameToNumber: { [key: string]: number } = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    
    meds.forEach(medication => {
      console.log('[UnifiedCalendar] Processing medication:', {
        id: medication.id,
        name: medication.name,
        schedulesCount: medication.medication_schedules?.length || 0,
        schedules: medication.medication_schedules
      });
      
      if (medication.medication_schedules && Array.isArray(medication.medication_schedules)) {
        medication.medication_schedules.forEach((schedule: any, index: number) => {
          console.log(`[UnifiedCalendar] Processing schedule ${index}:`, {
            id: schedule.id,
            scheduled_time: schedule.scheduled_time,
            days_of_week: schedule.days_of_week,
            days_type: typeof schedule.days_of_week?.[0]
          });
          
          if (schedule.days_of_week && schedule.days_of_week.length > 0) {
            // Handle both string array format ['Mon', 'Tue'] and numeric array format [1, 2]
            let isScheduledToday = false;
            
            if (typeof schedule.days_of_week[0] === 'string') {
              // String format: ['Mon', 'Tue', 'Wed']
              const scheduledDayNumbers = schedule.days_of_week.map((dayName: string) => dayNameToNumber[dayName]);
              isScheduledToday = scheduledDayNumbers.includes(todayDayOfWeek);
              console.log(`[UnifiedCalendar] String format - scheduledDayNumbers:`, scheduledDayNumbers, 'todayDayOfWeek:', todayDayOfWeek, 'isScheduledToday:', isScheduledToday);
            } else {
              // Numeric format: [1, 2, 3]
              isScheduledToday = schedule.days_of_week.includes(todayDayOfWeek);
              console.log(`[UnifiedCalendar] Numeric format - days_of_week:`, schedule.days_of_week, 'todayDayOfWeek:', todayDayOfWeek, 'isScheduledToday:', isScheduledToday);
            }
            
            if (isScheduledToday) {
              const scheduleTime = schedule.scheduled_time.substring(0, 5); // HH:MM
              const doseTimeKey = `${medication.id}-${today}-${scheduleTime}`;
              const existingLog = logsMap.get(doseTimeKey);
              
              console.log(`[UnifiedCalendar] Adding medication event:`, {
                doseTimeKey,
                medicationName: medication.name,
                scheduleTime,
                hasExistingLog: !!existingLog,
                logStatus: existingLog?.status
              });
              
              calendarEvents.push({
                id: doseTimeKey,
                type: 'medication',
                title: medication.name,
                time: scheduleTime,
                date: today,
                description: medication.dosage,
                medicationId: medication.id,
                scheduleId: schedule.id,
                dosage: medication.dosage,
                instructions: medication.instructions,
                logStatus: existingLog?.status,
                medicationLogId: existingLog?.id,
              });
            }
          }
        });
      }
    });

    setEvents(calendarEvents.sort((a, b) => a.time.localeCompare(b.time)));
  };

  // Medication interaction functionality
  const handleLogDose = async (event: CalendarEvent, statusToSet: 'taken' | 'skipped') => {
    if (!event.medicationId || !user?.id) return;
    
    // Prevent multiple rapid presses
    if (isProcessingRef.current) {
      console.log('Already processing a dose log, ignoring this call.');
      return;
    }
    
    isProcessingRef.current = true;
    setIsLogging(true);

    try {
      if (event.medicationLogId) {
        // Update existing log
        const { error: updateError } = await supabase
          .from('medication_administration_logs')
          .update({ 
            status: statusToSet,
            taken_at: new Date().toISOString()
          })
          .eq('id', event.medicationLogId);

        if (updateError) throw updateError;
      } else {
        // Create new log entry
        const intendedDoseDateTime = new Date();
        const [hours, minutes] = event.time.split(':').map(Number);
        intendedDoseDateTime.setHours(hours, minutes, 0, 0);

        const newLogEntry = {
          medication_id: event.medicationId,
          schedule_id: event.scheduleId || null,
          user_id: user.id,
          status: statusToSet,
          taken_at: new Date().toISOString(),
          intended_dose_time: intendedDoseDateTime.toISOString(),
          notes: null
        };

        const { error: insertError } = await supabase
          .from('medication_administration_logs')
          .insert([newLogEntry]);

        if (insertError) throw insertError;
      }

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Refresh the data to reflect the changes
      await loadData();

    } catch (e: any) {
      console.error('Error in handleLogDose:', e);
      Alert.alert('Error', 'Failed to log medication dose. Please try again.');
    } finally {
      isProcessingRef.current = false;
      setIsLogging(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const getMarkedDates = () => {
    const marked: { [key: string]: any } = {};

    // Mark today
    const today = format(new Date(), 'yyyy-MM-dd');
    marked[today] = {
      selected: selectedDate === today,
      selectedColor: theme.colors.primary,
      marked: true,
      dotColor: theme.colors.primary,
    };

    // Mark appointment dates
    appointments.forEach(appointment => {
      const date = appointment.appointment_date;
      marked[date] = {
        ...marked[date],
        marked: true,
        dotColor: '#ef4444',
        dots: [
          ...(marked[date]?.dots || []),
          { key: appointment.id, color: '#ef4444' }
        ]
      };
    });

    // Mark selected date
    if (selectedDate !== today) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary,
      };
    }

    return marked;
  };

  const getEventsForDate = (date: string) => {
    return events.filter(event => {
      if (event.type === 'appointment') {
        return event.date === date;
      } else {
        // For medications, show for selected date if it's today
        return date === format(new Date(), 'yyyy-MM-dd');
      }
    });
  };

  const renderEvent = (event: CalendarEvent, index: number) => (
    <AnimatedCard
      key={event.id}
      entering={FadeInDown.delay(index * 100).springify()}
      layout={Layout.springify()}
      style={[
        staticStyles.eventCard,
        { 
          backgroundColor: event.type === 'appointment' 
            ? '#fff5f3' 
            : event.logStatus === 'taken'
            ? '#f0fdf4'
            : event.logStatus === 'skipped'
            ? '#fef2f2'
            : '#f8fafc',
          borderLeftWidth: 4,
          borderLeftColor: event.type === 'appointment' 
            ? '#f97316' 
            : event.logStatus === 'taken'
            ? '#22c55e'
            : event.logStatus === 'skipped'
            ? '#ef4444'
            : '#3b82f6',
          opacity: event.logStatus === 'skipped' ? 0.8 : 1
        }
      ]}
      elevation={3}
    >
      <Card.Content style={staticStyles.eventContent}>
        <View style={staticStyles.eventHeader}>
          <View style={[
            staticStyles.iconContainer,
            {
              backgroundColor: event.type === 'appointment' 
                ? '#fed7c7' 
                : event.logStatus === 'taken'
                ? '#bbf7d0'
                : event.logStatus === 'skipped'
                ? '#fecaca'
                : '#dbeafe'
            }
          ]}>
            <MaterialCommunityIcons
              name={event.type === 'appointment' ? 'stethoscope' : 'pill'}
              size={18}
              color={
                event.type === 'appointment' 
                  ? '#f97316' 
                  : event.logStatus === 'taken'
                  ? '#22c55e'
                  : event.logStatus === 'skipped'
                  ? '#ef4444'
                  : '#3b82f6'
              }
            />
          </View>
          <View style={staticStyles.eventInfo}>
            <Text variant="titleMedium" style={staticStyles.eventTitle}>
              {event.title}
            </Text>
            <View style={staticStyles.timeContainer}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#6b7280" />
              <Text variant="bodySmall" style={staticStyles.eventTime}>
                {format(new Date(`2000-01-01T${event.time}`), 'h:mm a')}
              </Text>
            </View>
          </View>
          
          {/* Status indicator */}
          {event.type === 'appointment' && event.status && (
            <Chip
              mode="flat"
              style={[staticStyles.statusChip, { 
                backgroundColor: event.status === 'scheduled' ? '#f0f9ff' : '#fef3f2',
                borderColor: event.status === 'scheduled' ? '#3b82f6' : '#ef4444'
              }]}
              textStyle={[staticStyles.statusChipText, { 
                color: event.status === 'scheduled' ? '#3b82f6' : '#ef4444'
              }]}
            >
              {event.status}
            </Chip>
          )}
        </View>
        
        {event.description && (
          <View style={staticStyles.descriptionContainer}>
            <Text variant="bodySmall" style={staticStyles.eventDescription}>
              {event.description}
            </Text>
          </View>
        )}
        
        {event.dosage && (
          <View style={staticStyles.dosageContainer}>
            <MaterialCommunityIcons name="medication-outline" size={14} color="#6b7280" />
            <Text variant="bodySmall" style={staticStyles.dosageText}>
              {event.dosage}
            </Text>
          </View>
        )}

        {event.instructions && (
          <Text variant="bodySmall" style={[staticStyles.eventDescription, { fontStyle: 'italic', marginTop: 4 }]}>
            {event.instructions}
          </Text>
        )}

        {/* Medication interaction buttons */}
        {event.type === 'medication' && (
          <View style={staticStyles.medicationActions}>
            {!event.logStatus && (
              <View style={staticStyles.actionButtons}>
                <TouchableOpacity
                  style={[staticStyles.actionButton, staticStyles.takeButton]}
                  onPress={() => handleLogDose(event, 'taken')}
                  disabled={isLogging}
                >
                  <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  <Text style={staticStyles.buttonText}>Taken</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[staticStyles.actionButton, staticStyles.skipButton]}
                  onPress={() => handleLogDose(event, 'skipped')}
                  disabled={isLogging}
                >
                  <MaterialCommunityIcons name="close" size={16} color="#ef4444" />
                  <Text style={[staticStyles.buttonText, { color: '#ef4444' }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {event.logStatus === 'taken' && (
              <Surface style={[staticStyles.statusBadge, staticStyles.takenBadge]} elevation={1}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
                <Text style={[staticStyles.statusText, { color: '#22c55e' }]}>Taken</Text>
              </Surface>
            )}
            
            {event.logStatus === 'skipped' && (
              <Surface style={[staticStyles.statusBadge, staticStyles.skippedBadge]} elevation={1}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#ef4444" />
                <Text style={[staticStyles.statusText, { color: '#ef4444' }]}>Skipped</Text>
              </Surface>
            )}
          </View>
        )}
      </Card.Content>
    </AnimatedCard>
  );

  if (loading) {
    return (
      <View style={[staticStyles.container, staticStyles.centered]}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text variant="bodyMedium" style={staticStyles.loadingText}>Loading calendar...</Text>
      </View>
    );
  }

  return (
    <View style={staticStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header */}
      <View style={staticStyles.headerContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={staticStyles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={staticStyles.headerContent}>
            <MaterialCommunityIcons 
              name="calendar-heart" 
              size={28} 
              color="#FFFFFF" 
            />
            <Text style={staticStyles.headerTitle}>
              Health Calendar
            </Text>
            <Text style={staticStyles.headerSubtitle}>
              Manage medications, appointments, and health events
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* Content */}
      <ScrollView
        style={staticStyles.scrollView}
        contentContainerStyle={[staticStyles.scrollContent, styles.contentPadding]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Calendar */}
        <Surface style={[staticStyles.calendarContainer, styles.calendarContainer]} elevation={2}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
            markedDates={getMarkedDates()}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: theme.colors.onSurface,
              selectedDayBackgroundColor: theme.colors.primary,
              selectedDayTextColor: '#ffffff',
              todayTextColor: theme.colors.primary,
              dayTextColor: theme.colors.onSurface,
              textDisabledColor: theme.colors.onSurfaceVariant,
              arrowColor: theme.colors.primary,
              monthTextColor: theme.colors.onSurface,
              indicatorColor: theme.colors.primary,
              textDayFontSize: responsive.fontSizes.body,
              textMonthFontSize: responsive.fontSizes.title,
              textDayHeaderFontSize: responsive.fontSizes.caption,
            }}
          />
        </Surface>

        {/* Events for Selected Date */}
        <View style={[staticStyles.eventsSection, styles.sectionGap]}>
          <Text variant="titleLarge" style={[staticStyles.sectionTitle, styles.titleSize]}>
            {selectedDate === format(new Date(), 'yyyy-MM-dd') 
              ? 'Today\'s Schedule' 
              : `Events for ${format(parseISO(selectedDate), 'MMM d, yyyy')}`
            }
          </Text>

          {getEventsForDate(selectedDate).length > 0 ? (
            getEventsForDate(selectedDate).map((event, index) => renderEvent(event, index))
          ) : (
            <Surface style={staticStyles.emptyState} elevation={1}>
              <MaterialCommunityIcons 
                name="calendar-blank" 
                size={responsive.iconSizes.xl} 
                color={theme.colors.outline} 
              />
              <Text variant="bodyLarge" style={staticStyles.emptyTitle}>
                No events scheduled
              </Text>
              <Text variant="bodyMedium" style={staticStyles.emptySubtitle}>
                {selectedDate === format(new Date(), 'yyyy-MM-dd')
                  ? 'You have no medications or appointments today'
                  : 'No events found for this date'
                }
              </Text>
            </Surface>
          )}
        </View>

        {/* Quick Stats */}
        <View style={[staticStyles.statsSection, styles.sectionGap]}>
          <Text variant="titleLarge" style={[staticStyles.sectionTitle, styles.titleSize]}>
            Overview
          </Text>
          <View style={[staticStyles.statsGrid, styles.statsGrid]}>
            <Surface style={[staticStyles.statCard, styles.statCard]} elevation={2}>
              <MaterialCommunityIcons 
                name="pill" 
                size={responsive.iconSizes.large} 
                color="#3b82f6" 
              />
              <Text variant="bodySmall" style={staticStyles.statLabel}>Active Medications</Text>
              <Text variant="headlineSmall" style={staticStyles.statValue}>{medications.length}</Text>
            </Surface>
            <Surface style={[staticStyles.statCard, styles.statCard]} elevation={2}>
              <MaterialCommunityIcons 
                name="calendar-heart" 
                size={responsive.iconSizes.large} 
                color="#ef4444" 
              />
              <Text variant="bodySmall" style={staticStyles.statLabel}>Upcoming Appointments</Text>
              <Text variant="headlineSmall" style={staticStyles.statValue}>
                {appointments.filter(apt => apt.status === 'scheduled').length}
              </Text>
            </Surface>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const staticStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.7,
  },
  headerContainer: {
    paddingTop: 0,
    paddingBottom: 10,
    zIndex: 1,
  },
  headerGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerBlur: {
    // Removed - no longer needed
  },
  headerContent: {
    alignItems: 'center',
    gap: 6,
  },
  headerTitleContainer: {
    // Removed - no longer needed
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    // Dynamic padding will be added via responsive styles
  },
  calendarContainer: {
    backgroundColor: 'white',
    // Dynamic border radius, padding, and margin will be added via responsive styles
  },
  eventsSection: {
    // Dynamic margin will be added via responsive styles
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1f2937',
    // Dynamic font size will be added via responsive styles
  },
  eventCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  eventContent: {
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    flex: 1,
    fontWeight: '600',
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 4,
  },
  eventTime: {
    color: '#6b7280',
    fontWeight: '500',
    fontSize: 13,
  },
  eventDescription: {
    color: '#6b7280',
    marginBottom: 4,
    fontSize: 14,
  },
  medicationActions: {
    alignItems: 'center',
    marginTop: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
    minWidth: 90,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  takeButton: {
    backgroundColor: '#22c55e',
  },
  skipButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusChip: {
    alignSelf: 'flex-start',
    height: 28,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  emptyTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  emptySubtitle: {
    textAlign: 'center',
    color: '#6b7280',
  },
  statsSection: {
    // Dynamic margin will be added via responsive styles
  },
  statsGrid: {
    // Dynamic flex direction and gap will be added via responsive styles
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: 'white',
    // Dynamic flex, width, padding, and border radius will be added via responsive styles
  },
  statLabel: {
    marginTop: 8,
    marginBottom: 4,
    color: '#6b7280',
    textAlign: 'center',
  },
  statValue: {
    fontWeight: 'bold',
    color: '#1f2937',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  descriptionContainer: {
    marginBottom: 8,
  },
  dosageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dosageText: {
    color: '#6b7280',
    fontWeight: '500',
  },
  takenBadge: {
    backgroundColor: '#bbf7d0',
  },
  skippedBadge: {
    backgroundColor: '#fecaca',
  },
});

export default UnifiedCalendarScreen; 