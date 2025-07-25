import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, useTheme, TextInput, Button, Surface } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { UserProfile } from '../lib/supabase';

const AnimatedSurface = Animated.createAnimatedComponent(Surface);

interface FormField {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  type?: 'text' | 'phone' | 'date' | 'gender';
}

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other' | null;
  emergency_contact: string;
  medication_sensitivity: string;
}

const EditProfileScreen: React.FC = () => {
  const { user, updateUserProfile } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    date_of_birth: '',
    gender: null,
    emergency_contact: '',
    medication_sensitivity: '',
  });

  // Animation values
  const formOpacity = useSharedValue(0);
  const formTranslateY = useSharedValue(50);

  useEffect(() => {
    if (user) {
      // Parse first_name JSON
      let firstName = '';
      let lastName = '';
      try {
        if (user.first_name && typeof user.first_name === 'string' && user.first_name.startsWith('{')) {
          const parsed = JSON.parse(user.first_name);
          firstName = parsed.first_name || '';
          lastName = parsed.last_name || '';
        } else {
          firstName = user.first_name || '';
          lastName = user.last_name || '';
        }
      } catch (e) {
        console.error('Error parsing first_name:', e);
        firstName = user.first_name || '';
        lastName = user.last_name || '';
      }

      // Log the parsed name data for debugging
      console.log('Parsed name data:', { firstName, lastName });

      setFormData({
        first_name: firstName,
        last_name: lastName,
        email: user.email || '',
        phone_number: user.phone_number || '',
        date_of_birth: user.date_of_birth || '',
        gender: (user.gender as 'male' | 'female' | 'other' | null) || null,
        emergency_contact: user.emergency_contact || '',
        medication_sensitivity: user.medication_sensitivity || '',
      });
    }

    // Start animations
    formOpacity.value = withTiming(1, { duration: 500 });
    formTranslateY.value = withSpring(0, { damping: 12 });
  }, [user]);

  const formAnimatedStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formTranslateY.value }],
  }));

  const handleSave = async () => {
    try {
      setLoading(true);

      // Validate required fields
      if (!formData.first_name.trim() || !formData.last_name.trim()) {
        Alert.alert('Error', 'First name and last name are required');
        return;
      }

      // Create the update data
      const userData: Partial<UserProfile> = {
        ...formData,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email,
        phone_number: formData.phone_number,
        date_of_birth: formData.date_of_birth ? formData.date_of_birth : null,
        gender: formData.gender,
        emergency_contact: formData.emergency_contact,
        medication_sensitivity: formData.medication_sensitivity,
        profile_setup_complete: true // Set profile setup as complete
      };

      // Log the update data for debugging
      console.log('Updating profile with data:', userData);

      await updateUserProfile(userData);
      
      // Log success
      console.log('Profile updated successfully');
      
      navigation.goBack();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      // Format date as YYYY-MM-DD
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      setFormData(prev => ({
        ...prev,
        date_of_birth: formattedDate,
      }));
    }
  };

  const renderField = (field: FormField, index: number) => {
    const fieldOpacity = useSharedValue(0);
    const fieldScale = useSharedValue(0.8);

    useEffect(() => {
      const delay = index * 100;
      fieldOpacity.value = withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(delay, withTiming(1, { duration: 300 }))
      );
      fieldScale.value = withSequence(
        withTiming(0.8, { duration: 0 }),
        withDelay(delay, withSpring(1, { damping: 12 }))
      );
    }, []);

    const fieldAnimatedStyle = useAnimatedStyle(() => ({
      opacity: fieldOpacity.value,
      transform: [{ scale: fieldScale.value }],
    }));

    return (
      <Animated.View key={field.label} style={fieldAnimatedStyle}>
        <TextInput
          mode="outlined"
          label={field.label}
          value={field.value}
          onChangeText={(text) => {
            const key = field.label.toLowerCase().replace(' ', '_');
            setFormData(prev => ({
              ...prev,
              [key]: key === 'gender' ? (text as 'male' | 'female' | 'other' | null) : text
            }));
          }}
          style={styles.input}
          left={<TextInput.Icon icon={field.icon} />}
          disabled={field.label === 'Email'}
          onPressIn={() => {
            if (field.type === 'date') {
              setShowDatePicker(true);
            }
          }}
        />
      </Animated.View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.formContainer, formAnimatedStyle]}>
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
            Edit Profile
          </Text>

          {renderField({ label: 'First Name', value: formData.first_name, icon: 'account-outline' }, 0)}
          {renderField({ label: 'Last Name', value: formData.last_name, icon: 'account-outline' }, 1)}
          {renderField({ label: 'Email', value: formData.email, icon: 'email-outline' }, 2)}
          {renderField({ label: 'Phone Number', value: formData.phone_number, icon: 'phone-outline', type: 'phone' }, 3)}
          {renderField({ label: 'Date of Birth', value: formData.date_of_birth, icon: 'calendar-outline', type: 'date' }, 4)}
          {renderField({ label: 'Gender', value: formData.gender || '', icon: 'gender-male-female', type: 'gender' }, 5)}
          {renderField({ label: 'Emergency Contact', value: formData.emergency_contact, icon: 'phone-alert-outline' }, 6)}
          {renderField({ label: 'Medication Sensitivity', value: formData.medication_sensitivity, icon: 'pill' }, 7)}

          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.saveButton}
            loading={loading}
            disabled={loading}
          >
            Save Changes
          </Button>
        </Animated.View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={new Date(formData.date_of_birth || Date.now())}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  formContainer: {
    flex: 1,
    gap: 16,
  },
  title: {
    marginBottom: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  input: {
    marginBottom: 12,
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 32,
  },
});

export default EditProfileScreen; 