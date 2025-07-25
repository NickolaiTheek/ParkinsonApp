import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert, Dimensions, RefreshControl, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { Button, Card, Text, Avatar, List, useTheme, Divider, IconButton, Surface } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  useSharedValue,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  Layout,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Animated as RNAnimated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NeumorphicCard } from '../components/NeumorphicCard';
import Svg, { Circle } from 'react-native-svg';
import DailyActionCard from '../components/DailyActionCard';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { HomeStackParamList } from '../src/navigation/MainBottomTabNavigator';
import CaregiverDashboard from '../components/CaregiverDashboard';
import PatientInviteCard from '../components/PatientInviteCard';
import ConnectionGuide from '../components/ConnectionGuide';
import FloatingChatBot from '../components/FloatingChatBot';
import ChatInterface from '../components/ChatInterface';

const ANIMATION_DURATION = 500;
const ITEM_ANIMATION_DELAY = 150;
const { width } = Dimensions.get('window');

const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);

// Configuration for CircularProgress
const circularProgressConfig = {
  activeStrokeWidth: 10,
  inActiveStrokeWidth: 10,
  inActiveStrokeOpacity: 0.2,
  duration: 2000,
  delay: 0,
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface QuickActionCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  delay?: number;
  color?: string;
  iconColor?: string;
}

interface HealthStatusCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: IconName;
  trend?: 'up' | 'down';
  color?: string;
}

interface ListItemAnimationProps {
  index: number;
  children: React.ReactNode;
}

// New interfaces for dynamic health data
interface MedicationAdherence {
  taken: number;
  total: number;
  percentage: number;
}

interface SleepData {
  hours: number;
  quality: 'Poor' | 'Fair' | 'Good' | 'Great';
  qualityScore: number; // 1-4
}

interface NextAppointment {
  daysUntil: number;
  appointmentDate: string | null;
  doctorName?: string;
}

const AnimatedListItemWrapper: React.FC<ListItemAnimationProps> = ({ index, children }) => {
  const enteringAnimation = useCallback(() => {
    'worklet';
    const animations = {
      opacity: withTiming(1, { duration: ANIMATION_DURATION }),
      transform: [
        { 
          translateX: withSequence(
            withTiming(50, { duration: 0 }),
            withDelay(
              index * ITEM_ANIMATION_DELAY,
              withSpring(0, { damping: 12, stiffness: 100 })
            )
          ) 
        },
        { 
          scale: withSequence(
            withTiming(0.8, { duration: 0 }),
            withDelay(
              index * ITEM_ANIMATION_DELAY,
              withSpring(1, { damping: 12, stiffness: 100 })
            )
          ) 
        }
      ]
    };
    const initialValues = {
      opacity: 0,
      transform: [{ translateX: 50 }, { scale: 0.8 }]
    };
    return {
      initialValues,
      animations
    };
  }, [index]);

  return (
    <Animated.View
      entering={enteringAnimation}
      style={styles.listItemContainer}
    >
      {children}
    </Animated.View>
  );
};

const QuickActionCard: React.FC<QuickActionCardProps> = ({ 
  icon, 
  title, 
  subtitle, 
  onPress, 
  delay = 0,
  color,
  iconColor
}) => {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
  }, []);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    onPress();
  }, [onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.quickActionCard, animatedStyle]}>
      <NeumorphicCard
        cardBackgroundColor={color || theme.colors.surfaceVariant}
        shadowColor={theme.colors.outlineVariant}
        shadowDistance={4}
      >
        <View style={styles.quickActionIconContainer}>
          <MaterialCommunityIcons
            name={icon}
            size={32}
            color={iconColor || theme.colors.primary}
          />
        </View>
        <View style={styles.quickActionTextContainer}>
          <Text variant="titleMedium" style={[styles.quickActionTitle, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
          <Text variant="bodySmall" style={[styles.quickActionSubtitle, { color: theme.colors.textDimmed }]}>
            {subtitle}
          </Text>
        </View>
      </NeumorphicCard>
    </Animated.View>
  );
};

