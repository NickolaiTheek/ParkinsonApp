import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import {
  Text,
  Button,
  TextInput,
  Card,
  Title,
  useTheme,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import { useAuth } from '../../context/AuthContext.tsx';
import { supabase } from '../../lib/supabase';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainBottomTabParamList } from '../navigation/MainBottomTabNavigator';

// Define a type for our health categories, based on the table structure
interface HealthCategory {
  id: string;
  name: string;
  unit: string | null;
  icon?: string; // Keep for potential future use if we map all categories
}

// Define the specific metric types we will handle directly
type MetricType = 'blood_pressure' | 'sugar' | 'weight' | 'sleep';

interface MetricTypeOption {
  key: MetricType;
  label: string;
  icon: string;
  // Define which category names from DB correspond to this type
  dbCategoryNames: string[]; 
  // Store fetched category IDs
  categoryIds?: { [key: string]: string }; // e.g., { systolic: 'uuid', diastolic: 'uuid' } or { default: 'uuid' }
  unit?: string; // Store the unit for display
}

type HealthMetricsScreenNavigationProp = BottomTabNavigationProp<
  MainBottomTabParamList,
  'HealthMetrics' // Ensure this matches the name in your navigator
>;

type Props = {
  navigation: HealthMetricsScreenNavigationProp;
};

// Define the fetchCategories function
const fetchCategories = async (): Promise<HealthCategory[]> => {
  const { data, error } = await supabase
    .from('health_metric_categories')
    .select('id, name, unit');

  if (error) {
    console.error('Error fetching health_metric_categories:', error);
    throw new Error(error.message || 'Failed to fetch health categories from database.');
  }
  return data || [];
};

const HealthMetricsScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useTheme();
  const { user } = useAuth();

  const [metricTypeOptions, setMetricTypeOptions] = useState<MetricTypeOption[]>([
    { key: 'blood_pressure', label: 'Blood Pressure', icon: 'heart-pulse', dbCategoryNames: ['Blood Pressure Systolic', 'Blood Pressure Diastolic'] },
    { key: 'sugar', label: 'Sugar', icon: 'water', dbCategoryNames: ['Blood Sugar', 'Glucose', 'Sugar'] }, // Add all relevant DB names
    { key: 'weight', label: 'Weight', icon: 'weight-kilogram', dbCategoryNames: ['Weight'] },
    { key: 'sleep', label: 'Sleep', icon: 'sleep', dbCategoryNames: ['Sleep Duration', 'Sleep'] }, // Add all relevant DB names
  ]);
  const [selectedMetricType, setSelectedMetricType] = useState<MetricType>('blood_pressure');
  const [categoriesLoading, setCategoriesLoading] = useState<boolean>(true);

  // Input states
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [value, setValue] = useState(''); // For sugar, weight, sleep
  const [notes, setNotes] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Fetch and map category IDs on mount
  useEffect(() => {
    const initScreen = async () => {
      setCategoriesLoading(true);
      try {
        const fetchedCategories = await fetchCategories();
        if (fetchedCategories) {
          const updatedOptions = metricTypeOptions.map(opt => {
            let catIds: MetricCategoryIds = {};
            if (opt.key === 'blood_pressure') {
              const systolicCat = fetchedCategories.find(cat => cat.name.toLowerCase().includes('systolic'));
              const diastolicCat = fetchedCategories.find(cat => cat.name.toLowerCase().includes('diastolic'));
              if (systolicCat) catIds.systolic = systolicCat.id;
              if (diastolicCat) catIds.diastolic = diastolicCat.id;
            } else if (opt.key === 'sugar') {
              // Explicitly find "Blood Glucose" by its exact name (case-insensitive)
              const sugarCat = fetchedCategories.find(cat => cat.name.toLowerCase() === 'blood glucose');
              if (sugarCat) {
                catIds.default = sugarCat.id;
              } else {
                // Fallback if "Blood Glucose" isn't found for some reason (should not happen based on DB)
                const genericSugarCat = fetchedCategories.find(cat => 
                  cat.name.toLowerCase().includes('sugar') || cat.name.toLowerCase().includes('glucose')
                );
                if (genericSugarCat) catIds.default = genericSugarCat.id;
              }
            } else {
              // Original logic for other types like weight, sleep
              const matchedCat = fetchedCategories.find(cat => cat.name.toLowerCase().includes(opt.key.replace('_', ' ')));
              if (matchedCat) catIds.default = matchedCat.id;
            }
            return { ...opt, categoryIds: catIds };
          });
          setMetricTypeOptions(updatedOptions);

          // Pre-select the first available type
          const firstAvailable = metricTypeOptions.find(opt => 
            opt.categoryIds && (opt.key === 'blood_pressure' ? (opt.categoryIds.systolic && opt.categoryIds.diastolic) : opt.categoryIds.default)
          );
          if (firstAvailable) {
            setSelectedMetricType(firstAvailable.key);
          }

        }
      } catch (err: any) {
        console.error('Error fetching health categories:', err.message || 'Failed to load initial data.');
        Alert.alert('Error', err.message || 'Failed to load initial data.');
      } finally {
        setCategoriesLoading(false);
      }
    };

    initScreen();
  }, []);

  const handleTypeSelect = (type: MetricType) => {
    setSelectedMetricType(type);
    // Reset input fields when type changes
    setSystolic('');
    setDiastolic('');
    setValue('');
    setNotes('');
  };

  const renderMetricInputs = () => {
    const currentOption = metricTypeOptions.find(opt => opt.key === selectedMetricType);
    if (!currentOption) return null;

    switch (selectedMetricType) {
      case 'blood_pressure':
        return (
          <>
            <TextInput
              label={`Systolic (${currentOption.unit || 'mmHg'})`}
              value={systolic}
              onChangeText={setSystolic}
              keyboardType="number-pad"
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label={`Diastolic (${currentOption.unit || 'mmHg'})`}
              value={diastolic}
              onChangeText={setDiastolic}
              keyboardType="number-pad"
              mode="outlined"
              style={styles.input}
            />
          </>
        );
      case 'sugar':
      case 'weight':
      case 'sleep':
        return (
          <TextInput
            label={`${currentOption.label} (${currentOption.unit || 'value'})`}
            value={value}
            onChangeText={setValue}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
        );
      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save metrics.');
      return;
    }
    setSubmitLoading(true);

    const currentOption = metricTypeOptions.find(opt => opt.key === selectedMetricType);
    if (!currentOption || !currentOption.categoryIds) {
      Alert.alert('Error', 'Category not configured. Please wait or try again.');
      setSubmitLoading(false);
      return;
    }

    const metricsToInsert: any[] = [];
    const recorded_at = new Date().toISOString();

    if (selectedMetricType === 'blood_pressure') {
      if (!systolic || !diastolic) {
        Alert.alert('Error', 'Please enter both systolic and diastolic values.');
        setSubmitLoading(false);
        return;
      }
      const systolicValue = parseFloat(systolic);
      const diastolicValue = parseFloat(diastolic);
      if (isNaN(systolicValue) || isNaN(diastolicValue)) {
        Alert.alert('Error', 'Invalid blood pressure values.');
        setSubmitLoading(false);
        return;
      }
      if (currentOption.categoryIds.systolic) {
        metricsToInsert.push({
          patient_id: user.id,
          category_id: currentOption.categoryIds.systolic,
          value: systolicValue,
          notes: notes || null,
          recorded_at: recorded_at,
        });
      }
      if (currentOption.categoryIds.diastolic) {
        metricsToInsert.push({
          patient_id: user.id,
          category_id: currentOption.categoryIds.diastolic,
          value: diastolicValue,
          notes: notes || null, // Could also choose to only add notes to one, or a summary note
          recorded_at: recorded_at,
        });
      }
      if (metricsToInsert.length < 2 && (currentOption.categoryIds.systolic || currentOption.categoryIds.diastolic)) {
        // This means one of the BP category IDs was missing, which is an issue
        Alert.alert('Configuration Error', 'Blood pressure categories not fully configured.');
        setSubmitLoading(false);
        return;
      }
    } else {
      if (!value) {
        Alert.alert('Error', `Please enter a value for ${currentOption.label}.`);
        setSubmitLoading(false);
        return;
      }
      const numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        Alert.alert('Error', `Invalid value for ${currentOption.label}.`);
        setSubmitLoading(false);
        return;
      }
      if (currentOption.categoryIds.default) {
        metricsToInsert.push({
          patient_id: user.id,
          category_id: currentOption.categoryIds.default,
          value: numericValue,
          notes: notes || null,
          recorded_at: recorded_at,
        });
      } else {
        Alert.alert('Configuration Error', `${currentOption.label} category not configured.`);
        setSubmitLoading(false);
        return;
      }
    }

    if (metricsToInsert.length === 0) {
      Alert.alert('Error', 'No valid data to save.');
      setSubmitLoading(false);
      return;
    }

    const { error } = await supabase.from('health_metrics').insert(metricsToInsert);

    setSubmitLoading(false);
    if (error) {
      console.error('Error saving health metric:', error);
      Alert.alert('Error', `Failed to save metric: ${error.message}`);
    } else {
      Alert.alert('Success', `${currentOption.label} metric saved successfully!`);
      // Reset fields after successful submission
      setSystolic('');
      setDiastolic('');
      setValue('');
      setNotes('');
      // Optionally navigate back or refresh data on the dashboard
      // navigation.goBack();
    }
  };

  if (categoriesLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.onBackground }}>Loading metric options...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.contentContainer}>
      <Title style={[styles.title, { color: theme.colors.onBackground }]}>Log Health Metric</Title>

      <View style={styles.metricTypeSelectorContainer}>
        {metricTypeOptions.map((opt) => {
          const isBloodPressure = opt.key === 'blood_pressure';
          const idsAvailable = opt.categoryIds && 
                                (isBloodPressure ? (opt.categoryIds.systolic && opt.categoryIds.diastolic) : opt.categoryIds.default);
          const isDisabled = !idsAvailable;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.metricTypeButton,
                selectedMetricType === opt.key 
                  ? { backgroundColor: theme.colors.primaryContainer } 
                  : { backgroundColor: theme.colors.surfaceVariant },
                isDisabled && styles.disabledMetricTypeButtonBase,
                isDisabled && { backgroundColor: theme.colors.surfaceDisabled }
              ]}
              onPress={() => handleTypeSelect(opt.key)}
              disabled={isDisabled}
            >
              <Icon source={opt.icon} size={24} color={selectedMetricType === opt.key ? theme.colors.onPrimaryContainer : (isDisabled ? theme.colors.onSurfaceDisabled : theme.colors.onSurfaceVariant)} />
              <Text style={[
                styles.metricTypeButtonText,
                { color: selectedMetricType === opt.key ? theme.colors.onPrimaryContainer : (isDisabled ? theme.colors.onSurfaceDisabled : theme.colors.onSurfaceVariant) }
              ]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          {renderMetricInputs()}
          <TextInput
            label="Notes (Optional)"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={3}
          />
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitLoading}
        disabled={submitLoading || categoriesLoading}
        style={styles.button}
        labelStyle={styles.buttonLabel}
        icon="plus-circle"
      >
        Save Metric
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
    paddingBottom: 32, // Ensure space for button
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  metricTypeSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    flexWrap: 'wrap', // Allow wrapping on smaller screens
  },
  metricTypeButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10, // Adjust as needed
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent', // Handled by background color selection
    minWidth: '45%', // Ensure two items fit comfortably with space
    marginBottom: 10, // Space between rows if they wrap
    flexDirection: 'row', // Icon and text side-by-side
    justifyContent: 'center',
  },
  disabledMetricTypeButtonBase: {
    opacity: 0.7, // Optional: further visual cue for disabled state
  },
  metricTypeButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    marginBottom: 20,
    elevation: 2,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default HealthMetricsScreen; 