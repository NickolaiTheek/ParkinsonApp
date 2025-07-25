import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Card } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import NotificationService from '../services/NotificationService';

interface MedicationAlarmButtonProps {
  medicationScheduleId: string;
  medicationName: string;
  onMedicationTaken?: () => void;
}

const MedicationAlarmButton: React.FC<MedicationAlarmButtonProps> = ({
  medicationScheduleId,
  medicationName,
  onMedicationTaken,
}) => {
  const [isMarking, setIsMarking] = useState(false);
  const [isTaken, setIsTaken] = useState(false);

  const handleMarkAsTaken = async () => {
    if (isMarking || isTaken) return;

    try {
      setIsMarking(true);
      
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Mark medication as taken in our alarm system
      await NotificationService.markMedicationTaken(medicationScheduleId);
      
      // Update UI state
      setIsTaken(true);
      
      // Success haptic
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call parent callback
      if (onMedicationTaken) {
        onMedicationTaken();
      }
      
      console.log(`Medication ${medicationName} marked as taken for schedule ${medicationScheduleId}`);
      
    } catch (error) {
      console.error('Failed to mark medication as taken:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsMarking(false);
    }
  };

  if (isTaken) {
    return (
      <Card style={[styles.card, styles.takenCard]}>
        <Card.Content style={styles.cardContent}>
          <Text style={styles.takenText}>✅ {medicationName} marked as taken</Text>
          <Text style={styles.subText}>All alarms cancelled</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <Text style={styles.medicationText}>💊 {medicationName}</Text>
        <Button
          mode="contained"
          onPress={handleMarkAsTaken}
          loading={isMarking}
          disabled={isMarking}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          {isMarking ? 'Marking...' : 'Mark as Taken'}
        </Button>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    elevation: 3,
  },
  takenCard: {
    backgroundColor: '#f0f9f4',
    borderColor: '#22c55e',
    borderWidth: 1,
  },
  cardContent: {
    padding: 16,
  },
  medicationText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1f2937',
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  takenText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 4,
  },
  subText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

export default MedicationAlarmButton; 