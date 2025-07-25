import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import {
  Text,
  Card,
  Avatar,
  useTheme,
  Surface,
  ActivityIndicator,
  Chip,
  Button,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { supabase, UserProfile } from '../lib/supabase';
import * as Haptics from 'expo-haptics';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const { width: screenWidth } = Dimensions.get('window');
const AnimatedCard = Animated.createAnimatedComponent(Card);
const AnimatedSurface = Animated.createAnimatedComponent(Surface);
const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

interface HealthMetric {
  name: string;
  value: string;
  unit: string;
  recorded_at: string;
  normal_range_min?: string;
  normal_range_max?: string;
}

interface ChartData {
  date: string;
  value: number;
  label?: string;
}

interface PatientAnalytics {
  sleep_data: ChartData[];
  medication_adherence: ChartData[];
  blood_pressure: Array<{ date: string; systolic: number; diastolic: number; }>;
  blood_glucose: ChartData[];
  weight_data: ChartData[];
  symptom_data: ChartData[];
}

const CaregiverAnalyticsScreen: React.FC = () => {
  const theme = useTheme();
  const { user, patients } = useAuth();
  
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<PatientAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedMetric, setSelectedMetric] = useState<'sleep' | 'blood_pressure' | 'sugar_level' | 'weight'>('sleep');

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // Animation for refresh button
  const rotationValue = useSharedValue(0);

  const animatedRefreshStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotationValue.value}deg` }],
    };
  });

  useEffect(() => {
    if (isLoading) {
      rotationValue.value = withRepeat(withTiming(360, { duration: 1000 }), -1, false);
    } else {
      rotationValue.value = withTiming(0, { duration: 200 });
    }
  }, [isLoading]);

  useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    if (selectedPatientId) {
      fetchAnalyticsData(selectedPatientId);
    }
  }, [selectedPatientId, timeRange]);

  const fetchAnalyticsData = useCallback(async (patientId: string) => {
    setIsLoading(true);
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = subDays(new Date(), days);

      // Fetch health metrics for charts
      const { data: healthMetrics, error: metricsError } = await supabase
        .from('health_metrics')
        .select(`
          value,
          recorded_at,
          health_metric_categories!inner(
            name,
            unit,
            normal_range_min,
            normal_range_max
          )
        `)
        .eq('patient_id', patientId)
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: true });

      if (metricsError) throw metricsError;

      // Process sleep data
      const sleepData = (healthMetrics || [])
        .filter(m => m.health_metric_categories.name === 'Sleep Duration')
        .map(m => ({
          date: format(new Date(m.recorded_at), 'MMM dd'),
          value: parseFloat(m.value),
        }));

      // Process blood glucose data
      const glucoseData = (healthMetrics || [])
        .filter(m => m.health_metric_categories.name === 'Blood Glucose')
        .map(m => ({
          date: format(new Date(m.recorded_at), 'MMM dd'),
          value: parseFloat(m.value),
        }));

      // Process weight data
      const weightData = (healthMetrics || [])
        .filter(m => m.health_metric_categories.name === 'Weight')
        .map(m => ({
          date: format(new Date(m.recorded_at), 'MMM dd'),
          value: parseFloat(m.value),
        }));

      // Process blood pressure data
      const bpData: Array<{ date: string; systolic: number; diastolic: number; }> = [];
      const bpMap = new Map();
      
      (healthMetrics || []).forEach(m => {
        const date = format(new Date(m.recorded_at), 'MMM dd');
        if (!bpMap.has(date)) {
          bpMap.set(date, { date });
        }
        const entry = bpMap.get(date);
        
        if (m.health_metric_categories.name === 'Blood Pressure Systolic') {
          entry.systolic = parseFloat(m.value);
        } else if (m.health_metric_categories.name === 'Blood Pressure Diastolic') {
          entry.diastolic = parseFloat(m.value);
        }
      });

      bpData.push(...Array.from(bpMap.values()).filter(entry => entry.systolic && entry.diastolic));

      // Fetch medication adherence data
      const medicationData = await fetchMedicationAdherence(patientId, days);

      // Fetch symptom data
      const symptomData = await fetchSymptomData(patientId, days);

      setAnalytics({
        sleep_data: sleepData,
        medication_adherence: medicationData,
        blood_pressure: bpData,
        blood_glucose: glucoseData,
        weight_data: weightData,
        symptom_data: symptomData,
      });

    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  const fetchMedicationAdherence = async (patientId: string, days: number) => {
    try {
      const medicationData: ChartData[] = [];
      const startDate = subDays(new Date(), days);

      for (let i = 0; i < days; i++) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });

        // Get scheduled medications for this day
        const { data: schedules } = await supabase
          .from('medication_schedules')
          .select('id')
          .eq('user_id', patientId)
          .contains('days_of_week', [dayOfWeek]);

        const totalScheduled = schedules?.length || 0;

        // Get taken medications for this day
        const { data: logs } = await supabase
          .from('medication_administration_logs')
          .select('id')
          .eq('user_id', patientId)
          .gte('taken_at', dayStart.toISOString())
          .lte('taken_at', dayEnd.toISOString())
          .eq('status', 'taken');

        const totalTaken = logs?.length || 0;
        const adherenceRate = totalScheduled > 0 ? (totalTaken / totalScheduled) * 100 : 0;

        medicationData.unshift({
          date: format(date, 'MMM dd'),
          value: Math.round(adherenceRate),
        });
      }

      return medicationData;
    } catch (error) {
      console.error('Error fetching medication data:', error);
      return [];
    }
  };

  const fetchSymptomData = async (patientId: string, days: number) => {
    try {
      const { data: symptoms } = await supabase
        .from('symptom_logs')
        .select('severity, recorded_at')
        .eq('patient_id', patientId)
        .gte('recorded_at', subDays(new Date(), days).toISOString())
        .order('recorded_at', { ascending: true });

      return (symptoms || []).map(s => ({
        date: format(new Date(s.recorded_at), 'MMM dd'),
        value: s.severity,
      }));
    } catch (error) {
      console.error('Error fetching symptom data:', error);
      return [];
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => 
    (firstName && lastName ? `${firstName.charAt(0)}${lastName.charAt(0)}` : 'P').toUpperCase();

  if (patients.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#10b981" />
        <LinearGradient colors={['#10b981', '#059669']} style={styles.headerGradient}>
          <View style={styles.headerContent}>
            <Text variant="headlineMedium" style={styles.headerTitle}>Analytics</Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>No patients connected</Text>
          </View>
        </LinearGradient>
        
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="chart-line" size={64} color="#6b7280" />
          <Text style={styles.emptyTitle}>No Analytics Available</Text>
          <Text style={styles.emptySubtitle}>Connect with patients to view their health analytics</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#10b981" />
      
      {/* Header */}
      <LinearGradient colors={['#10b981', '#059669']} style={styles.headerGradient}>
        <View style={styles.headerContent}>
          <View>
            <Text variant="headlineMedium" style={styles.headerTitle}>Analytics</Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>
              {selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'Select Patient'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (selectedPatientId) {
                try {
                  await fetchAnalyticsData(selectedPatientId);
                  // Success feedback
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (error) {
                  console.error('Failed to refresh analytics:', error);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
              }
            }}
            style={[
              styles.refreshButton,
              { 
                opacity: isLoading ? 0.7 : 1,
                backgroundColor: 'rgba(255,255,255,0.9)' // More visible for debugging
              }
            ]}
            disabled={isLoading}
          >
            <AnimatedIcon 
              name={isLoading ? "loading" : "refresh"} 
              size={24} 
              color="#10b981" // Green color for better visibility
              style={animatedRefreshStyle}
            />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Patient Selector */}
        <AnimatedCard entering={FadeInDown.delay(100)} style={styles.selectorCard} elevation={0}>
          <Card.Content style={styles.selectorContent}>
            <Text variant="titleMedium" style={styles.selectorTitle}>Select Patient</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patientScroll}>
              {patients.map((patient, index) => (
                <TouchableOpacity
                  key={patient.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPatientId(patient.id);
                  }}
                  style={[
                    styles.patientChip,
                    {
                      backgroundColor: selectedPatientId === patient.id ? '#10b981' : '#f8fafc',
                      borderColor: selectedPatientId === patient.id ? '#10b981' : '#e5e7eb',
                    }
                  ]}
                >
                  <Avatar.Text
                    size={40}
                    label={getInitials(patient.first_name, patient.last_name)}
                    style={{
                      backgroundColor: selectedPatientId === patient.id ? 'rgba(255,255,255,0.2)' : '#10b981',
                    }}
                  />
                  <Text style={{
                    color: selectedPatientId === patient.id ? '#ffffff' : '#374151',
                    fontWeight: '600',
                    marginTop: 8,
                  }}>
                    {patient.first_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card.Content>
        </AnimatedCard>

        {selectedPatientId && (
          <>
            {/* Time Range Selector */}
            <AnimatedCard entering={FadeInDown.delay(200)} style={styles.timeRangeCard} elevation={0}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.timeRangeTitle}>Time Range</Text>
                <View style={styles.timeRangeButtons}>
                  {[
                    { key: '7d', label: '7 Days' },
                    { key: '30d', label: '30 Days' },
                    { key: '90d', label: '90 Days' },
                  ].map((range) => (
                    <TouchableOpacity
                      key={range.key}
                      onPress={() => setTimeRange(range.key as any)}
                      style={[
                        styles.timeRangeButton,
                        {
                          backgroundColor: timeRange === range.key ? '#10b981' : '#f8fafc',
                        }
                      ]}
                    >
                      <Text style={{
                        color: timeRange === range.key ? '#ffffff' : '#374151',
                        fontWeight: '600',
                      }}>
                        {range.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card.Content>
            </AnimatedCard>

            {/* Metric Selector */}
            <AnimatedCard entering={FadeInDown.delay(300)} style={styles.metricSelectorCard} elevation={0}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.metricSelectorTitle}>Health Metrics</Text>
                <View style={styles.metricButtons}>
                  {[
                    { key: 'sleep', label: 'Sleep', icon: 'sleep' },
                    { key: 'blood_pressure', label: 'Blood Pressure', icon: 'heart-pulse' },
                    { key: 'sugar_level', label: 'Sugar Level', icon: 'chart-timeline-variant' },
                    { key: 'weight', label: 'Weight', icon: 'weight' },
                  ].map((metric) => (
                    <TouchableOpacity
                      key={metric.key}
                      onPress={() => setSelectedMetric(metric.key as any)}
                      style={[
                        styles.metricButton,
                        {
                          backgroundColor: selectedMetric === metric.key ? '#10b981' : '#f8fafc',
                        }
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={metric.icon}
                        size={24}
                        color={selectedMetric === metric.key ? '#ffffff' : '#6b7280'}
                      />
                      <Text style={{
                        color: selectedMetric === metric.key ? '#ffffff' : '#374151',
                        fontWeight: '600',
                        marginTop: 4,
                      }}>
                        {metric.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card.Content>
            </AnimatedCard>

            {/* Charts Section */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={styles.loadingText}>Loading analytics...</Text>
              </View>
            ) : analytics ? (
              <ChartDisplaySection 
                analytics={analytics}
                selectedMetric={selectedMetric}
                timeRange={timeRange}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

// Chart Display Section Component
const ChartDisplaySection = ({ analytics, selectedMetric, timeRange }: {
  analytics: PatientAnalytics;
  selectedMetric: string;
  timeRange: string;
}) => {
  const getChartColor = (metric: string) => {
    switch (metric) {
      case 'sleep': return '#6366f1';
      case 'blood_pressure': return '#ef4444';
      case 'sugar_level': return '#f59e0b';
      case 'weight': return '#10b981';
      default: return '#6b7280';
    }
  };

  const renderChart = () => {
    switch (selectedMetric) {
      case 'sleep':
        return (
          <LineChart
            data={analytics.sleep_data}
            title="Sleep Duration Trend"
            color="#6366f1"
            unit="hours"
            idealRange={{ min: 7, max: 9 }}
          />
        );
      case 'blood_pressure':
        return (
          <BloodPressureChart
            bloodPressureData={analytics.blood_pressure}
          />
        );
      case 'sugar_level':
        return (
          <LineChart
            data={analytics.blood_glucose}
            title="Blood Sugar Level"
            color="#f59e0b"
            unit="mg/dL"
            idealRange={{ min: 70, max: 140 }}
          />
        );
      case 'weight':
        return (
          <LineChart
            data={analytics.weight_data}
            title="Weight Trend"
            color="#10b981"
            unit="kg"
            idealRange={{ min: 60, max: 100 }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AnimatedCard entering={FadeInDown.delay(400)} style={styles.chartCard} elevation={0}>
      <Card.Content>
        <View style={styles.chartHeader}>
          <Text variant="titleLarge" style={styles.chartTitle}>
            {selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} Analytics
          </Text>
          <Text style={styles.chartSubtitle}>Last {timeRange === '7d' ? '7' : timeRange === '30d' ? '30' : '90'} days</Text>
        </View>
        {renderChart()}
      </Card.Content>
    </AnimatedCard>
  );
};

// Line Chart Component
const LineChart = ({ data, title, color, unit, idealRange, reversed = false }: {
  data: ChartData[];
  title: string;
  color: string;
  unit: string;
  idealRange?: { min: number; max: number };
  reversed?: boolean;
}) => {
  if (data.length === 0) {
    return (
      <View style={styles.chartContainer}>
        <Text variant="titleMedium" style={styles.chartSubtitle}>{title}</Text>
        <View style={styles.noDataContainer}>
          <MaterialCommunityIcons name="chart-line" size={48} color="#d1d5db" />
          <Text style={styles.noDataText}>No data available for selected period</Text>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), idealRange?.max || 0);
  const minValue = Math.min(...data.map(d => d.value), idealRange?.min || 0);
  const range = maxValue - minValue || 1;

  return (
    <View style={styles.chartContainer}>
      <Text variant="titleMedium" style={styles.chartSubtitle}>{title}</Text>
      
      {/* Chart Legend */}
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>Current Values</Text>
        </View>
        {idealRange && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendText}>Ideal Range</Text>
          </View>
        )}
      </View>
      
      <View style={styles.lineChart}>
        {data.slice(-10).map((point, index) => {
          const height = range > 0 ? Math.max(10, ((point.value - minValue) / range) * 100) : 50;
          const isInRange = idealRange ? 
            (reversed ? point.value <= idealRange.max : point.value >= idealRange.min && point.value <= idealRange.max) : true;
          
          return (
            <View key={index} style={styles.chartPoint}>
              <View style={styles.pointContainer}>
                <Text style={styles.pointValue}>{point.value}{unit === 'hours' ? 'h' : unit}</Text>
                <View style={styles.barContainer}>
                  <View 
                    style={[
                      styles.chartBar, 
                      { 
                        height: `${height}%`,
                        backgroundColor: isInRange ? color : '#ef4444',
                      }
                    ]} 
                  />
                </View>
              </View>
              <Text style={styles.pointDate}>{point.date}</Text>
            </View>
          );
        })}
      </View>
      
      {idealRange && (
        <View style={styles.rangeIndicator}>
          <Text style={styles.idealRangeText}>
            Ideal: {idealRange.min}-{idealRange.max} {unit}
          </Text>
        </View>
      )}
    </View>
  );
};

// Blood Pressure Chart Component (Dedicated)
const BloodPressureChart = ({ bloodPressureData }: {
  bloodPressureData: Array<{ date: string; systolic: number; diastolic: number; }>;
}) => {
  if (bloodPressureData.length === 0) {
    return (
      <View style={styles.chartContainer}>
        <Text variant="titleMedium" style={styles.chartSubtitle}>Blood Pressure Trend</Text>
        <View style={styles.noDataContainer}>
          <MaterialCommunityIcons name="heart-pulse" size={48} color="#d1d5db" />
          <Text style={styles.noDataText}>No blood pressure data available for selected period</Text>
        </View>
      </View>
    );
  }

  const maxSystolic = Math.max(...bloodPressureData.map(d => d.systolic));
  const maxDiastolic = Math.max(...bloodPressureData.map(d => d.diastolic));
  const maxValue = Math.max(maxSystolic, maxDiastolic, 180);

  return (
    <View style={styles.chartContainer}>
      <Text variant="titleMedium" style={styles.chartSubtitle}>Blood Pressure Trend</Text>
      
      {/* Chart Legend */}
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>Systolic</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.legendText}>Diastolic</Text>
        </View>
      </View>
      
      <View style={styles.bpChartContainer}>
        {bloodPressureData.slice(-7).map((reading, index) => {
          const systolicHeight = (reading.systolic / maxValue) * 100;
          const diastolicHeight = (reading.diastolic / maxValue) * 100;
          const isHealthy = reading.systolic <= 120 && reading.diastolic <= 80;
          
          return (
            <View key={index} style={styles.bpBarGroup}>
              <View style={styles.bpBars}>
                <View style={styles.bpBarContainer}>
                  <View 
                    style={[
                      styles.bpBar, 
                      { 
                        height: `${systolicHeight}%`,
                        backgroundColor: isHealthy ? '#ef4444' : '#dc2626'
                      }
                    ]} 
                  />
                  <Text style={styles.bpValue}>{reading.systolic}</Text>
                </View>
                <View style={styles.bpBarContainer}>
                  <View 
                    style={[
                      styles.bpBar, 
                      { 
                        height: `${diastolicHeight}%`,
                        backgroundColor: isHealthy ? '#f59e0b' : '#d97706'
                      }
                    ]} 
                  />
                  <Text style={styles.bpValue}>{reading.diastolic}</Text>
                </View>
              </View>
              <Text style={styles.bpDate}>{reading.date}</Text>
            </View>
          );
        })}
      </View>
      
      <View style={styles.rangeIndicator}>
        <Text style={styles.idealRangeText}>
          Normal: Systolic &lt;120, Diastolic &lt;80 mmHg
        </Text>
      </View>
    </View>
  );
};

// Enhanced Vitals Chart Component (kept for compatibility)
const VitalsChart = ({ bloodPressureData, glucoseData, weightData }: {
  bloodPressureData: Array<{ date: string; systolic: number; diastolic: number; }>;
  glucoseData: ChartData[];
  weightData: ChartData[];
}) => {
  return (
    <View style={styles.vitalsContainer}>
      <Text variant="titleMedium" style={styles.chartSubtitle}>Vital Signs Analytics</Text>
      <Text style={styles.noDataText}>Please select a specific metric to view detailed charts</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerGradient: {
    paddingTop: StatusBar.currentHeight || 44,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 8,
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
  scrollContainer: {
    flex: 1,
    marginTop: -10,
  },
  
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  
  // Patient Selector
  selectorCard: {
    margin: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  selectorContent: {
    padding: 20,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  patientScroll: {
    marginHorizontal: -4,
  },
  patientChip: {
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 100,
  },
  
  // Time Range Selector
  timeRangeCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  timeRangeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  timeRangeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  timeRangeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  
  // Metric Selector
  metricSelectorCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  metricSelectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  metricButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  metricButton: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  
  // Loading
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  
  // Chart Card
  chartCard: {
    margin: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  chartHeader: {
    marginBottom: 24,
  },
  chartTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  
  // Line Chart
  chartContainer: {
    marginTop: 20,
  },
  lineChart: {
    flexDirection: 'row',
    height: 150,
    alignItems: 'flex-end',
    marginVertical: 20,
    paddingHorizontal: 10,
  },
  chartPoint: {
    flex: 1,
    alignItems: 'center',
  },
  pointContainer: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    position: 'relative',
  },
  point: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    zIndex: 2,
  },
  pointLine: {
    width: 2,
    position: 'absolute',
    bottom: 0,
    zIndex: 1,
  },
  pointValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    position: 'absolute',
    top: -20,
  },
  pointDate: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  idealRangeText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // Vitals Chart
  vitalsContainer: {
    marginTop: 20,
  },
  vitalSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  vitalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  vitalReading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  vitalDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  vitalValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  vitalChartSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  vitalChartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  bpChartContainer: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  bpBarGroup: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bpBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 4,
  },
  bpBarContainer: {
    width: 16,
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bpBar: {
    width: 14,
    borderRadius: 7,
    minHeight: 8,
  },
  systolicBar: {
    backgroundColor: '#ef4444',
  },
  diastolicBar: {
    backgroundColor: '#f59e0b',
  },
  bpValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    marginTop: 2,
    textAlign: 'center',
  },
  bpDate: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  bpLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  bpLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  glucoseChart: {
    marginBottom: 16,
  },
  glucoseBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  glucoseBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  glucoseBarFill: {
    height: '100%',
    borderRadius: 10,
  },
  glucoseValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    minWidth: 40,
  },
  glucoseDate: {
    fontSize: 12,
    color: '#6b7280',
    minWidth: 50,
    textAlign: 'right',
  },
  glucoseRange: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  weightChart: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  weightPoint: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  weightLine: {
    width: '100%',
    height: 100,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  weightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
    position: 'absolute',
    zIndex: 2,
  },
  weightBar: {
    width: 2,
    backgroundColor: '#6366f1',
    borderRadius: 1,
    minHeight: 8,
  },
  weightValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    textAlign: 'center',
  },
  weightDate: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  
  // Enhanced Chart Styles
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barContainer: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: 12,
    borderRadius: 6,
    minHeight: 8,
  },
  rangeIndicator: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    alignItems: 'center',
  },
  noDataContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  rotatingIcon: {
    transform: [{ rotate: '360deg' }],
  },
});

export default CaregiverAnalyticsScreen; 