const AnimatedCircularProgress = ({ value, maxValue = 100, radius = 40, duration = 1500 }) => {
  const theme = useTheme();
  const animatedValue = useRef(new RNAnimated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const animation = RNAnimated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    });

    const listener = animatedValue.addListener(({ value: v }) => {
      setDisplayValue(Math.floor(v));
    });

    animation.start();

    return () => {
      animation.stop();
      animatedValue.removeListener(listener);
    };
  }, [value, duration]);

  const circumference = 2 * Math.PI * (radius - 10);
  const animatedProps = {
    strokeDashoffset: animatedValue.interpolate({
      inputRange: [0, maxValue],
      outputRange: [circumference, 0],
    }),
  };

  return (
    <View style={{ width: radius * 2, height: radius * 2, alignItems: 'center', justifyContent: 'center' }}>
      <RNAnimated.View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Svg width={radius * 2} height={radius * 2}>
          <Circle
            cx={radius}
            cy={radius}
            r={radius - 10}
            stroke={theme.colors.surfaceVariant}
            strokeWidth={10}
            fill="none"
          />
          <AnimatedCircle
            cx={radius}
            cy={radius}
            r={radius - 10}
            stroke={theme.colors.primary}
            strokeWidth={10}
            fill="none"
            strokeDasharray={circumference}
            {...animatedProps}
          />
        </Svg>
      </RNAnimated.View>
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
            {displayValue}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            / 10
          </Text>
        </View>
      </View>
    </View>
  );
};

const HealthStatusCard = ({ title, value, unit, icon, trend, color }: HealthStatusCardProps) => {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
  }, []);

  const pressAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const cardContent = (
    <>
      <View style={styles.healthStatusHeader}>
        <MaterialCommunityIcons name={icon} size={24} color={theme.colors.accentBlue} />
        <Text variant="titleSmall" style={[styles.healthStatusTitle, { color: theme.colors.textDimmed }]}>{title}</Text>
      </View>
      {title === "Today's Score" ? (
        <View style={[styles.scoreContainer, { minHeight: 100 }]}>
          <Text style={{ color: theme.colors.onSurface }}>Score: {(typeof value === 'string' ? parseFloat(value) : value) * 10} / 100</Text>
          {trend && (
            <MaterialCommunityIcons
              name={trend === 'up' ? 'trending-up' : 'trending-down'}
              size={20}
              color={trend === 'up' ? theme.colors.accentBlue : theme.colors.error}
              style={styles.trendIcon}
            />
          )}
        </View>
      ) : (
        <View style={styles.healthStatusValue}>
          <Text variant="headlineMedium" style={[styles.valueText, { color: theme.colors.onSurface }]}>{value}</Text>
          {unit && <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.textDimmed }]}>{unit}</Text>}
          {trend && (
            <MaterialCommunityIcons
              name={trend === 'up' ? 'trending-up' : 'trending-down'}
              size={20}
              color={trend === 'up' ? theme.colors.accentBlue : theme.colors.error}
              style={styles.trendIcon}
            />
          )}
        </View>
      )}
    </>
  );

  return (
    <Animated.View style={[styles.healthStatusCardOuter, pressAnimatedStyle]}>
      <NeumorphicCard
        style={styles.healthStatusCardInner} 
        cardBackgroundColor={color || theme.colors.surfaceVariant}
        shadowColor={theme.colors.outlineVariant}
        shadowDistance={title === "Today's Score" ? 6 : 5} 
      >
        {cardContent}
      </NeumorphicCard>
    </Animated.View>
  );
};

