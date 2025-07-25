import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, ScrollView, RefreshControl, Alert, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useTheme, List, Paragraph, Button, Dialog, Portal, RadioButton, Surface, Card } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, setHours, setMinutes, setSeconds } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  withTiming, 
  withSequence,
  FadeInDown,
  SlideInRight,
  Layout
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Adherence Log Statuses
type LogStatus = 'skipped' | 'taken'; // 'taken_on_time' removed

interface MedicationLog {
  id: string;
  medication_id: string;
  schedule_id?: string;
  user_id: string;
  taken_at: string; // ISO string
  status: LogStatus;
  notes?: string;
  intended_dose_time: string; // ISO string
}

interface ScheduledMedicationDisplayItem {
  id: string; // Unique key for the list: `${medication.id}-${schedule.id}-${dateString}-${schedule.scheduled_time}`
  medicationId: string; // Original medication ID
  scheduleId?: string; // Original schedule ID
  name: string;
  dosage: string;
  time: string; // HH:MM
  instructions?: string;
  logStatus?: LogStatus;
  medicationLogId?: string; // ID of the medication_administration_logs entry
}

interface MarkedDatesType {
  [date: string]: {
    marked?: boolean;
    dotColor?: string;
    // activeOpacity?: number;
    selected?: boolean;
    selectedColor?: string;
    // disabled?: boolean;
    // disableTouchEvent?: boolean;
    // customStyles?: object;
    periods?: Array<{startingDay?: boolean, endingDay?: boolean, color: string, periodName?: string}>;
    medications?: ScheduledMedicationDisplayItem[];
  };
}

const { width, height } = Dimensions.get('window');
const AnimatedSurface = Animated.createAnimatedComponent(Surface);
const AnimatedCard = Animated.createAnimatedComponent(Card);

const dayNameToNumber = (dayName: string): number => {
  const days: { [key: string]: number } = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };
  return days[dayName];
};

