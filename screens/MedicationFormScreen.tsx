import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { TextInput, Button, useTheme, Text, HelperText, Card, Chip, List, Switch, IconButton } from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { scheduleLocalNotification, cancelScheduledNotification } from '../src/utils/notificationUtils';
import * as Notifications from 'expo-notifications';
import { parseISO } from 'date-fns';
import { MedicationStackParamList } from '../navigation/MedicationStackNavigator';

// Import our new notification service
import NotificationService, { MedicationAlarm } from '../services/NotificationService';

type MedicationFormScreenRouteProp = RouteProp<{ params: { medicationId?: string } }, 'params'>;
type MedicationFormNavigationProp = StackNavigationProp<MedicationStackParamList, 'MedicationForm'>;

interface ScheduleTime {
  id?: string; // For existing schedules
  time: string; // HH:MM format
  daysOfWeek: string[]; // e.g. ['Mon', 'Tue', 'Wed']
  notification_ids?: string[] | null; // Added for storing notification IDs
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayNameToNumber: { [key: string]: number } = { // For Date.getDay() (Sun=0)
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

// Helper function to calculate next notification dates
const calculateNextNotificationDates = (
  scheduleTime: string, 
  daysOfWeek: string[], 
  medStartDate: Date | undefined, 
  medEndDate: Date | undefined, 
  count: number = 30 // Schedule for next 30 occurrences or up to medEndDate
): Date[] => {
  const dates: Date[] = [];
  if (daysOfWeek.length === 0) return dates;

  const [hours, minutes] = scheduleTime.split(':').map(Number);
  const targetDays = daysOfWeek.map(d => dayNameToNumber[d]);

  let currentDate = medStartDate ? new Date(medStartDate) : new Date();
  // Ensure currentDate starts from today if medStartDate is in the past for scheduling purposes
  if (medStartDate && medStartDate < new Date() && !(medStartDate.toDateString() === new Date().toDateString())) {
    currentDate = new Date(); 
  }
  currentDate.setHours(0, 0, 0, 0); // Start checking from the beginning of the day

  let occurrencesFound = 0;

  for (let i = 0; i < 365 && occurrencesFound < count; i++) { // Limit search to 1 year to prevent infinite loops
    const checkDate = new Date(currentDate);
    checkDate.setDate(currentDate.getDate() + i);

    if (medEndDate && checkDate > medEndDate) {
      break; // Stop if we've passed the medication's end date
    }

    if (targetDays.includes(checkDate.getDay())) {
      const notificationDateTime = new Date(checkDate);
      notificationDateTime.setHours(hours, minutes, 0, 0);

      // Only schedule if the notification time is in the future
      // And (if medStartDate is defined) it's on or after medStartDate
      // And (if medEndDate is defined) it's on or before medEndDate (already partially handled by loop break)
      if (notificationDateTime > new Date() && 
          (!medStartDate || notificationDateTime >= new Date(new Date(medStartDate).setHours(hours,minutes,0,0)) ) &&
          (!medEndDate || notificationDateTime <= new Date(new Date(medEndDate).setHours(23,59,59,999)))
         ) {
        dates.push(notificationDateTime);
        occurrencesFound++;
      }
    }
  }
  return dates;
};

const MedicationFormScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<MedicationFormNavigationProp>();
  const route = useRoute<MedicationFormScreenRouteProp>();
  const { user } = useAuth();

  const medicationId = route.params?.medicationId;
  const isEditing = Boolean(medicationId);

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([]); 

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date picker states
  const [openStartDatePicker, setOpenStartDatePicker] = useState(false);
  const [openEndDatePicker, setOpenEndDatePicker] = useState(false);

  // Time picker states
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  // Fetch medication data if editing
  useEffect(() => {
    console.log('[MedForm Edit] medicationId:', medicationId, 'user.id:', user?.id);
    if (isEditing && user && typeof medicationId === 'string' && medicationId.trim() !== '') { // ensure medicationId is a valid, non-empty string
      const fetchMedication = async () => {
        try {
          console.log(`[MedForm Edit] Fetching medication with ID: ${medicationId}`);
          const { data, error } = await supabase
            .from('medications')
            .select(`
              *,
              medication_schedules(*)
            `)
            .eq('id', medicationId)
            .eq('patient_id', user.id)
            .single();

          if (error) {
            console.error('Error fetching medication:', error);
            if (error.code === 'PGRST116') {
              Alert.alert('Error', 'Could not find the medication to edit. It may have been deleted or there was an issue loading its details.');
            } else {
              Alert.alert('Error', 'Failed to load medication details. Please try again.');
            }
            // navigation.goBack(); // Consider if you want to auto-navigate back
            return;
          }

          if (data) {
            console.log('[MedForm Edit] Fetched medication data:', data);
            setName(data.name || '');
            setDosage(data.dosage || '');
            setInstructions(data.instructions || '');
            setStartDate(data.start_date ? parseISO(data.start_date) : null);
            setEndDate(data.end_date ? parseISO(data.end_date) : null);
            
            if (data.medication_schedules && Array.isArray(data.medication_schedules)) {
              const loadedSchedules = data.medication_schedules.map((s: any) => ({
                id: s.id, // Store schedule id for updates/deletions
                time: s.scheduled_time.substring(0, 5),
                daysOfWeek: s.days_of_week || [],
                notification_ids: s.notification_ids || [], // Load existing notification IDs
              }));
              setScheduleTimes(loadedSchedules);
            }
          } else {
            Alert.alert('Not Found', 'Medication details could not be loaded.');
            // navigation.goBack();
          }
        } catch (e) {
          console.error('Unexpected error fetching medication:', e);
          Alert.alert('Error', 'An unexpected error occurred while loading medication details.');
        }
      };
      fetchMedication();
    } else if (isEditing && (!medicationId || typeof medicationId !== 'string' || medicationId.trim() === '')){
      console.warn('[MedForm Edit] Attempted to edit with invalid or missing medicationId:', medicationId);
      Alert.alert('Error', 'Cannot edit medication without a valid ID. Please return and try again.');
      // navigation.goBack(); // Or navigate back if appropriate
    }
  }, [isEditing, medicationId, user, navigation]);

  const onDismissStartDatePicker = useCallback(() => setOpenStartDatePicker(false), []);
  const onConfirmStartDatePicker = useCallback((params: { date: Date }) => {
    setOpenStartDatePicker(false);
    setStartDate(params.date);
  }, []);

  const onDismissEndDatePicker = useCallback(() => setOpenEndDatePicker(false), []);
  const onConfirmEndDatePicker = useCallback((params: { date: Date }) => {
    setOpenEndDatePicker(false);
    setEndDate(params.date);
  }, []);

  const onDismissTimePicker = () => setTimePickerVisible(false);
  const onConfirmTimePicker = ({ hours, minutes }: { hours: number; minutes: number }) => {
    setTimePickerVisible(false);
    const newTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setScheduleTimes(prev => [...prev, { time: newTime, daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], notification_ids: null }]);
  };