// New Dynamic Health Cards Components
const MedicationAdherenceCard = ({ adherence }: { adherence: MedicationAdherence }) => {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
  }, []);

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getAdherenceColor = (percentage: number) => {
    if (percentage >= 80) return '#22c55e'; // Green
    if (percentage >= 60) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  return (
    <Animated.View style={[styles.healthStatusCardOuter, pressAnimatedStyle]}>
      <NeumorphicCard
        style={styles.healthStatusCardInner}
        cardBackgroundColor={theme.colors.surfaceVariant}
        shadowColor={theme.colors.outlineVariant}
        shadowDistance={5}
      >
        <View style={styles.healthStatusHeader}>
          <MaterialCommunityIcons name="pill" size={24} color="#667eea" />
          <Text variant="titleSmall" style={[styles.healthStatusTitle, { color: theme.colors.textDimmed }]}>
            Medication Adherence
          </Text>
        </View>
        <View style={styles.healthStatusValue}>
          <Text variant="headlineSmall" style={[styles.valueText, { color: getAdherenceColor(adherence.percentage) }]}>
            {adherence.percentage}%
          </Text>
        </View>
        <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.textDimmed, marginTop: 4 }]}>
          {adherence.taken} of {adherence.total} taken today
        </Text>
      </NeumorphicCard>
    </Animated.View>
  );
};

const SleepQualityCard = ({ sleepData }: { sleepData: SleepData }) => {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    // Navigate to health metrics screen
    navigation.navigate('Metrics' as any);
  }, [navigation]);

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getQualityEmoji = (quality: string) => {
    switch (quality) {
      case 'Great': return '😴';
      case 'Good': return '😊';
      case 'Fair': return '😐';
      case 'Poor': return '😞';
      default: return '💤';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Great': return '#22c55e';
      case 'Good': return '#3b82f6';
      case 'Fair': return '#f59e0b';
      case 'Poor': return '#ef4444';
      default: return theme.colors.onSurface;
    }
  };

  return (
    <Animated.View style={[styles.healthStatusCardOuter, pressAnimatedStyle]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        <NeumorphicCard
          style={styles.healthStatusCardInner}
          cardBackgroundColor={theme.colors.surfaceVariant}
          shadowColor={theme.colors.outlineVariant}
          shadowDistance={5}
        >
          <View style={styles.healthStatusHeader}>
            <MaterialCommunityIcons name="sleep" size={24} color="#8b5cf6" />
            <Text variant="titleSmall" style={[styles.healthStatusTitle, { color: theme.colors.textDimmed }]}>
              Sleep Quality
            </Text>
          </View>
          <View style={styles.healthStatusValue}>
            <Text variant="headlineSmall" style={[styles.valueText, { color: theme.colors.onSurface }]}>
              {sleepData.hours}
            </Text>
            <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.textDimmed }]}>hours</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
            <Text style={{ fontSize: 16 }}>{getQualityEmoji(sleepData.quality)}</Text>
            <Text variant="bodySmall" style={[{ color: getQualityColor(sleepData.quality), fontWeight: '600' }]}>
              {sleepData.quality}
            </Text>
          </View>
        </NeumorphicCard>
      </TouchableOpacity>
    </Animated.View>
  );
};

const NextAppointmentCard = ({ appointmentData }: { appointmentData: NextAppointment }) => {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
  }, []);

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getCountdownText = () => {
    if (!appointmentData.appointmentDate) {
      return 'No upcoming appointments';
    }
    if (appointmentData.daysUntil === 0) {
      return 'Today!';
    }
    if (appointmentData.daysUntil === 1) {
      return 'Tomorrow';
    }
    return `${appointmentData.daysUntil} days`;
  };

  const getCountdownColor = () => {
    if (!appointmentData.appointmentDate) return theme.colors.textDimmed;
    if (appointmentData.daysUntil <= 1) return '#ef4444'; // Red for urgent
    if (appointmentData.daysUntil <= 7) return '#f59e0b'; // Orange for soon
    return '#22c55e'; // Green for plenty of time
  };

  return (
    <Animated.View style={[styles.healthStatusCardOuter, pressAnimatedStyle]}>
      <NeumorphicCard
        style={styles.healthStatusCardInner}
        cardBackgroundColor={theme.colors.surfaceVariant}
        shadowColor={theme.colors.outlineVariant}
        shadowDistance={5}
      >
        <View style={styles.healthStatusHeader}>
          <MaterialCommunityIcons name="calendar-heart" size={24} color="#f97316" />
          <Text variant="titleSmall" style={[styles.healthStatusTitle, { color: theme.colors.textDimmed }]}>
            Next Appointment
          </Text>
        </View>
        <View style={styles.healthStatusValue}>
          <Text variant="headlineSmall" style={[styles.valueText, { color: getCountdownColor() }]}>
            {getCountdownText()}
          </Text>
        </View>
        {appointmentData.doctorName && (
          <Text variant="bodySmall" style={[styles.unitText, { color: theme.colors.textDimmed, marginTop: 4 }]}>
            Dr. {appointmentData.doctorName}
          </Text>
        )}
      </NeumorphicCard>
    </Animated.View>
  );
};

