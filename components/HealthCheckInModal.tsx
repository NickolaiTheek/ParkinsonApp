import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  useTheme,
  Surface,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Question {
  id: string;
  text: string;
  type: 'emoji' | 'scale' | 'boolean' | 'stars' | 'number';
  options: string[];
}

interface HealthCheckInModalProps {
  visible: boolean;
  onClose: () => void;
}

const HealthCheckInModal: React.FC<HealthCheckInModalProps> = ({ visible, onClose }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Daily questions that rotate
  const dailyQuestions: Question[] = [
    {
      id: 'feeling_today',
      text: 'How are you feeling today?',
      type: 'emoji',
      options: ['😊', '😐', '😟'],
    },
    {
      id: 'tremor_level',
      text: 'How is your tremor/shaking?',
      type: 'scale',
      options: ['🟢 Mild', '🟡 Moderate', '🔴 Severe'],
    },
    {
      id: 'morning_medication',
      text: 'Did you take your morning medication?',
      type: 'boolean',
      options: ['✅ Yes', '❌ No'],
    },
    {
      id: 'sleep_quality',
      text: 'How was your sleep last night?',
      type: 'stars',
      options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'],
    },
    {
      id: 'muscle_stiffness',
      text: 'Any stiffness in your muscles?',
      type: 'scale',
      options: ['None', 'Mild', 'Moderate', 'Severe'],
    },
    {
      id: 'balance_today',
      text: 'How is your balance today?',
      type: 'scale',
      options: ['Good', 'Fair', 'Poor'],
    },
    {
      id: 'energy_level',
      text: 'Energy level right now?',
      type: 'stars',
      options: ['🔋', '🔋🔋', '🔋🔋🔋', '🔋🔋🔋🔋', '🔋🔋🔋🔋🔋'],
    },
  ];

  // Weekly questions (shown on Sundays or less frequently)
  const weeklyQuestions: Question[] = [
    {
      id: 'week_overall',
      text: 'How was your week overall?',
      type: 'emoji',
      options: ['😊 Great', '😐 Okay', '😟 Difficult'],
    },
    {
      id: 'new_symptoms',
      text: 'Any new symptoms to report?',
      type: 'boolean',
      options: ['✅ Yes', '❌ No'],
    },
    {
      id: 'exercise_days',
      text: 'Exercise this week?',
      type: 'number',
      options: ['0 days', '1-2 days', '3-4 days', '5+ days'],
    },
  ];

  // Get random 2-3 questions for today
  const [todaysQuestions, setTodaysQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (visible) {
      // Determine if we should include weekly questions (e.g., on Sundays)
      const today = new Date();
      const isWeeklyCheckIn = today.getDay() === 0; // Sunday = 0
      
      let selectedQuestions: Question[] = [];
      
      if (isWeeklyCheckIn) {
        // On weekly check-in, mix daily and weekly questions
        const shuffledDaily = [...dailyQuestions].sort(() => 0.5 - Math.random());
        const shuffledWeekly = [...weeklyQuestions].sort(() => 0.5 - Math.random());
        
        // Take 2 daily + 1 weekly question
        selectedQuestions = [
          ...shuffledDaily.slice(0, 2),
          ...shuffledWeekly.slice(0, 1),
        ];
      } else {
        // Regular daily check-in: 3 random daily questions
        const shuffled = [...dailyQuestions].sort(() => 0.5 - Math.random());
        selectedQuestions = shuffled.slice(0, 3);
      }
      
      setTodaysQuestions(selectedQuestions);
      setCurrentQuestionIndex(0);
      setResponses({});
    }
  }, [visible]);

  const currentQuestion = todaysQuestions[currentQuestionIndex];

  const handleResponse = (value: string) => {
    if (!currentQuestion) return;

    const newResponses = {
      ...responses,
      [currentQuestion.id]: value,
    };
    setResponses(newResponses);

    // Move to next question or finish
    if (currentQuestionIndex < todaysQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      submitResponses(newResponses);
    }
  };

  const submitResponses = async (finalResponses: { [key: string]: string }) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Store each response as a health check-in entry
      for (const [questionId, response] of Object.entries(finalResponses)) {
        await supabase
          .from('health_checkins')
          .insert({
            user_id: user.id,
            question_id: questionId,
            response: response,
            checkin_date: new Date().toISOString().split('T')[0], // Today's date
            created_at: new Date().toISOString(),
          });
      }

      onClose();
    } catch (error) {
      console.error('Error saving health check-in:', error);
      // Continue anyway, don't block user
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderResponseOptions = () => {
    if (!currentQuestion) return null;

    return currentQuestion.options.map((option, index) => (
      <TouchableOpacity
        key={index}
        style={[
          styles.responseButton,
          { borderColor: theme.colors.primary }
        ]}
        onPress={() => handleResponse(option)}
        disabled={isSubmitting}
      >
        <Text style={[styles.responseText, { fontSize: currentQuestion.type === 'emoji' ? 24 : 16 }]}>
          {option}
        </Text>
      </TouchableOpacity>
    ));
  };

  const getProgressText = () => {
    return `${currentQuestionIndex + 1} of ${todaysQuestions.length}`;
  };

  if (!visible) return null;

  if (!currentQuestion) {
    // Show loading state while questions are being set up
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <MaterialCommunityIcons 
                      name="heart-pulse" 
                      size={24} 
                      color={theme.colors.primary} 
                    />
                    <Text style={styles.headerTitle}>Daily Check-in</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <MaterialCommunityIcons name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                <Divider style={styles.divider} />
                <View style={styles.questionContainer}>
                  <Text style={styles.questionText}>Setting up your questions...</Text>
                </View>
              </Card.Content>
            </Card>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Card style={styles.card}>
            <Card.Content>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <MaterialCommunityIcons 
                    name="heart-pulse" 
                    size={24} 
                    color={theme.colors.primary} 
                  />
                  <Text style={styles.headerTitle}>Daily Check-in</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <MaterialCommunityIcons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <Divider style={styles.divider} />

              {/* Progress */}
              <Text style={styles.progressText}>{getProgressText()}</Text>

              {/* Question */}
              <View style={styles.questionContainer}>
                <Text style={styles.questionText}>{currentQuestion.text}</Text>
              </View>

              {/* Response Options */}
              <View style={styles.responseContainer}>
                {renderResponseOptions()}
              </View>

              {/* Loading indicator */}
              {isSubmitting && (
                <View style={styles.submittingContainer}>
                  <Text style={styles.submittingText}>Saving your responses...</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    borderRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  closeButton: {
    padding: 5,
  },
  divider: {
    marginBottom: 15,
  },
  progressText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginBottom: 20,
  },
  questionContainer: {
    marginBottom: 25,
    alignItems: 'center',
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  responseContainer: {
    gap: 12,
  },
  responseButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  responseText: {
    fontWeight: '500',
  },
  submittingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  submittingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default HealthCheckInModal; 