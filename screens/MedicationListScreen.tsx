import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Alert, 
  Dimensions, 
  TouchableOpacity, 
  RefreshControl,
  ScrollView,
  StatusBar,
  Platform
} from 'react-native';
import { 
  Text, 
  ActivityIndicator, 
  useTheme, 
  FAB,
  Card,
  Portal,
  Dialog,
  Button,
  Paragraph
} from 'react-native-paper';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Animated, { 
  FadeInDown,
  Layout,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { MedicationStackParamList } from '../navigation/MedicationStackNavigator';

type MedicationListNavigationProp = StackNavigationProp<MedicationStackParamList, 'MedicationList'>;

interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions?: string;
  start_date?: string;
  end_date?: string;
  schedules_count?: number;
  category?: string;
  frequency?: string;
  schedule_times?: string[];
}

const { width } = Dimensions.get('window');

// Enhanced MedicationCard component with simpler design
const MedicationCard = React.memo(({ 
  item, 
  index, 
  onEdit,
  onDelete
}: { 
  item: Medication; 
  index: number;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) => {
  const theme = useTheme();

  const getScheduleText = () => {
    if (item.schedule_times && item.schedule_times.length > 0) {
      if (item.schedule_times.length === 1) {
        return `Daily at ${item.schedule_times[0]}`;
      } else {
        return `${item.schedule_times.length} times daily`;
      }
    }
    return item.frequency || 'As needed';
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(item.id, item.name);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).springify()}
      layout={Layout.springify()}
    >
      <Card style={styles.medicationCard} elevation={3}>
        <TouchableOpacity
          onPress={() => onEdit(item.id)}
          onLongPress={handleLongPress}
          style={styles.cardTouchable}
          activeOpacity={0.7}
        >
          <View style={styles.cardContent}>
            {/* Main medication info */}
            <View style={styles.mainInfo}>
              <View style={styles.pillIcon}>
                <MaterialCommunityIcons name="pill" size={24} color="#667eea" />
              </View>
              <View style={styles.medicationDetails}>
                <Text variant="headlineSmall" style={styles.medicationName}>
                  {item.name}
                </Text>
                <Text variant="bodyLarge" style={styles.dosage}>
                  {item.dosage}
                </Text>
                <View style={styles.scheduleRow}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#6b7280" />
                  <Text variant="bodyMedium" style={styles.scheduleText}>
                    {getScheduleText()}
                  </Text>
                </View>
              </View>
              <View style={styles.editIcon}>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#6b7280" />
              </View>
            </View>

            {/* Instructions if available */}
            {item.instructions && (
              <View style={styles.instructionsContainer}>
                <Text variant="bodySmall" style={styles.instructions} numberOfLines={2}>
                  "{item.instructions}"
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Card>
    </Animated.View>
  );
});

const MedicationListScreen = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation<MedicationListNavigationProp>();
  const isFocused = useIsFocused();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [medicationToDelete, setMedicationToDelete] = useState<{id: string, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMedications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedications(data || []);
    } catch (error: any) {
      console.error('Error fetching medications:', error);
      Alert.alert('Error', 'Failed to load medications. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchMedications();
    setIsRefreshing(false);
  }, [fetchMedications]);

  useFocusEffect(
    useCallback(() => {
      fetchMedications();
    }, [fetchMedications])
  );

  const handleEdit = (medicationId: string) => {
    navigation.navigate('MedicationForm', { medicationId });
  };

  const handleAddMedication = () => {
    navigation.navigate('MedicationForm', {});
  };

  const showDeleteDialog = (medicationId: string, medicationName: string) => {
    setMedicationToDelete({ id: medicationId, name: medicationName });
    setDeleteDialogVisible(true);
  };

  const hideDeleteDialog = () => {
    setDeleteDialogVisible(false);
    setMedicationToDelete(null);
  };

  const handleDeleteMedication = async () => {
    if (!medicationToDelete) return;
    
    setIsDeleting(true);
    try {
      // First delete related records
      await supabase
        .from('medication_schedules')
        .delete()
        .eq('medication_id', medicationToDelete.id);

      await supabase
        .from('medication_administration_logs')
        .delete()
        .eq('medication_id', medicationToDelete.id);

      // Then delete the medication
      const { error } = await supabase
        .from('medications')
        .delete()
        .eq('id', medicationToDelete.id);

      if (error) throw error;

      // Update local state
      setMedications(prev => prev.filter(med => med.id !== medicationToDelete.id));
      hideDeleteDialog();
      
      // Show success message
      Alert.alert('Success', `${medicationToDelete.name} has been deleted successfully.`);
    } catch (error: any) {
      console.error('Error deleting medication:', error);
      Alert.alert('Error', 'Failed to delete medication. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <MaterialCommunityIcons name="pill" size={64} color="#e5e7eb" />
      </View>
      <Text variant="headlineSmall" style={styles.emptyTitle}>
        No medications yet
      </Text>
      <Text variant="bodyMedium" style={styles.emptySubtitle}>
        Add your first medication to get started with tracking your daily doses
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Text variant="bodyLarge" style={styles.medicationCount}>
        {medications.length} {medications.length === 1 ? 'Medication' : 'Medications'}
      </Text>
      <Text variant="bodySmall" style={styles.helpText}>
        Tap to edit • Long press to delete
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <BlurView intensity={20} style={styles.headerBlur}>
            <View style={styles.headerContent}>
              <View style={styles.headerTitleContainer}>
                <MaterialCommunityIcons name="pill" size={28} color="white" />
                <Text variant="headlineMedium" style={styles.headerTitle}>
                  My Medications
                </Text>
              </View>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                Keep track of your daily medications
              </Text>
            </View>
          </BlurView>
        </LinearGradient>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {!isLoading && medications.length > 0 && renderHeader()}
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" animating={true} />
              <Text variant="bodyMedium" style={styles.loadingText}>
                Loading your medications...
              </Text>
            </View>
          ) : medications.length === 0 ? (
            renderEmptyState()
          ) : (
            medications.map((medication, index) => (
              <MedicationCard
                key={medication.id}
                item={medication}
                index={index}
                onEdit={handleEdit}
                onDelete={showDeleteDialog}
              />
            ))
          )}
        </ScrollView>

        {/* Floating Action Button */}
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={handleAddMedication}
          visible={isFocused}
          label="Add Medication"
        />

        {/* Delete Confirmation Dialog */}
        <Portal>
          <Dialog visible={deleteDialogVisible} onDismiss={hideDeleteDialog}>
            <Dialog.Title>Delete Medication</Dialog.Title>
            <Dialog.Content>
              <Paragraph>
                Are you sure you want to delete "{medicationToDelete?.name}"? This action cannot be undone.
              </Paragraph>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={hideDeleteDialog} disabled={isDeleting}>
                Cancel
              </Button>
              <Button 
                onPress={handleDeleteMedication} 
                loading={isDeleting}
                disabled={isDeleting}
                textColor="#ef4444"
              >
                Delete
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerContainer: {
    zIndex: 1,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight ? StatusBar.currentHeight + 20 : 40,
    paddingBottom: 24,
  },
  headerBlur: {
    paddingHorizontal: 24,
    paddingVertical: 24,
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
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingTop: 24,
  },
  headerSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  medicationCount: {
    color: '#374151',
    fontWeight: '600',
    marginBottom: 4,
  },
  helpText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  medicationCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: 20,
  },
  cardContent: {
    gap: 12,
  },
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pillIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationDetails: {
    flex: 1,
    gap: 4,
  },
  medicationName: {
    fontWeight: '700',
    color: '#1f2937',
  },
  dosage: {
    color: '#667eea',
    fontWeight: '600',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  scheduleText: {
    color: '#6b7280',
    fontSize: 14,
  },
  editIcon: {
    padding: 4,
  },
  instructionsContainer: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  instructions: {
    color: '#6b7280',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    marginBottom: 12,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    color: '#6b7280',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    elevation: 8,
    backgroundColor: '#8b9bff', // Lighter, softer blue that matches the gradient
  },
});

export default MedicationListScreen;