type HomeScreenNavigationProp = StackNavigationProp<HomeStackParamList, 'HomeMain'>;

const HomeScreen: React.FC = () => {
  const { signOut, user, session, loading: authLoading, caregivers, patients, loadRelationships } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const navigation = useNavigation<HomeScreenNavigationProp>();

  // New state for dynamic health data
  const [medicationAdherence, setMedicationAdherence] = useState<MedicationAdherence>({
    taken: 0,
    total: 0,
    percentage: 0
  });
  const [sleepData, setSleepData] = useState<SleepData>({
    hours: 7.5,
    quality: 'Good',
    qualityScore: 3
  });
  const [nextAppointment, setNextAppointment] = useState<NextAppointment>({
    daysUntil: 0,
    appointmentDate: null,
    doctorName: undefined
  });
  
  // Chatbot state
  const [showChatInterface, setShowChatInterface] = useState(false);

  // Animation values using react-native-reanimated
  const fadeAnim = useSharedValue(0);
  const slideAnim = useSharedValue(50);
  const scaleAnim = useSharedValue(0.9);

  // Function to fetch medication adherence for today
  const fetchMedicationAdherence = useCallback(async () => {
    if (!user?.id) return;

    try {
      const today = new Date();
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      // Get today's scheduled medications (schedules use time column and days_of_week array)
      const { data: schedules, error: schedulesError } = await supabase
        .from('medication_schedules')
        .select(`
          id,
          medication_id,
          scheduled_time,
          days_of_week,
          medications!inner(
            id,
            name,
            user_id
          )
        `)
        .eq('medications.user_id', user.id)
        .contains('days_of_week', [dayOfWeek]);

      if (schedulesError) throw schedulesError;

      const totalScheduled = schedules?.length || 0;

      // Get today's taken medications
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      const { data: logs, error: logsError } = await supabase
        .from('medication_administration_logs')
        .select('id, medication_id')
        .eq('user_id', user.id)
        .gte('taken_at', todayStart.toISOString())
        .lt('taken_at', todayEnd.toISOString());

      if (logsError) throw logsError;

      const totalTaken = logs?.length || 0;
      const percentage = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;

      setMedicationAdherence({
        taken: totalTaken,
        total: totalScheduled,
        percentage
      });
    } catch (error) {
      console.error('Error fetching medication adherence:', error);
      // Set default values on error
      setMedicationAdherence({ taken: 0, total: 0, percentage: 0 });
    }
  }, [user?.id]);

  // Function to fetch sleep data from health_metrics table
  const fetchSleepData = useCallback(async () => {
    if (!user?.id) return;

    try {
      console.log('Fetching sleep data for user:', user.id);
      
      // Get the most recent sleep data from health_metrics table
      const { data: sleepMetrics, error } = await supabase
        .from('health_metrics')
        .select(`
          value,
          recorded_at,
          health_metric_categories!inner(name)
        `)
        .eq('patient_id', user.id)
        .eq('health_metric_categories.name', 'Sleep Duration')
        .order('recorded_at', { ascending: false })
        .limit(1);

      console.log('Sleep metrics query result:', { data: sleepMetrics, error });

      if (error) {
        console.error('Error fetching sleep metrics:', error);
        // Use default values on error
        setSleepData({
          hours: 7.5,
          quality: 'Good',
          qualityScore: 3
        });
        return;
      }

      if (sleepMetrics && sleepMetrics.length > 0) {
        const sleepData = sleepMetrics[0];
        const hours = parseFloat(sleepData.value);
        
        console.log('Processing sleep data:', { hours, rawValue: sleepData.value });
        
        // Calculate quality based on sleep duration
        let quality: SleepData['quality'] = 'Poor';
        let qualityScore = 1;
        
        if (hours >= 8) {
          quality = 'Great';
          qualityScore = 4;
        } else if (hours >= 7) {
          quality = 'Good';
          qualityScore = 3;
        } else if (hours >= 5) {
          quality = 'Fair';
          qualityScore = 2;
        } else {
          quality = 'Poor';
          qualityScore = 1;
        }

        console.log('Setting sleep data:', { hours, quality, qualityScore });

        setSleepData({
          hours,
          quality,
          qualityScore
        });
      } else {
        // Use default sleep data if no logs found
        console.log('No sleep data found, using default values');
        setSleepData({
          hours: 7.5,
          quality: 'Good',
          qualityScore: 3
        });
      }
    } catch (error) {
      console.error('Error fetching sleep data:', error);
      // Use default values on error
      setSleepData({
        hours: 7.5,
        quality: 'Good',
        qualityScore: 3
      });
    }
  }, [user?.id]);

  // Function to fetch next appointment
  const fetchNextAppointment = useCallback(async () => {
    if (!user?.id) return;

    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      const { data: appointments, error } = await supabase
        .from('doctor_appointments')
        .select('appointment_date, doctor_name, notes')
        .eq('patient_id', user.id)
        .gte('appointment_date', todayStr)
        .order('appointment_date', { ascending: true })
        .limit(1);

      if (error) throw error;

      if (appointments && appointments.length > 0) {
        const appointment = appointments[0];
        const appointmentDate = new Date(appointment.appointment_date);
        const todayDate = new Date(todayStr);
        const diffTime = appointmentDate.getTime() - todayDate.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        setNextAppointment({
          daysUntil: Math.max(0, daysUntil),
          appointmentDate: appointment.appointment_date,
          doctorName: appointment.doctor_name
        });
      } else {
        setNextAppointment({
          daysUntil: 0,
          appointmentDate: null,
          doctorName: undefined
        });
      }
    } catch (error) {
      console.error('Error fetching next appointment:', error);
      setNextAppointment({ daysUntil: 0, appointmentDate: null, doctorName: undefined });
    }
  }, [user?.id]);

  // Function to fetch all health data
  const fetchHealthData = useCallback(async () => {
    await Promise.all([
      fetchMedicationAdherence(),
      fetchSleepData(),
      fetchNextAppointment()
    ]);
  }, [fetchMedicationAdherence, fetchSleepData, fetchNextAppointment]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user && loadRelationships) {
      await loadRelationships(user);
    }
    await fetchHealthData();
    setRefreshing(false);
  }, [user, loadRelationships, fetchHealthData]);

  console.log('HomeScreen render:', {
    loading: authLoading,
    user: user,
    hasPatients: patients.length,
    hasCaregivers: caregivers.length
  });

  // Early return for caregivers to prevent unnecessary processing
  if (user && (user.user_type === 'caregiver' || (user as any).role === 'caregiver')) {
    return <CaregiverDashboard />;
  }

  useEffect(() => {
    if (user && loadRelationships) {
      loadRelationships(user);
    }
  }, [user, loadRelationships]);

  useEffect(() => {
    if (user) {
      fetchHealthData();
    }
  }, [user, fetchHealthData]);

  // Trigger entrance animations
  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: ANIMATION_DURATION });
    slideAnim.value = withTiming(0, { duration: ANIMATION_DURATION });
    scaleAnim.value = withSpring(1, { damping: 10 });

    return () => {
      // Cleanup animations
      fadeAnim.value = 0;
      slideAnim.value = 50;
      scaleAnim.value = 0.9;
    };
  }, []);

  const profileAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [
      { translateY: slideAnim.value },
      { scale: scaleAnim.value }
    ]
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ translateY: slideAnim.value }]
  }));

  const relationshipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ translateY: slideAnim.value }]
  }));

  const getInitials = (fullName?: string | null, firstName?: string | null, lastName?: string | null, email?: string | null): string => {
    if (fullName && !fullName.startsWith('{')) {
      const parts = fullName.split(' ');
      if (parts.length > 1 && parts[0] && parts[parts.length - 1]) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      if (parts[0]) {
        return parts[0].substring(0, 2).toUpperCase();
      }
    }
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (lastName) {
      return lastName.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  if (authLoading || !user) {
    console.log('HomeScreen showing loading state');
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Parse first_name JSON if needed
  let firstName = '';
  let lastName = '';
  try {
    if (user.first_name && typeof user.first_name === 'string' && user.first_name.startsWith('{')) {
      const parsed = JSON.parse(user.first_name);
      firstName = parsed.first_name;
      lastName = parsed.last_name;
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
  console.log('HomeScreen parsed name data:', { firstName, lastName });

  const displayName = `${firstName} ${lastName}`.trim() || 'Anonymous User';
  const userType = user.user_type || (user as any).role || 'User';
  const userTypeDisplay = `${userType.charAt(0).toUpperCase()}${userType.slice(1)}`;

  console.log('HomeScreen rendering with user:', {
    id: user.id,
    email: user.email,
    userType: user.user_type,
    name: displayName,
    rawUserType: user.user_type,
    roleProperty: (user as any).role,
    allUserProps: Object.keys(user)
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <View style={{flex: 1, backgroundColor: theme.colors.background}}>
          <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
          
          <ScrollView 
            ref={scrollViewRef}
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            {user?.role === 'caregiver' ? (
              <LinearGradient
                colors={['#16c47e', '#11998e', '#38ef7d']}
                style={styles.caregiverHeaderGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.caregiverHeaderContent}>
                  <Avatar.Text
                    size={80}
                    label={getInitials(user.first_name, user.last_name)}
                    style={styles.caregiverAvatar}
                    labelStyle={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}
                  />
                  <Text style={styles.caregiverWelcome}>
                    Welcome back,
                  </Text>
                  <Text style={styles.caregiverName}>
                    {user.first_name} {user.last_name}
                  </Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.headerContainer}>
                <View style={styles.headerContent}>
                  <View style={styles.userInfo}>
                    <Avatar.Text size={50} label={getInitials(null, firstName, lastName, user.email)} style={styles.avatar} />
                    <View style={styles.welcomeContainer}>
                      <Text variant="titleMedium" style={[styles.welcomeText, { color: theme.colors.textDimmed }]}>Welcome back,</Text>
                      <Text variant="headlineSmall" style={[styles.userName, { color: theme.colors.onBackground }]}>{displayName}</Text>
                    </View>
                  </View>
                  <IconButton icon="bell-outline" size={24} onPress={() => {}} iconColor={theme.colors.onSurfaceVariant} />
                </View>
              </View>
            )}

            <View style={styles.dailyActionsContainer}>
              <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Daily Actions</Text>
              <View style={styles.dailyActionsGrid}>
                <DailyActionCard 
                  label="Medications" 
                  imageSource={require('../assets/images/medications.png')} 
                  onPress={() => navigation.navigate('Medications' as any)} 
                  delay={0} 
                />
                <DailyActionCard 
                  label="Exercise" 
                  imageSource={require('../assets/images/exercise.png')} 
                  onPress={() => navigation.navigate('Exercise' as any)} 
                  delay={100} 
                />
              </View>
              <View style={styles.dailyActionsGrid}>
                <DailyActionCard 
                  label="Doctor Appointments" 
                  imageSource={require('../assets/images/appointments.png')} 
                  onPress={() => navigation.navigate('DoctorAppointments')} 
                  delay={200} 
                />
                <DailyActionCard 
                  label="Symptom Tracker" 
                  imageSource={require('../assets/images/symptoms.png')} 
                  onPress={() => navigation.navigate('Assessment')} 
                  delay={300} 
                />
              </View>
            </View>

            <View style={styles.healthStatusContainer}>
              <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Health Overview</Text>
              <View style={styles.healthStatusGrid}>
                <MedicationAdherenceCard adherence={medicationAdherence} />
                <SleepQualityCard sleepData={sleepData} />
                <NextAppointmentCard appointmentData={nextAppointment} />
              </View>
            </View>

            {userType === 'patient' && (
              <Animated.View style={[styles.relationshipCardContainer, profileAnimatedStyle]}>
                <NeumorphicCard 
                  cardBackgroundColor={theme.colors.surface}
                  shadowColor={theme.colors.outlineVariant}
                  shadowDistance={6}
                >
                  <Card.Title 
                    title="My Caregivers"
                    titleStyle={styles.cardTitle}
                    left={(props) => (
                      <MaterialCommunityIcons 
                        name="account-heart-outline" 
                        size={24} 
                        color={theme.colors.primary} 
                      />
                    )}
                  />
                  <Divider style={styles.divider} />
                  <Card.Content>
                    {caregivers.length > 0 ? (
                      <Text style={styles.connectedCaregiverText}>
                        Connected to caregiver{caregivers.length > 1 ? 's' : ''}: {caregivers.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim()).join(', ')}
                      </Text>
                    ) : (
                      <Text style={styles.emptyListText}>No caregivers linked yet.</Text>
                    )}
                  </Card.Content>
                </NeumorphicCard>
              </Animated.View>
            )}
          </ScrollView>
        </View>
      </BottomSheetModalProvider>
      
      {/* AI Health Assistant Chat Interface */}
      <ChatInterface 
        visible={showChatInterface}
        onClose={() => setShowChatInterface(false)}
      />
        
      {/* Floating Chat Bot */}
      <FloatingChatBot onChatPress={() => setShowChatInterface(true)} />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  header: { 
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, 
    paddingHorizontal: 20, 
    paddingBottom: 20 
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 12,
  },
  welcomeContainer: {
    justifyContent: 'center',
  },
  welcomeText: {
    opacity: 0.7,
  },
  userName: {
    fontWeight: 'bold',
  },
  dailyActionsContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  dailyActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  healthStatusContainer: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  healthStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -8,
  },
  healthStatusCardOuter: {
    width: (width - 64) / 3,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  healthStatusCardInner: {
    flex: 1,
  },
  healthStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  healthStatusTitle: {
    opacity: 0.7,
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 100,
  },
  healthStatusValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 8,
    minHeight: 40,
  },
  valueText: {
    fontWeight: 'bold',
  },
  unitText: {
    opacity: 0.7,
  },
  trendIcon: {
    marginLeft: 8,
  },
  relationshipCardContainer: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
  },
  relationshipCard: {
    borderRadius: 16,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    paddingLeft: 16,
    paddingTop: 16,
  },
  relationshipAvatar: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  listItemTitle: {
    fontSize: 16,
  },
  listItemDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  divider: {
    marginHorizontal: 16,
    height: 1,
    marginBottom: 8,
  },
  emptyListText: {
    padding: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    opacity: 0.7,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItemContainer: {
    marginBottom: 8,
  },
  quickActionCard: {
    flex: 1,
    padding: 16,
  },
  quickActionIconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionTextContainer: {
    alignItems: 'center',
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  quickActionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  testSection: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  connectedCaregiverText: {
    padding: 16,
    textAlign: 'center',
    fontWeight: '600',
    color: '#10b981',
  },
  caregiverHeaderGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, 
    paddingHorizontal: 20, 
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverHeaderContent: {
    alignItems: 'center',
  },
  caregiverAvatar: {
    backgroundColor: 'transparent',
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
  },
  caregiverWelcome: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
  },
  caregiverName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 5,
  },
  headerContainer: {
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, 
    paddingHorizontal: 20, 
    paddingBottom: 20,
  },
  caregiverPatientsCard: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    borderRadius: 16,
  },
});

export default HomeScreen; 