const MedicationCalendarScreen = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const [markedDates, setMarkedDates] = useState<MarkedDatesType>({});
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [medsForSelectedDate, setMedsForSelectedDate] = useState<ScheduledMedicationDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const isProcessingRef = useRef(false); // Added ref for synchronous check

  // Animation values
  const headerOpacity = useSharedValue(0);
  const calendarScale = useSharedValue(0.95);
  const medicationListOpacity = useSharedValue(0);

  // Initialize animations
  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 600 });
    calendarScale.value = withSpring(1, { damping: 15 });
    medicationListOpacity.value = withTiming(1, { duration: 800 });
  }, []);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const calendarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: calendarScale.value }],
  }));

  const medicationListAnimatedStyle = useAnimatedStyle(() => ({
    opacity: medicationListOpacity.value,
  }));

  const fetchAndProcessSchedules = useCallback(async (monthToLoad: Date, currentSelectedDate: string) => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      const viewStartDate = startOfMonth(monthToLoad);
      const viewEndDate = endOfMonth(monthToLoad);

      // Fetch medications with their schedules
      const { data: medicationsData, error: medError } = await supabase
        .from('medications')
        .select('id, name, dosage, instructions, start_date, end_date, medication_schedules(id, scheduled_time, days_of_week)')
        .eq('patient_id', user.id)
        // Add filters for medications active in the current view window if desired (optional optimization)
        // .lte('start_date', format(viewEndDate, 'yyyy-MM-dd')) 
        // .or(\`end_date.gte.${format(viewStartDate, 'yyyy-MM-dd')},end_date.is.null\`)


      if (medError) throw medError;

      // Fetch administration logs for the current view window
      const { data: logsData, error: logError } = await supabase
        .from('medication_administration_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('intended_dose_time', viewStartDate.toISOString())
        .lte('intended_dose_time', endOfMonth(viewEndDate).toISOString()); // Ensure end of day for viewEndDate

      if (logError) throw logError;
      
      const logsMap = new Map<string, MedicationLog>();
      logsData?.forEach(log => {
        // Key for logsMap: medicationId-dateString-time (HH:MM from intended_dose_time)
        const intendedTime = parseISO(log.intended_dose_time);
        const logKey = `${log.medication_id}-${format(intendedTime, 'yyyy-MM-dd')}-${format(intendedTime, 'HH:mm')}`;
        logsMap.set(logKey, log);
      });


      const newMarkedDates: MarkedDatesType = {};
      const takenMedColor = '#4CAF50'; // Explicit Green for "Taken"
      const skippedMedColor = theme.colors.error;   // Use theme's error color (e.g., Red)
      const notTakenYetColor = theme.colors.primary; // Use theme's primary color for "Scheduled/Not Logged Yet" (e.g., Blue)


      medicationsData?.forEach(med => {
        med.medication_schedules?.forEach(schedule => {
          if (!schedule.days_of_week || schedule.days_of_week.length === 0 || !schedule.scheduled_time) return;

          const medStartDate = med.start_date ? parseISO(med.start_date) : new Date(1900, 0, 1);
          const medEndDate = med.end_date ? parseISO(med.end_date) : new Date(2100, 0, 1);
          const scheduledDaysNumbers = schedule.days_of_week.map(dayNameToNumber);
          const [hours, minutes] = schedule.scheduled_time.split(':').map(Number);

          const loopStart = medStartDate > viewStartDate ? medStartDate : viewStartDate;
          const loopEnd = medEndDate < viewEndDate ? medEndDate : viewEndDate;

          if (loopStart > loopEnd) return;

          eachDayOfInterval({ start: loopStart, end: loopEnd }).forEach(dayDate => {
            if (scheduledDaysNumbers.includes(dayDate.getDay())) {
              const dateString = format(dayDate, 'yyyy-MM-dd');
              const doseTimeKey = `${med.id}-${dateString}-${schedule.scheduled_time.substring(0,5)}`;
              const existingLog = logsMap.get(doseTimeKey);
              
              let periodColor = notTakenYetColor; // Default for not-yet-logged
              if (existingLog?.status === 'taken') periodColor = takenMedColor;
              else if (existingLog?.status === 'skipped') periodColor = skippedMedColor;


              if (!newMarkedDates[dateString]) {
                newMarkedDates[dateString] = { periods: [], medications: [] };
              }
               // Check if a period with the same name (med name + time) already exists to avoid duplicates from different schedules of the same med
              const periodNameForMed = `${med.name}-${schedule.scheduled_time.substring(0,5)}`;
              const periodAlreadyExists = newMarkedDates[dateString].periods?.some(p => p.periodName === periodNameForMed);

              if (!periodAlreadyExists) {
                 newMarkedDates[dateString].periods?.push({ 
                    startingDay: true, 
                    endingDay: true, 
                    color: periodColor,
                    periodName: periodNameForMed // Store a name to identify the period
                });
              }


              const displayItem: ScheduledMedicationDisplayItem = {
                id: doseTimeKey, // medicationId-dateString-time
                medicationId: med.id,
                scheduleId: schedule.id,
                name: med.name,
                dosage: med.dosage,
                time: schedule.scheduled_time.substring(0,5),
                instructions: med.instructions,
                logStatus: existingLog?.status,
                medicationLogId: existingLog?.id,
              };
              
              // Ensure medications array exists before pushing
              if (!newMarkedDates[dateString].medications) {
                 newMarkedDates[dateString].medications = [];
              }
              newMarkedDates[dateString].medications?.push(displayItem);
              // Sort medications by time for consistent display
              newMarkedDates[dateString].medications?.sort((a, b) => a.time.localeCompare(b.time));
            }
          });
        });
      });
      
      // Replace markedDates completely instead of merging
      setMarkedDates(newMarkedDates);
      
      // Update meds for selected date explicitly after new markedDates are set
      if (newMarkedDates[currentSelectedDate]?.medications) {
        setMedsForSelectedDate(newMarkedDates[currentSelectedDate].medications!);
      } else if (!newMarkedDates[currentSelectedDate] && Object.keys(newMarkedDates).length > 0) {
        // If there are marked dates but none for the selected date, clear the medications
        setMedsForSelectedDate([]);
      } else if (Object.keys(newMarkedDates).length === 0 && medicationsData?.length === 0) {
        // No medications at all, clear everything
        setMedsForSelectedDate([]);
      }


    } catch (e: any) {
      console.error('Error fetching schedules/logs:', e);
      setError('Failed to load medication data.');
    } finally {
      setIsLoading(false);
    }
  }, [user, theme.colors.error, theme.colors.primary]);

  // Effect to update medications for selected date when markedDates or selectedDate changes
  useEffect(() => {
    if (markedDates[selectedDate]?.medications) {
      setMedsForSelectedDate(markedDates[selectedDate].medications!);
    } else {
      setMedsForSelectedDate([]);
    }
  }, [markedDates, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      fetchAndProcessSchedules(currentMonth, selectedDate);
    }, [fetchAndProcessSchedules, currentMonth, selectedDate])
  );

  const handleLogDose = async (item: ScheduledMedicationDisplayItem, statusToSet: LogStatus) => {
    console.log('[MedicationCalendarScreen] handleLogDose called with item:', JSON.stringify(item), 'statusToSet:', statusToSet);
    
    // Synchronous check to prevent multiple rapid presses
    if (isProcessingRef.current) {
      console.log('[MedicationCalendarScreen] Already processing a dose log, ignoring this call.');
      return;
    }
    
    isProcessingRef.current = true;
    setIsLogging(true);

    try {
      console.log('[MedicationCalendarScreen] About to handle logging for medication:', item.medicationId, 'status:', statusToSet);

      if (item.medicationLogId) {
        // Update existing log
        console.log('[MedicationCalendarScreen] Updating existing log with ID:', item.medicationLogId);
        const { error: updateError } = await supabase
          .from('medication_administration_logs')
          .update({ 
            status: statusToSet,
            taken_at: new Date().toISOString()
          })
          .eq('id', item.medicationLogId);

        if (updateError) {
          console.error('[MedicationCalendarScreen] Error updating log:', updateError);
          throw updateError;
        }
        console.log('[MedicationCalendarScreen] Successfully updated existing log');
      } else {
        // Create new log entry
        console.log('[MedicationCalendarScreen] Creating new log entry');
        const intendedDoseDateTime = new Date();
        const [hours, minutes] = item.time.split(':').map(Number);
        intendedDoseDateTime.setHours(hours, minutes, 0, 0);

        const newLogEntry = {
          medication_id: item.medicationId,
          schedule_id: item.scheduleId || null,
          user_id: user!.id,
          status: statusToSet,
          taken_at: new Date().toISOString(),
          intended_dose_time: intendedDoseDateTime.toISOString(),
          notes: null
        };

        console.log('[MedicationCalendarScreen] New log entry to insert:', JSON.stringify(newLogEntry));

        const { error: insertError } = await supabase
          .from('medication_administration_logs')
          .insert([newLogEntry]);

        if (insertError) {
          console.error('[MedicationCalendarScreen] Error inserting new log:', insertError);
          throw insertError;
        }
        console.log('[MedicationCalendarScreen] Successfully inserted new log');
      }

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Refresh the data to reflect the changes
      console.log('[MedicationCalendarScreen] Refreshing data after successful log operation');
      await fetchAndProcessSchedules(currentMonth, selectedDate);

    } catch (e: any) {
      console.error('[MedicationCalendarScreen] Error in handleLogDose catch block:', e);
      let errorMessage = 'Failed to log medication dose.';
      if (e.message) {
        errorMessage += ` Details: ${e.message}`;
      }
      Alert.alert('Error', errorMessage);
    } finally {
      console.log('[MedicationCalendarScreen] handleLogDose finally block. Setting isLogging to false and isProcessingRef.current to false.');
      isProcessingRef.current = false;
      setIsLogging(false);
    }
  };


  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // medsForSelectedDate will be updated by the useEffect watching selectedDate and markedDates
  };
  
  const onMonthChange = (monthDateData: DateData) => {
    const newMonthDate = new Date(monthDateData.timestamp);
    setCurrentMonth(newMonthDate);
    // Data for the new month (and current selectedDate if it falls in new month) will be fetched by useFocusEffect
    // or more directly by calling fetchAndProcessSchedules here
    fetchAndProcessSchedules(newMonthDate, selectedDate);
  };

  const getIconForStatus = (status?: LogStatus) => {
    if (status === 'taken') return 'check-circle'; // 'taken_on_time' removed
    if (status === 'skipped') return 'close-circle';
    return 'pill'; // Default for not logged
  };
  
  const getColorForStatus = (status?: LogStatus) => {
    if (status === 'taken') return '#4CAF50'; // 'taken_on_time' removed
    if (status === 'skipped') return theme.colors.error; // Usually red-ish
    return theme.colors.onSurfaceVariant; // Default
  };

  const renderMedicationCard = (item: ScheduledMedicationDisplayItem, index: number) => {
    return (
      <AnimatedCard
        key={item.id}
        entering={FadeInDown.delay(index * 100).springify()}
        layout={Layout.springify()}
        style={[
          styles.medicationCard,
          { 
            backgroundColor: theme.colors.surface,
            opacity: item.logStatus === 'skipped' ? 0.7 : 1
          }
        ]}
        elevation={2}
      >
        <LinearGradient
          colors={
            item.logStatus === 'taken' 
              ? ['rgba(76, 175, 80, 0.1)', 'rgba(76, 175, 80, 0.05)']
              : item.logStatus === 'skipped'
              ? ['rgba(244, 67, 54, 0.1)', 'rgba(244, 67, 54, 0.05)']
              : ['rgba(103, 80, 164, 0.1)', 'rgba(103, 80, 164, 0.05)']
          }
          style={styles.cardGradient}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.medicationInfo}>
                <MaterialCommunityIcons 
                  name={getIconForStatus(item.logStatus)} 
                  size={28} 
                  color={getColorForStatus(item.logStatus)}
                  style={styles.medicationIcon}
                />
                <View style={styles.medicationDetails}>
                  <Text style={[styles.medicationName, { color: theme.colors.onSurface }]}>
                    {item.name} ({item.dosage})
                  </Text>
                  <Text style={[styles.medicationTime, { color: theme.colors.primary }]}>
                    Scheduled at: {item.time}
                  </Text>
                  {item.instructions && (
                    <Text style={[styles.medicationInstructions, { color: theme.colors.onSurfaceVariant }]}>
                      {item.instructions}
                    </Text>
                  )}
                </View>
              </View>
              
              <View style={styles.actionContainer}>
                {!item.logStatus && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.modernButton, styles.takeButton]}
                      onPress={() => handleLogDose(item, 'taken')}
                      disabled={isLogging}
                    >
                      <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
                      <Text style={styles.buttonText}>Take</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modernButton, styles.skipButton]}
                      onPress={() => handleLogDose(item, 'skipped')}
                      disabled={isLogging}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={theme.colors.error} />
                      <Text style={[styles.buttonText, { color: theme.colors.error }]}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {item.logStatus === 'taken' && (
                  <Surface style={[styles.statusBadge, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]} elevation={1}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={[styles.statusText, { color: '#4CAF50' }]}>Taken</Text>
                  </Surface>
                )}
                {item.logStatus === 'skipped' && (
                  <Surface style={[styles.statusBadge, { backgroundColor: 'rgba(244, 67, 54, 0.2)' }]} elevation={1}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.error} />
                    <Text style={[styles.statusText, { color: theme.colors.error }]}>Skipped</Text>
                  </Surface>
                )}
              </View>
            </View>
          </View>
        </LinearGradient>
      </AnimatedCard>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Modern Header with Gradient */}
      <Animated.View style={[styles.headerContainer, headerAnimatedStyle]}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <MaterialCommunityIcons name="calendar-month" size={24} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Medication Calendar</Text>
            <Text style={styles.headerSubtitle}>Track your daily medications</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Modern Calendar */}
      <AnimatedSurface style={[styles.calendarContainer, calendarAnimatedStyle]} elevation={4}>
        <Calendar
          current={format(currentMonth, 'yyyy-MM-dd')}
          onDayPress={onDayPress}
          markedDates={{
            ...markedDates,
            [selectedDate]: {
              ...markedDates[selectedDate],
              selected: true,
              selectedColor: theme.colors.primary,
            }
          }}
          markingType={'multi-period'}
          onMonthChange={onMonthChange}
          monthFormat={'MMMM yyyy'}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: theme.colors.onSurface,
            selectedDayBackgroundColor: theme.colors.primary,
            selectedDayTextColor: theme.colors.onPrimary,
            todayTextColor: theme.colors.primary,
            dayTextColor: theme.colors.onSurface,
            textDisabledColor: theme.colors.onSurfaceDisabled,
            selectedDotColor: theme.colors.onPrimary,
            arrowColor: theme.colors.primary,
            monthTextColor: theme.colors.onSurface,
            indicatorColor: theme.colors.primary,
            textDayFontSize: 16,
            textMonthFontSize: 18,
            textDayHeaderFontSize: 14,
          }}
          style={styles.calendar}
        />
      </AnimatedSurface>
      
      {/* Modern Medication List */}
      <Animated.View style={[styles.medicationListContainer, medicationListAnimatedStyle]}>
        <BlurView intensity={20} tint="light" style={styles.listHeaderBlur}>
          <View style={styles.listHeader}>
            <MaterialCommunityIcons name="pill" size={24} color={theme.colors.primary} />
            <Text style={[styles.selectedDateText, { color: theme.colors.onSurface }]}>
              {selectedDate === format(new Date(), 'yyyy-MM-dd') ? 'Today\'s Medications' : `Medications for ${format(parseISO(selectedDate), 'MMM d, yyyy')}`}
            </Text>
          </View>
        </BlurView>
        
        <ScrollView 
          style={styles.medicationScrollView}
          contentContainerStyle={styles.medicationScrollContent}
          refreshControl={
            <RefreshControl 
              refreshing={isLoading} 
              onRefresh={() => fetchAndProcessSchedules(currentMonth, selectedDate)}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {isLoading && !medsForSelectedDate.length && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
                Loading medications...
              </Text>
            </View>
          )}
          
          {!isLoading && error && (
            <Surface style={styles.errorContainer} elevation={2}>
              <MaterialCommunityIcons name="alert-circle" size={48} color={theme.colors.error} />
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            </Surface>
          )}
          
          {!isLoading && !error && medsForSelectedDate.length === 0 && (
            <Surface style={styles.emptyContainer} elevation={1}>
              <MaterialCommunityIcons name="calendar-check" size={64} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
                No medications scheduled
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Enjoy your medication-free day!
              </Text>
            </Surface>
          )}
          
          {medsForSelectedDate.map((item, index) => renderMedicationCard(item, index))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 0,
    paddingBottom: 10,
    zIndex: 1,
  },
  headerGradient: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerContent: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
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
  calendarContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
  },
  calendar: {
    paddingBottom: 8,
  },
  medicationListContainer: {
    flex: 1,
    marginTop: 8,
  },
  listHeaderBlur: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  medicationScrollView: {
    flex: 1,
  },
  medicationScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 80,
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    margin: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
    margin: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(103, 80, 164, 0.05)',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '400',
  },
  medicationCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  medicationIcon: {
    marginRight: 12,
  },
  medicationDetails: {
    flex: 1,
  },
  medicationName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  medicationTime: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  medicationInstructions: {
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  actionContainer: {
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modernButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  takeButton: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#f44336',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default MedicationCalendarScreen; 