  const removeScheduleTime = (index: number) => {
    setScheduleTimes(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDayOfWeek = (scheduleIndex: number, day: string) => {
    setScheduleTimes(prev => 
      prev.map((schedule, index) => {
        if (index === scheduleIndex) {
          const newDaysOfWeek = schedule.daysOfWeek.includes(day)
            ? schedule.daysOfWeek.filter(d => d !== day)
            : [...schedule.daysOfWeek, day];
          return { ...schedule, daysOfWeek: newDaysOfWeek.sort((a, b) => days.indexOf(a) - days.indexOf(b)) };
        }
        return schedule;
      })
    );
  };

  const formatDaysOfWeek = (selectedDays: string[]) => {
    if (selectedDays.length === 7) return 'Daily';
    if (selectedDays.length === 0) return 'No days selected';
    return selectedDays.slice().sort((a,b) => days.indexOf(a) - days.indexOf(b)).join(', ');
  };

  const handleSave = async () => {
    if (!user) {
      setError('User not authenticated.');
      return;
    }
    if (!name || !dosage) {
      setError('Medication name and dosage are required.');
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const medicationData = {
        patient_id: user.id,
        user_id: user.id,
        name,
        dosage,
        frequency: 'Not specified', 
        instructions,
        start_date: startDate ? startDate.toISOString().split('T')[0] : null,
        end_date: endDate ? endDate.toISOString().split('T')[0] : null,
      };

      let savedMedicationId = medicationId;

      if (isEditing && medicationId) {
        const { data, error: updateError } = await supabase
          .from('medications')
          .update({ ...medicationData, updated_at: new Date().toISOString() })
          .eq('id', medicationId)
          .select('id')
          .single();
        if (updateError) throw updateError;
        if (!data) throw new Error('Failed to update medication, no ID returned');
      } else {
        const { data, error: insertError } = await supabase
          .from('medications')
          .insert(medicationData)
          .select('id')
          .single();
        if (insertError) throw insertError;
        if (!data) throw new Error('Failed to insert medication, no ID returned');
        savedMedicationId = data.id;
      }

      if (!savedMedicationId) {
        throw new Error('Medication ID not available after save/update.');
      }

      // --- NOTIFICATION AND SCHEDULE HANDLING ---
      // 1. Fetch existing DB schedules to compare (especially for their notification_ids)
      const { data: existingDbSchedulesData, error: fetchOldSchedError } = isEditing && savedMedicationId ? 
        await supabase
          .from('medication_schedules')
          .select('id, notification_ids, scheduled_time, days_of_week') // also fetch time and days for comparison
          .eq('medication_id', savedMedicationId)
        : { data: [], error: null };

      if (fetchOldSchedError) {
        console.warn('Error fetching existing schedules, proceeding with caution:', fetchOldSchedError.message);
      }
      const existingDbSchedulesMap = new Map(existingDbSchedulesData?.map(s => [s.id, s]) || []);


      // 2. Determine schedules to delete, add, or update
      const formScheduleIds = new Set(scheduleTimes.map(st => st.id).filter(id => id));
      const schedulesToDelete = Array.from(existingDbSchedulesMap.values()).filter(dbSched => !formScheduleIds.has(dbSched.id));
      const schedulesToAdd = scheduleTimes.filter(st => !st.id);
      const schedulesToUpdate = scheduleTimes.filter(st => st.id && existingDbSchedulesMap.has(st.id));

      // 3. Process deletions
      if (schedulesToDelete.length > 0) {
        const deletePromises = schedulesToDelete.map(async (dbSched) => {
          // Cancel existing notifications for this schedule
          if (dbSched.notification_ids && dbSched.notification_ids.length > 0) {
            console.log(`[MedForm] Cancelling ${dbSched.notification_ids.length} notifications for deleted schedule ID ${dbSched.id}`);
            await Promise.all(dbSched.notification_ids.map((nid: string) => cancelScheduledNotification(nid)));
          }
          return supabase.from('medication_schedules').delete().eq('id', dbSched.id);
        });
        const deleteResults = await Promise.all(deletePromises);
        deleteResults.forEach(result => {
          if (result.error) console.warn('Error deleting schedule:', result.error.message);
        });
      }
      
      // 4. Process additions
      if (schedulesToAdd.length > 0) {
        const addPromises = schedulesToAdd.map(async (st) => {
          const newNotificationIds: string[] = [];
          const nextNotificationDateObjects = calculateNextNotificationDates(st.time, st.daysOfWeek, startDate, endDate);
          
          console.log(`[MedForm] For new schedule ${st.time} on ${st.daysOfWeek.join(',')}, calculated dates:`, nextNotificationDateObjects.map(d => d.toISOString()));

          // 🚀 NEW: Schedule advanced 3-step alarm system for each occurrence
          for (const notificationDateTime of nextNotificationDateObjects) {
            const secondsUntilTrigger = (notificationDateTime.getTime() - new Date().getTime()) / 1000;
            if (secondsUntilTrigger > 0) {
              // Schedule traditional notification (backward compatibility)
              const trigger: Notifications.TimeIntervalNotificationTriggerInput = {
                seconds: Math.max(1, Math.round(secondsUntilTrigger)),
                repeats: false,
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              };
              const notificationTitle = `Medication Reminder: ${name}`;
              const notificationBody = `Time to take your ${dosage} of ${name}.`;
              console.log(`[MedForm] Scheduling new notification for ${name} at ${notificationDateTime.toISOString()} (in ${secondsUntilTrigger}s) with explicit trigger`);
              const notificationId = await scheduleLocalNotification(
                notificationTitle,
                notificationBody,
                Math.max(1, Math.round(secondsUntilTrigger)), 
                { medicationId: savedMedicationId, scheduleTime: st.time },
                trigger
              );
              if (notificationId) newNotificationIds.push(notificationId);

              // 🚀 NEW: Schedule advanced 3-step alarm system
              try {
                const medicationAlarm: MedicationAlarm = {
                  id: `alarm-${savedMedicationId}-${st.time}-${notificationDateTime.getTime()}`,
                  patientId: user.id,
                  medicationScheduleId: '', // Will be updated after schedule is created
                  medicationName: name,
                  scheduledTime: notificationDateTime,
                  attempt: 1,
                };
                
                console.log(`[MedForm] Scheduling advanced 3-step alarm system for ${name} at ${notificationDateTime.toISOString()}`);
                await NotificationService.scheduleMedicationAlarms(medicationAlarm);
                console.log(`[MedForm] Advanced alarm system scheduled successfully for ${name}`);
              } catch (alarmError) {
                console.error(`[MedForm] Failed to schedule advanced alarm system for ${name}:`, alarmError);
                // Don't fail the entire process if advanced alarms fail
              }
            }
          }
          
          // Insert the schedule into database
          const { data: insertedSchedule, error: insertError } = await supabase
            .from('medication_schedules')
            .insert({
              medication_id: savedMedicationId,
              user_id: user.id,
              scheduled_time: st.time,
              days_of_week: st.daysOfWeek,
              notification_ids: newNotificationIds.length > 0 ? newNotificationIds : null,
            })
            .select('id')
            .single();

          if (insertError) {
            console.warn('Error adding schedule:', insertError.message);
          } else if (insertedSchedule) {
            // Update the alarm with the actual schedule ID
            console.log(`[MedForm] Schedule created with ID: ${insertedSchedule.id}`);
          }

          return { error: insertError };
        });
        const addResults = await Promise.all(addPromises);
        addResults.forEach(result => {
          if (result.error) console.warn('Error adding schedule:', result.error.message);
        });
      }

      // 5. Process updates
      if (schedulesToUpdate.length > 0) {
        const updatePromises = schedulesToUpdate.map(async (st) => {
          if (!st.id) return null; // Should not happen due to filter
          const existingDbSchedule = existingDbSchedulesMap.get(st.id);
          const newNotificationIds: string[] = [];

          // Check if schedule details (time or days) actually changed
          const timeChanged = existingDbSchedule?.scheduled_time.substring(0,5) !== st.time;
          const daysChanged = JSON.stringify(existingDbSchedule?.days_of_week.slice().sort()) !== JSON.stringify(st.daysOfWeek.slice().sort());

          if (timeChanged || daysChanged || (existingDbSchedule && !existingDbSchedule.notification_ids)) { // Reschedule if details changed or no existing notif IDs
            // Cancel old notifications for this specific schedule if they exist
            if (existingDbSchedule?.notification_ids && existingDbSchedule.notification_ids.length > 0) {
              console.log(`[MedForm] Cancelling ${existingDbSchedule.notification_ids.length} old notifications for updated schedule ID ${st.id}`);
              await Promise.all(existingDbSchedule.notification_ids.map((nid: string) => cancelScheduledNotification(nid)));
            }
            
            const nextNotificationDateObjects = calculateNextNotificationDates(st.time, st.daysOfWeek, startDate, endDate);
            console.log(`[MedForm] For updated schedule ${st.id} (${st.time} on ${st.daysOfWeek.join(',')}), calculated dates:`, nextNotificationDateObjects.map(d => d.toISOString()));

            for (const notificationDateTime of nextNotificationDateObjects) {
              const secondsUntilTrigger = (notificationDateTime.getTime() - new Date().getTime()) / 1000;
              if (secondsUntilTrigger > 0) {
                const trigger: Notifications.TimeIntervalNotificationTriggerInput = {
                  seconds: Math.max(1, Math.round(secondsUntilTrigger)),
                  repeats: false,
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                };
                const notificationTitle = `Medication Reminder: ${name}`;
                const notificationBody = `Time to take your ${dosage} of ${name}.`;
                console.log(`[MedForm] Scheduling updated notification for ${name} at ${notificationDateTime.toISOString()} (in ${secondsUntilTrigger}s) with explicit trigger`);
                const notificationId = await scheduleLocalNotification(
                  notificationTitle,
                  notificationBody,
                  Math.max(1, Math.round(secondsUntilTrigger)),
                  { medicationId: savedMedicationId, scheduleTime: st.time, originalScheduleId: st.id },
                  trigger // Pass explicit trigger
                );
                if (notificationId) newNotificationIds.push(notificationId);
              }
            }
            return supabase.from('medication_schedules').update({
              scheduled_time: st.time,
              days_of_week: st.daysOfWeek,
              notification_ids: newNotificationIds.length > 0 ? newNotificationIds : null,
            }).eq('id', st.id);
          } else if (existingDbSchedule) {
            // No change in time/days, retain existing notification_ids
            return supabase.from('medication_schedules').update({
              // No need to update time or days_of_week if not changed
              // notification_ids: existingDbSchedule.notification_ids 
              // No change implies no update needed unless explicitly clearing/changing notification_ids
            }).eq('id', st.id); // Effectively a no-op if nothing else changes, but good for consistency
          }
          return null;
        });
        const updateResults = await Promise.all(updatePromises.filter(p => p !== null));
        updateResults.forEach(result => {
          if (result && result.error) console.warn('Error updating schedule:', result.error.message);
        });
      }
      
      setIsLoading(false);
      Alert.alert('Success', `Medication ${isEditing ? 'updated' : 'saved'} successfully.`);
      navigation.navigate('MedicationList');
    } catch (e: any) {
      setIsLoading(false);
      setError(e.message || 'An unexpected error occurred.');
      console.error('Error saving medication:', e);
      Alert.alert('Error', e.message || 'Failed to save medication.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>{isEditing ? 'Edit Medication' : 'Add New Medication'}</Text>
      
      <TextInput
        label="Medication Name"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
        disabled={isLoading}
      />
      <TextInput
        label="Dosage"
        value={dosage}
        onChangeText={setDosage}
        mode="outlined"
        style={styles.input}
        disabled={isLoading}
      />
      <HelperText type="error" visible={!dosage && !!error}>
        Dosage is required.
      </HelperText>

      <TextInput
        label="Instructions (optional)"
        value={instructions}
        onChangeText={setInstructions}
        mode="outlined"
        style={styles.input}
        multiline
        disabled={isLoading}
      />

      <Card style={styles.dateCard}>
        <Card.Content>
          <Button onPress={() => setOpenStartDatePicker(true)} uppercase={false} mode="outlined" disabled={isLoading}>
            {startDate ? `Start Date: ${startDate.toLocaleDateString()}` : "Set Start Date"}
          </Button>
          <DatePickerModal
            locale="en"
            mode="single"
            visible={openStartDatePicker}
            onDismiss={onDismissStartDatePicker}
            date={startDate}
            onConfirm={onConfirmStartDatePicker}
          />
          <View style={{marginTop: 10}} />
          <Button onPress={() => setOpenEndDatePicker(true)} uppercase={false} mode="outlined" disabled={isLoading}>
            {endDate ? `End Date: ${endDate.toLocaleDateString()}` : "Set End Date (Optional)"}
          </Button>
          <DatePickerModal
            locale="en"
            mode="single"
            visible={openEndDatePicker}
            onDismiss={onDismissEndDatePicker}
            date={endDate}
            onConfirm={onConfirmEndDatePicker}
            validRange={{ startDate: startDate }} // End date cannot be before start date
          />
        </Card.Content>
      </Card>

      <Card style={styles.scheduleCard}>
        <Card.Title 
            title="Medication Schedule" 
            subtitle="Add times and select days"
            right={(props) => <IconButton {...props} icon="plus-circle" onPress={() => setTimePickerVisible(true)} disabled={isLoading} />}
        />
        <Card.Content>
            {scheduleTimes.length === 0 && (
                <Text style={styles.noScheduleText}>No schedule times added yet. Tap the '+' to add.</Text>
            )}
            {scheduleTimes.map((schedule, index) => (
                <View key={index} style={styles.scheduleItemContainer}>
                    <List.Item
                        title={`${schedule.time} - ${formatDaysOfWeek(schedule.daysOfWeek)}`}
                        left={props => <List.Icon {...props} icon="clock-outline" />}
                        right={props => <IconButton {...props} icon="delete-outline" onPress={() => removeScheduleTime(index)} disabled={isLoading} />}
                        style={styles.scheduleListItem}
                    />
                    <View style={styles.daysOfWeekContainer}>
                        {days.map(day => (
                            <Chip 
                                key={day}
                                selected={schedule.daysOfWeek.includes(day)}
                                onPress={() => toggleDayOfWeek(index, day)}
                                style={styles.dayChip}
                                mode="outlined"
                                disabled={isLoading}
                            >
                                {day}
                            </Chip>
                        ))}
                    </View>
                </View>
            ))}
        </Card.Content>
      </Card>
      
      <TimePickerModal
        visible={timePickerVisible}
        onDismiss={onDismissTimePicker}
        onConfirm={onConfirmTimePicker}
        hours={12} 
        minutes={0}
      />

      {error && <HelperText type="error" visible={!!error} style={styles.errorText}>{error}</HelperText>}

      <Button 
        mode="contained" 
        onPress={handleSave} 
        style={styles.saveButton}
        loading={isLoading}
        disabled={isLoading}
      >
        {isEditing ? 'Update Medication' : 'Save Medication'}
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    marginBottom: 12,
  },
  dateCard: {
    marginBottom: 16,
    marginTop: 4
  },
  scheduleCard: {
    marginBottom: 16,
  },
  scheduleItemContainer: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  scheduleListItem: {
    paddingLeft: 0, 
    paddingRight: 0,
  },
  daysOfWeekContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayChip: {
    margin: 2,
    minWidth: '12%', // Ensure 7 chips fit well
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  noScheduleText: {
    textAlign: 'center',
    marginVertical: 10,
    fontStyle: 'italic'
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 16,
  },
  saveButton: {
    marginTop: 20,
    paddingVertical: 8,
  }
});

export default MedicationFormScreen; 