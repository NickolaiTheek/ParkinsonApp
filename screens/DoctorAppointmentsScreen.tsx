import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import {
  Text,
  useTheme,
  Card,
  Button,
  ActivityIndicator,
  Surface,
  IconButton,
  Chip,
  FAB,
  Modal,
  Portal,
  TextInput,
  HelperText,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  SlideInRight,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO, isBefore, addDays, addHours } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const AnimatedCard = Animated.createAnimatedComponent(Card);

// Parkinson's-related medical specialties
const PARKINSON_SPECIALTIES = [
  'Neurologist',
  'Movement Disorder Specialist',
  'Parkinson\'s Disease Specialist',
  'Physical Therapist',
  'Occupational Therapist',
  'Speech Therapist',
  'Psychiatrist',
  'Geriatrician',
  'Primary Care Physician',
  'Pharmacist',
  'Nutritionist',
  'Other'
];

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface DoctorAppointment {
  id: string;
  patient_id: string;
  doctor_name: string;
  doctor_specialty: string;
  appointment_date: string;
  appointment_time: string;
  location: string;
  notes?: string;
  appointment_type: 'in-person' | 'telemedicine' | 'phone';
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  reminder_sent: boolean;
  notification_id?: string;
  created_at: string;
  updated_at: string;
}

interface AppointmentFormData {
  doctor_name: string;
  doctor_specialty: string;
  appointment_date: Date;
  appointment_time: Date;
  location: string;
  notes: string;
  appointment_type: 'in-person' | 'telemedicine' | 'phone';
}

const DoctorAppointmentsScreen: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<DoctorAppointment | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [formData, setFormData] = useState<AppointmentFormData>({
    doctor_name: '',
    doctor_specialty: '',
    appointment_date: new Date(),
    appointment_time: new Date(),
    location: '',
    notes: '',
    appointment_type: 'in-person',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const headerHeight = useSharedValue(240);

  useEffect(() => {
    loadAppointments();
    requestNotificationPermissions();
  }, []);

  const requestNotificationPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please enable notifications to receive appointment reminders.');
    }
  };

  const loadAppointments = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('doctor_appointments')
        .select('*')
        .eq('patient_id', user.id)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error: any) {
      console.error('Error loading appointments:', error);
      Alert.alert('Error', 'Failed to load appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAppointments();
    setRefreshing(false);
  }, []);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.doctor_name.trim()) {
      errors.doctor_name = 'Doctor name is required';
    }

    if (!formData.doctor_specialty.trim()) {
      errors.doctor_specialty = 'Specialty is required';
    }

    if (!formData.location.trim()) {
      errors.location = 'Location is required';
    }

    // Create appointment datetime by combining date and time properly
    const appointmentDateTime = new Date(formData.appointment_date);
    appointmentDateTime.setHours(
      formData.appointment_time.getHours(),
      formData.appointment_time.getMinutes(),
      0, // seconds
      0  // milliseconds
    );

    // Get current date and time
    const now = new Date();
    
    // Check if appointment is in the future (add a small buffer of 1 minute)
    const oneMinuteFromNow = new Date(now.getTime() + 60000); // 1 minute buffer
    
    if (appointmentDateTime <= oneMinuteFromNow) {
      errors.appointment_date = 'Appointment must be in the future';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const scheduleNotification = async (appointment: DoctorAppointment): Promise<string | null> => {
    try {
      const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
      const reminderTime = addHours(appointmentDateTime, -24); // 24 hours before

      if (isBefore(reminderTime, new Date())) {
        return null; // Don't schedule if reminder time is in the past
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🩺 Appointment Reminder',
          body: `You have an appointment with Dr. ${appointment.doctor_name} tomorrow at ${format(appointmentDateTime, 'h:mm a')}`,
          data: { appointmentId: appointment.id },
          sound: true,
        },
        trigger: {
          date: reminderTime,
        },
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  };

  const cancelNotification = async (notificationId: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  };

  const saveAppointment = async () => {
    if (!validateForm() || !user?.id) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const appointmentDateTime = new Date(formData.appointment_date);
      appointmentDateTime.setHours(formData.appointment_time.getHours(), formData.appointment_time.getMinutes());

      const appointmentData = {
        patient_id: user.id,
        doctor_name: formData.doctor_name.trim(),
        doctor_specialty: formData.doctor_specialty.trim(),
        appointment_date: format(formData.appointment_date, 'yyyy-MM-dd'),
        appointment_time: format(formData.appointment_time, 'HH:mm:ss'),
        location: formData.location.trim(),
        notes: formData.notes.trim(),
        appointment_type: formData.appointment_type,
        status: 'scheduled',
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (editingAppointment) {
        // Update existing appointment
        if (editingAppointment.notification_id) {
          await cancelNotification(editingAppointment.notification_id);
        }

        const { data, error } = await supabase
          .from('doctor_appointments')
          .update(appointmentData)
          .eq('id', editingAppointment.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new appointment
        const { data, error } = await supabase
          .from('doctor_appointments')
          .insert({
            ...appointmentData,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      // Schedule notification
      const notificationId = await scheduleNotification(result);
      if (notificationId) {
        await supabase
          .from('doctor_appointments')
          .update({ notification_id: notificationId })
          .eq('id', result.id);
      }

      closeModal();
      await loadAppointments();
      
      Alert.alert(
        'Success',
        editingAppointment ? 'Appointment updated successfully!' : 'Appointment scheduled successfully!',
        [{ text: 'OK', onPress: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) }]
      );
    } catch (error: any) {
      console.error('Error saving appointment:', error);
      Alert.alert('Error', 'Failed to save appointment. Please try again.');
    }
  };

  const deleteAppointment = async (appointment: DoctorAppointment) => {
    Alert.alert(
      'Delete Appointment',
      'Are you sure you want to delete this appointment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

              if (appointment.notification_id) {
                await cancelNotification(appointment.notification_id);
              }

              const { error } = await supabase
                .from('doctor_appointments')
                .delete()
                .eq('id', appointment.id);

              if (error) throw error;

              await loadAppointments();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              console.error('Error deleting appointment:', error);
              Alert.alert('Error', 'Failed to delete appointment. Please try again.');
            }
          },
        },
      ]
    );
  };

  const markAsCompleted = async (appointment: DoctorAppointment) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { error } = await supabase
        .from('doctor_appointments')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment.id);

      if (error) throw error;

      await loadAppointments();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Error updating appointment:', error);
      Alert.alert('Error', 'Failed to update appointment. Please try again.');
    }
  };

  const openModal = (appointment?: DoctorAppointment) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({
        doctor_name: appointment.doctor_name,
        doctor_specialty: appointment.doctor_specialty,
        appointment_date: parseISO(appointment.appointment_date),
        appointment_time: new Date(`2000-01-01T${appointment.appointment_time}`),
        location: appointment.location,
        notes: appointment.notes || '',
        appointment_type: appointment.appointment_type,
      });
    } else {
      setEditingAppointment(null);
      // Set default date to tomorrow
      const tomorrow = addDays(new Date(), 1);
      // Set default time to 10:00 AM
      const defaultTime = new Date();
      defaultTime.setHours(10, 0, 0, 0);
      
      setFormData({
        doctor_name: '',
        doctor_specialty: '',
        appointment_date: tomorrow,
        appointment_time: defaultTime,
        location: '',
        notes: '',
        appointment_type: 'in-person',
      });
    }
    setFormErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingAppointment(null);
    setFormErrors({});
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return theme.colors.primary;
      case 'completed': return '#4CAF50';
      case 'cancelled': return '#F44336';
      case 'rescheduled': return '#FF9800';
      default: return theme.colors.outline;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'telemedicine': return 'video';
      case 'phone': return 'phone';
      default: return 'hospital-building';
    }
  };

  const renderAppointmentCard = (appointment: DoctorAppointment, index: number) => {
    const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
    const isUpcoming = !isBefore(appointmentDateTime, new Date());
    const isPast = isBefore(appointmentDateTime, new Date());

    return (
      <AnimatedCard
        key={appointment.id}
        entering={FadeInDown.delay(index * 100).springify()}
        layout={Layout.springify()}
        style={[styles.modernAppointmentCard]}
        elevation={4}
      >
        {/* Card Header with Gradient */}
        <LinearGradient
          colors={isUpcoming ? ['#667eea', '#764ba2'] : ['#9ca3af', '#6b7280']}
          style={styles.cardHeaderGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.cardHeaderContent}>
            <View style={styles.doctorInfo}>
              <MaterialCommunityIcons 
                name="doctor" 
                size={24} 
                color="white" 
                style={styles.doctorIcon}
              />
              <View style={styles.doctorDetails}>
                <Text variant="titleMedium" style={styles.modernDoctorName}>
                  Dr. {appointment.doctor_name}
                </Text>
                <Text variant="bodyMedium" style={styles.modernSpecialty}>
                  {appointment.doctor_specialty}
                </Text>
              </View>
            </View>
            <View style={styles.statusContainer}>
              <Chip
                mode="flat"
                textStyle={styles.modernStatusChip}
                style={[styles.modernStatusChipContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
              >
                {appointment.status}
              </Chip>
            </View>
          </View>
        </LinearGradient>

        {/* Card Body */}
        <View style={styles.modernCardBody}>
          {/* Date & Time Row */}
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeItem}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="calendar-heart" size={20} color="#667eea" />
              </View>
              <View style={styles.dateTimeContent}>
                <Text variant="bodySmall" style={styles.dateTimeLabel}>Date</Text>
                <Text variant="bodyMedium" style={styles.dateTimeValue}>
                  {format(appointmentDateTime, 'EEE, MMM d')}
                </Text>
              </View>
            </View>
            
            <View style={styles.dateTimeItem}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="clock-time-four" size={20} color="#667eea" />
              </View>
              <View style={styles.dateTimeContent}>
                <Text variant="bodySmall" style={styles.dateTimeLabel}>Time</Text>
                <Text variant="bodyMedium" style={styles.dateTimeValue}>
                  {format(appointmentDateTime, 'h:mm a')}
                </Text>
              </View>
            </View>
          </View>

          {/* Location & Type Row */}
          <View style={styles.locationTypeRow}>
            <View style={styles.locationItem}>
              <MaterialCommunityIcons name={getTypeIcon(appointment.appointment_type)} size={18} color="#6b7280" />
              <Text variant="bodyMedium" style={styles.locationText}>
                {appointment.location}
              </Text>
            </View>
            <View style={styles.typeIndicator}>
              <Text variant="bodySmall" style={styles.typeText}>
                {appointment.appointment_type === 'in-person' ? 'In-Person' : 
                 appointment.appointment_type === 'telemedicine' ? 'Video Call' : 'Phone Call'}
              </Text>
            </View>
          </View>

          {/* Notes if available */}
          {appointment.notes && (
            <View style={styles.notesContainer}>
              <MaterialCommunityIcons name="note-text" size={16} color="#6b7280" />
              <Text variant="bodySmall" style={styles.modernNotesText}>
                {appointment.notes}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.modernAppointmentActions}>
            {isUpcoming && appointment.status === 'scheduled' && (
              <Button
                mode="contained"
                onPress={() => markAsCompleted(appointment)}
                style={styles.modernCompleteButton}
                labelStyle={styles.modernActionButtonLabel}
                buttonColor="#10b981"
                compact
              >
                Complete
              </Button>
            )}
            <Button
              mode="outlined"
              onPress={() => openModal(appointment)}
              style={styles.modernEditButton}
              labelStyle={styles.modernActionButtonLabel}
              textColor="#667eea"
              compact
            >
              Edit
            </Button>
            <Button
              mode="text"
              onPress={() => deleteAppointment(appointment)}
              style={styles.modernDeleteButton}
              labelStyle={styles.modernDeleteButtonLabel}
              textColor="#ef4444"
              compact
            >
              Delete
            </Button>
          </View>
        </View>
      </AnimatedCard>
    );
  };

  const upcomingAppointments = appointments.filter(app => 
    app.status === 'scheduled' && !isBefore(new Date(`${app.appointment_date}T${app.appointment_time}`), new Date())
  );
  
  const pastAppointments = appointments.filter(app => 
    app.status === 'completed' || isBefore(new Date(`${app.appointment_date}T${app.appointment_time}`), new Date())
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" animating={true} />
        <Text variant="bodyMedium" style={styles.loadingText}>Loading appointments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Header */}
      <Animated.View style={[styles.headerContainer]}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <BlurView intensity={20} style={styles.headerBlur}>
            <View style={styles.headerContent}>
              <View style={styles.headerTitleContainer}>
                <MaterialCommunityIcons name="calendar-heart" size={24} color="white" />
                <Text variant="headlineSmall" style={styles.headerTitle}>
                  Doctor Appointments
                </Text>
              </View>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                Manage your medical appointments and reminders
              </Text>
            </View>
          </BlurView>
        </LinearGradient>
      </Animated.View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Upcoming Appointments */}
        {upcomingAppointments.length > 0 && (
          <View style={styles.section}>
            <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
              Upcoming Appointments
            </Text>
            {upcomingAppointments.map((appointment, index) => renderAppointmentCard(appointment, index))}
          </View>
        )}

        {/* Past Appointments */}
        {pastAppointments.length > 0 && (
          <View style={styles.section}>
            <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
              Past Appointments
            </Text>
            {pastAppointments.map((appointment, index) => renderAppointmentCard(appointment, index + upcomingAppointments.length))}
          </View>
        )}

        {/* Empty State */}
        {appointments.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-plus" size={80} color={theme.colors.outline} />
            <Text variant="headlineSmall" style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
              No Appointments Yet
            </Text>
            <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
              Schedule your first appointment with your healthcare provider
            </Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => openModal()}
        label="Add Appointment"
      />

      {/* Appointment Modal */}
      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modalContainer}>
          <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} elevation={5}>
            {/* Beautiful Header */}
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.modalHeaderGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialCommunityIcons 
                name={editingAppointment ? "calendar-edit" : "calendar-plus"} 
                size={32} 
                color="white" 
              />
              <Text variant="headlineSmall" style={styles.modalHeaderTitle}>
                {editingAppointment ? 'Edit Appointment' : 'New Appointment'}
              </Text>
              <Text variant="bodyMedium" style={styles.modalHeaderSubtitle}>
                {editingAppointment ? 'Update your appointment details' : 'Schedule your next visit'}
              </Text>
            </LinearGradient>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Doctor Name Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputLabelRow}>
                  <MaterialCommunityIcons name="doctor" size={20} color="#667eea" />
                  <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                    Doctor Name
                  </Text>
                </View>
                <TextInput
                  label=""
                  placeholder="Enter doctor's name"
                  value={formData.doctor_name}
                  onChangeText={(text) => setFormData({ ...formData, doctor_name: text })}
                  style={styles.modernInput}
                  error={!!formErrors.doctor_name}
                  mode="outlined"
                  outlineColor="#e1e5e9"
                  activeOutlineColor="#667eea"
                />
                <HelperText type="error" visible={!!formErrors.doctor_name}>
                  {formErrors.doctor_name}
                </HelperText>
              </View>

              {/* Specialty Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputLabelRow}>
                  <MaterialCommunityIcons name="stethoscope" size={20} color="#667eea" />
                  <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                    Medical Specialty
                  </Text>
                </View>
                <View style={styles.specialtyChipsContainer}>
                  {PARKINSON_SPECIALTIES.map((specialty) => (
                    <Chip
                      key={specialty}
                      selected={formData.doctor_specialty === specialty}
                      onPress={() => setFormData({ ...formData, doctor_specialty: specialty })}
                      style={[
                        styles.modernSpecialtyChip,
                        formData.doctor_specialty === specialty && styles.selectedSpecialtyChip
                      ]}
                      textStyle={[
                        styles.specialtyChipText,
                        formData.doctor_specialty === specialty && styles.selectedSpecialtyChipText
                      ]}
                      mode={formData.doctor_specialty === specialty ? "flat" : "outlined"}
                    >
                      {specialty}
                    </Chip>
                  ))}
                </View>
                <HelperText type="error" visible={!!formErrors.doctor_specialty}>
                  {formErrors.doctor_specialty}
                </HelperText>
              </View>

              {/* Date & Time Section */}
              <View style={styles.dateTimeContainer}>
                <View style={styles.dateTimeSection}>
                  <View style={styles.inputLabelRow}>
                    <MaterialCommunityIcons name="calendar-heart" size={20} color="#667eea" />
                    <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                      Appointment Date
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    onPress={() => setShowDatePicker(true)}
                    icon="calendar"
                    style={styles.modernDateTimeButton}
                    contentStyle={styles.dateTimeButtonContent}
                    labelStyle={styles.dateTimeButtonLabel}
                    buttonColor="#f8f9fa"
                    textColor="#2c3e50"
                  >
                    {format(formData.appointment_date, 'EEEE, MMMM do, yyyy')}
                  </Button>
                  <HelperText type="error" visible={!!formErrors.appointment_date}>
                    {formErrors.appointment_date}
                  </HelperText>
                </View>

                <View style={styles.dateTimeSection}>
                  <View style={styles.inputLabelRow}>
                    <MaterialCommunityIcons name="clock-time-four" size={20} color="#667eea" />
                    <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                      Appointment Time
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    onPress={() => setShowTimePicker(true)}
                    icon="clock"
                    style={styles.modernDateTimeButton}
                    contentStyle={styles.dateTimeButtonContent}
                    labelStyle={styles.dateTimeButtonLabel}
                    buttonColor="#f8f9fa"
                    textColor="#2c3e50"
                  >
                    {format(formData.appointment_time, 'h:mm a')}
                  </Button>
                </View>
              </View>

              {/* Location Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputLabelRow}>
                  <MaterialCommunityIcons name="map-marker" size={20} color="#667eea" />
                  <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                    Location
                  </Text>
                </View>
                <TextInput
                  label=""
                  placeholder="Hospital, clinic, or address"
                  value={formData.location}
                  onChangeText={(text) => setFormData({ ...formData, location: text })}
                  style={styles.modernInput}
                  error={!!formErrors.location}
                  mode="outlined"
                  outlineColor="#e1e5e9"
                  activeOutlineColor="#667eea"
                />
                <HelperText type="error" visible={!!formErrors.location}>
                  {formErrors.location}
                </HelperText>
              </View>

              {/* Appointment Type Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputLabelRow}>
                  <MaterialCommunityIcons name="hospital-building" size={20} color="#667eea" />
                  <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                    Appointment Type
                  </Text>
                </View>
                <View style={styles.typeChipsContainer}>
                  {(['in-person', 'telemedicine', 'phone'] as const).map((type) => (
                    <Chip
                      key={type}
                      selected={formData.appointment_type === type}
                      onPress={() => setFormData({ ...formData, appointment_type: type })}
                      style={[
                        styles.modernTypeChip,
                        formData.appointment_type === type && styles.selectedTypeChip
                      ]}
                      textStyle={[
                        styles.typeChipText,
                        formData.appointment_type === type && styles.selectedTypeChipText
                      ]}
                      icon={type === 'in-person' ? 'hospital-building' : type === 'telemedicine' ? 'video' : 'phone'}
                    >
                      {type === 'in-person' ? 'In-Person' : type === 'telemedicine' ? 'Telemedicine' : 'Phone Call'}
                    </Chip>
                  ))}
                </View>
              </View>

              {/* Notes Section */}
              <View style={styles.inputSection}>
                <View style={styles.inputLabelRow}>
                  <MaterialCommunityIcons name="note-text" size={20} color="#667eea" />
                  <Text variant="bodyMedium" style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
                    Additional Notes
                  </Text>
                </View>
                <TextInput
                  label=""
                  placeholder="Any additional information or concerns..."
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  style={styles.modernInput}
                  multiline
                  numberOfLines={3}
                  mode="outlined"
                  outlineColor="#e1e5e9"
                  activeOutlineColor="#667eea"
                />
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActionsContainer}>
              <Button 
                mode="contained" 
                onPress={closeModal} 
                style={styles.modernCancelButton}
                labelStyle={styles.cancelButtonLabel}
                buttonColor="#e5e7eb"
                textColor="#374151"
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={saveAppointment} 
                style={styles.modernScheduleButton}
                labelStyle={styles.scheduleButtonLabel}
                buttonColor="#667eea"
                icon={editingAppointment ? "calendar-check" : "calendar-plus"}
              >
                {editingAppointment ? 'Update' : 'Schedule'}
              </Button>
            </View>
          </Surface>
        </Modal>
      </Portal>

      {/* Date Picker Modal */}
      <Portal>
        <Modal visible={showDatePicker} onDismiss={() => setShowDatePicker(false)} contentContainerStyle={styles.pickerModalContainer}>
          <Surface style={styles.simplePickerModalContent} elevation={8}>
            {/* Simple Header */}
            <View style={styles.simplePickerHeader}>
              <MaterialCommunityIcons name="calendar-heart" size={24} color="#667eea" />
              <Text variant="titleLarge" style={styles.simplePickerTitle}>
                Select Date
              </Text>
            </View>
            
            {/* Date Picker */}
            <View style={styles.simpleDateTimePickerContainer}>
              <DateTimePicker
                value={formData.appointment_date}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  if (selectedDate) {
                    setFormData({ ...formData, appointment_date: selectedDate });
                  }
                }}
                minimumDate={new Date()}
                style={styles.simpleDateTimePicker}
              />
            </View>
            
            {/* Simple Action Buttons */}
            <View style={styles.simplePickerActions}>
              <Button 
                mode="outlined" 
                onPress={() => setShowDatePicker(false)}
                style={styles.simplePickerButton}
                textColor="#6b7280"
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={() => setShowDatePicker(false)}
                style={styles.simplePickerButton}
                buttonColor="#667eea"
              >
                Confirm
              </Button>
            </View>
          </Surface>
        </Modal>
      </Portal>

      {/* Time Picker Modal */}
      <Portal>
        <Modal visible={showTimePicker} onDismiss={() => setShowTimePicker(false)} contentContainerStyle={styles.pickerModalContainer}>
          <Surface style={styles.simplePickerModalContent} elevation={8}>
            {/* Simple Header */}
            <View style={styles.simplePickerHeader}>
              <MaterialCommunityIcons name="clock-time-four" size={24} color="#667eea" />
              <Text variant="titleLarge" style={styles.simplePickerTitle}>
                Select Time
              </Text>
            </View>
            
            {/* Time Picker */}
            <View style={styles.simpleDateTimePickerContainer}>
              <DateTimePicker
                value={formData.appointment_time}
                mode="time"
                display="default"
                onChange={(event, selectedTime) => {
                  if (selectedTime) {
                    setFormData({ ...formData, appointment_time: selectedTime });
                  }
                }}
                style={styles.simpleDateTimePicker}
              />
            </View>
            
            {/* Simple Action Buttons */}
            <View style={styles.simplePickerActions}>
              <Button 
                mode="outlined" 
                onPress={() => setShowTimePicker(false)}
                style={styles.simplePickerButton}
                textColor="#6b7280"
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={() => setShowTimePicker(false)}
                style={styles.simplePickerButton}
                buttonColor="#667eea"
              >
                Confirm
              </Button>
            </View>
          </Surface>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
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
    zIndex: 1,
  },
  headerGradient: {
    paddingTop: 0,
    paddingBottom: 10,
  },
  headerBlur: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modernAppointmentCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeaderGradient: {
    padding: 16,
    paddingBottom: 12,
  },
  cardHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doctorIcon: {
    marginRight: 12,
  },
  doctorDetails: {
    flex: 1,
  },
  modernDoctorName: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: 'white',
  },
  modernSpecialty: {
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  statusContainer: {
    height: 28,
  },
  modernStatusChipContainer: {
    height: 28,
  },
  modernStatusChip: {
    fontSize: 12,
    fontWeight: '500',
  },
  modernCardBody: {
    padding: 16,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  dateTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateTimeContent: {
    marginLeft: 8,
  },
  dateTimeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  locationTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
  },
  typeIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#667eea',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    gap: 8,
  },
  modernNotesText: {
    flex: 1,
    fontStyle: 'italic',
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  modernAppointmentActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  modernCompleteButton: {
    height: 36,
  },
  modernEditButton: {
    height: 36,
  },
  modernDeleteButton: {
    height: 36,
  },
  modernActionButtonLabel: {
    fontSize: 12,
  },
  modernDeleteButtonLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  modalContainer: {
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    borderRadius: 16,
    maxHeight: height * 0.8,
  },
  modalHeaderGradient: {
    padding: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  modalHeaderTitle: {
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 8,
  },
  modalHeaderSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  modalForm: {
    paddingHorizontal: 20,
    maxHeight: height * 0.5,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabel: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: '500',
  },
  modernInput: {
    marginBottom: 8,
  },
  specialtyChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modernSpecialtyChip: {
    marginRight: 8,
  },
  selectedSpecialtyChip: {
    borderWidth: 2,
    borderColor: '#667eea',
  },
  specialtyChipText: {
    fontWeight: '500',
  },
  selectedSpecialtyChipText: {
    fontWeight: 'bold',
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  dateTimeSection: {
    flex: 1,
  },
  modernDateTimeButton: {
    marginTop: 8,
    marginBottom: 8,
  },
  dateTimeButtonContent: {
    justifyContent: 'flex-start',
  },
  dateTimeButtonLabel: {
    fontSize: 12,
  },
  typeChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modernTypeChip: {
    marginRight: 8,
  },
  selectedTypeChip: {
    borderWidth: 2,
    borderColor: '#667eea',
  },
  typeChipText: {
    fontWeight: '500',
  },
  selectedTypeChipText: {
    fontWeight: 'bold',
  },
  modalActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    gap: 12,
  },
  modernCancelButton: {
    flex: 1,
  },
  modernScheduleButton: {
    flex: 1,
  },
  scheduleButtonLabel: {
    fontSize: 12,
  },
  cancelButtonLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
  },
  pickerModalContainer: {
    padding: 20,
    justifyContent: 'center',
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerModalContent: {
    borderRadius: 24,
    overflow: 'hidden',
    maxWidth: width - 40,
    minWidth: width - 80,
    alignSelf: 'center',
  },
  pickerHeaderGradient: {
    padding: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  pickerHeaderTitle: {
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 8,
  },
  pickerHeaderSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  pickerContent: {
    padding: 20,
    paddingTop: 30,
    paddingBottom: 10,
    alignItems: 'center',
  },
  dateTimePickerContainer: {
    marginBottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  dateTimePickerBackground: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: '#667eea',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  dateTimePicker: {
    width: 280,
    height: 120,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
  },
  pickerCancelButton: {
    flex: 1,
  },
  pickerConfirmButton: {
    flex: 1,
  },
  pickerCancelLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  pickerConfirmLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  selectedDateDisplay: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  selectedDateLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  selectedDateValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 4,
  },
  selectedDateNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  simplePickerModalContent: {
    borderRadius: 24,
    overflow: 'hidden',
    maxWidth: width - 40,
    minWidth: width - 80,
    alignSelf: 'center',
    backgroundColor: 'white',
    paddingBottom: 20,
  },
  simplePickerHeader: {
    padding: 20,
    paddingBottom: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  simplePickerTitle: {
    color: '#2c3e50',
    fontWeight: 'bold',
  },
  simpleDateTimePickerContainer: {
    marginBottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  simpleDateTimePicker: {
    width: 280,
    height: 120,
  },
  simplePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
  },
  simplePickerButton: {
    flex: 1,
  },
});

export default DoctorAppointmentsScreen; 