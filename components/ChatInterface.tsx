import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');

interface Message {
  id: string;
  type: 'bot' | 'user';
  text: string;
  timestamp: Date;
  options?: string[];
}

interface ChatInterfaceProps {
  visible: boolean;
  onClose: () => void;
}

// Large pool of 20+ health questions with Yes/No options and supportive bot replies
const HEALTH_QUESTION_POOL = [
  {
    id: 'dizzy',
    text: 'Did you feel dizzy or lose your balance today?',
    options: [
      { label: 'Yes', botReply: 'Please take your medicines and rest. If you are too tired, call your caregiver.' },
      { label: 'No', botReply: 'Great! Keep taking care of yourself.' }
    ]
  },
  {
    id: 'meds',
    text: 'Did you take your medicine today?',
    options: [
      { label: 'Yes', botReply: 'Well done! Keep it up.' },
      { label: 'No', botReply: 'Please remember to take your medicine. If you need help, let your caregiver know.' }
    ]
  },
  {
    id: 'energy',
    text: 'How is your energy level right now?',
    options: [
      { label: 'Yes', botReply: 'Glad to hear you have good energy today!' },
      { label: 'No', botReply: 'Try to rest and stay hydrated. If you feel worse, let your caregiver know.' }
    ]
  },
  {
    id: 'sleep',
    text: 'Did you sleep well last night?',
    options: [
      { label: 'Yes', botReply: 'A good night’s sleep is important. Keep it up!' },
      { label: 'No', botReply: 'Try to relax before bed tonight. If sleep problems continue, talk to your doctor.' }
    ]
  },
  {
    id: 'tremor',
    text: 'Did you experience any tremors today?',
    options: [
      { label: 'Yes', botReply: 'Try to rest and avoid stress. If it gets worse, contact your doctor.' },
      { label: 'No', botReply: 'That’s great! Keep monitoring your symptoms.' }
    ]
  },
  {
    id: 'walk',
    text: 'Did you have any trouble walking today?',
    options: [
      { label: 'Yes', botReply: 'Move slowly and use support if needed. Let your caregiver know if it continues.' },
      { label: 'No', botReply: 'Wonderful! Stay active as you can.' }
    ]
  },
  {
    id: 'meals',
    text: 'Did you remember to eat your meals on time?',
    options: [
      { label: 'Yes', botReply: 'Good job! Nutrition is important.' },
      { label: 'No', botReply: 'Try to set reminders for your meals. Eating regularly helps your health.' }
    ]
  },
  {
    id: 'stiffness',
    text: 'Have you felt any stiffness in your muscles?',
    options: [
      { label: 'Yes', botReply: 'Gentle stretching may help. If it’s severe, talk to your doctor.' },
      { label: 'No', botReply: 'Great! Keep moving and stay flexible.' }
    ]
  },
  {
    id: 'activity',
    text: 'Did you do any physical activity today?',
    options: [
      { label: 'Yes', botReply: 'Excellent! Staying active is good for you.' },
      { label: 'No', botReply: 'Try to do some gentle movement if you can.' }
    ]
  },
  {
    id: 'dizzy2',
    text: 'Did you feel dizzy or lose your balance today?',
    options: [
      { label: 'Yes', botReply: 'Please sit down and rest. If it happens again, call your caregiver.' },
      { label: 'No', botReply: 'Good! Keep being careful.' }
    ]
  },
  {
    id: 'swallow',
    text: 'Did you have any trouble speaking or swallowing?',
    options: [
      { label: 'Yes', botReply: 'Take small bites and sips. If it’s severe, contact your doctor.' },
      { label: 'No', botReply: 'That’s good! Keep monitoring.' }
    ]
  },
  {
    id: 'mood',
    text: 'Did you feel anxious or sad today?',
    options: [
      { label: 'Yes', botReply: 'It’s okay to feel that way. Talk to someone you trust or your caregiver.' },
      { label: 'No', botReply: 'Glad to hear you’re feeling well!' }
    ]
  },
  {
    id: 'memory',
    text: 'Did you have any trouble remembering things?',
    options: [
      { label: 'Yes', botReply: 'Try to write things down or use reminders. Let your caregiver know if it continues.' },
      { label: 'No', botReply: 'Great! Keep your mind active.' }
    ]
  },
  {
    id: 'pain',
    text: 'Did you experience any pain today?',
    options: [
      { label: 'Yes', botReply: 'Try to rest and note where it hurts. If it’s severe, contact your doctor.' },
      { label: 'No', botReply: 'Wonderful! Stay comfortable.' }
    ]
  },
  {
    id: 'side_effects',
    text: 'Did you have any side effects from your medication?',
    options: [
      { label: 'Yes', botReply: 'Let your doctor or caregiver know about any side effects.' },
      { label: 'No', botReply: 'Great! Keep taking your medication as prescribed.' }
    ]
  },
  {
    id: 'water',
    text: 'Did you drink enough water today?',
    options: [
      { label: 'Yes', botReply: 'Good hydration is important. Well done!' },
      { label: 'No', botReply: 'Try to drink a glass of water now.' }
    ]
  },
  {
    id: 'outdoors',
    text: 'Did you spend time outdoors today?',
    options: [
      { label: 'Yes', botReply: 'Fresh air is great for your health!' },
      { label: 'No', botReply: 'If possible, try to get some fresh air tomorrow.' }
    ]
  },
  {
    id: 'hands',
    text: 'Did you have any trouble using your hands?',
    options: [
      { label: 'Yes', botReply: 'Try gentle hand exercises. If it’s severe, let your doctor know.' },
      { label: 'No', botReply: 'Great! Keep your hands active.' }
    ]
  },
  {
    id: 'support',
    text: 'Did you feel supported by your caregivers today?',
    options: [
      { label: 'Yes', botReply: 'That’s wonderful! Support is important.' },
      { label: 'No', botReply: 'Let your caregiver know how they can help you.' }
    ]
  },
  {
    id: 'appointments',
    text: 'Do you have any doctor appointments coming up?',
    options: [
      { label: 'Yes', botReply: 'Be sure to prepare any questions for your doctor.' },
      { label: 'No', botReply: 'Okay! Keep monitoring your health.' }
    ]
  },
  {
    id: 'balance',
    text: 'How is your balance today? Any trouble?',
    options: [
      { label: 'Yes', botReply: 'Move carefully and use support if needed.' },
      { label: 'No', botReply: 'Great! Stay steady.' }
    ]
  },
];

const QUESTIONS_PER_SESSION = 4;

function getRandomQuestions(pool, n) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ visible, onClose }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  // State for daily question and answer
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]); // The random questions for this session
  const [conversation, setConversation] = useState<any[]>([]); // {type: 'question'|'answer'|'bot', text: string}
  const [lastOpenedDate, setLastOpenedDate] = useState<string | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // On open, set daily question and check if already answered
  useEffect(() => {
    if (visible) {
      // Pick random questions for this session
      const questions = getRandomQuestions(HEALTH_QUESTION_POOL, QUESTIONS_PER_SESSION);
      setSessionQuestions(questions);
      setCurrentQuestionIndex(0);
      setConversation([
        { type: 'question', text: questions[0].text, options: questions[0].options }
      ]);
      setConversationStarted(true);
      // Mark as opened for today
      const today = new Date().toISOString().split('T')[0];
      AsyncStorage.setItem('chatbot_last_opened', today);
      setLastOpenedDate(today);
    } else {
      setConversationStarted(false);
    }
  }, [visible]);

  // Handle user answer for conversational flow
  const handleUserResponse = (option) => {
    const q = sessionQuestions[currentQuestionIndex];
    // Add user's answer
    setConversation(prev => [
      ...prev,
      { type: 'answer', text: option.label }
    ]);
    // Add bot's reply after a short delay
    setTimeout(() => {
      setConversation(prev => [
        ...prev,
        { type: 'bot', text: option.botReply }
      ]);
      // Show next question after another delay, if any
      if (currentQuestionIndex < sessionQuestions.length - 1) {
        setTimeout(() => {
          setCurrentQuestionIndex(idx => {
            const nextIdx = idx + 1;
            setConversation(prev => [
              ...prev,
              { type: 'question', text: sessionQuestions[nextIdx].text, options: sessionQuestions[nextIdx].options }
            ]);
            return nextIdx;
          });
        }, 1200);
      }
    }, 700);
  };

  // Render the conversational chat in a scrollable area
  const conversationScrollRef = useRef(null);
  useEffect(() => {
    if (conversation.length > 0 && conversationScrollRef.current) {
      setTimeout(() => {
        conversationScrollRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [conversation]);

  const renderConversation = () => {
    // Find the index of the last question card
    const lastQuestionIdx = (() => {
      for (let i = conversation.length - 1; i >= 0; i--) {
        if (conversation[i].type === 'question') return i;
      }
      return -1;
    })();
    return (
      <ScrollView
        ref={conversationScrollRef}
        style={{ marginVertical: 20, maxHeight: height * 0.35 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {conversation.map((item, idx) => {
          if (item.type === 'question') {
            return (
              <Card key={idx} style={{ borderRadius: 16, marginBottom: 10 }}>
                <Card.Content>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{item.text}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {item.options.map(option => (
                      <TouchableOpacity
                        key={option.label}
                        style={{
                          backgroundColor: '#16c47e',
                          borderRadius: 20,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        onPress={() => handleUserResponse(option)}
                        disabled={idx !== lastQuestionIdx}
                      >
                        <Text style={{ color: 'white', fontWeight: '500' }}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Card.Content>
              </Card>
            );
          } else if (item.type === 'answer') {
            return (
              <View key={idx} style={{ alignItems: 'flex-end', marginBottom: 4 }}>
                <Card style={{ borderRadius: 15, backgroundColor: '#16c47e', maxWidth: '80%' }}>
                  <Card.Content>
                    <Text style={{ color: 'white', fontWeight: '500' }}>{item.text}</Text>
                  </Card.Content>
                </Card>
              </View>
            );
          } else if (item.type === 'bot') {
            return (
              <View key={idx} style={{ alignItems: 'flex-start', marginBottom: 4 }}>
                <Card style={{ borderRadius: 15, backgroundColor: '#e6f9f1', maxWidth: '80%' }}>
                  <Card.Content>
                    <Text style={{ color: '#11998e', fontWeight: '500' }}>{item.text}</Text>
                  </Card.Content>
                </Card>
              </View>
            );
          }
          return null;
        })}
        {/* End message if all questions answered */}
        {currentQuestionIndex >= sessionQuestions.length && (
          <Card style={{ borderRadius: 16, marginTop: 10 }}>
            <Card.Content>
              <Text style={{ color: '#16c47e', fontWeight: 'bold', fontSize: 18, textAlign: 'center' }}>
                Thank you for answering today’s questions!
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    );
  };

  // Quick questions for health tracking
  const QUICK_QUESTIONS = [
    { id: 'today_meds', label: "Show today's medications" },
    { id: 'next_appt', label: 'Show next appointment' },
    { id: 'missed_doses', label: 'Show missed doses' },
    { id: 'week_appts', label: "Show this week's appointments" },
    { id: 'last_checkin', label: 'Show last health check-in' },
  ];

  // Handler for quick questions
  const handleQuickQuestion = async (questionId: string) => {
    if (!user) return;
    setIsLoading(true);
    let botText = '';
    try {
      if (questionId === 'today_meds') {
        const today = new Date().toLocaleDateString('en-CA');
        const { data: meds } = await supabase
          .from('medications')
          .select('name, medication_schedules(scheduled_time, days_of_week)')
          .eq('user_id', user.id);
        if (meds && meds.length > 0) {
          botText = `Today’s medications: ` + meds.map((m: any) => m.name).join(', ');
        } else {
          botText = 'No medications scheduled for today.';
        }
      } else if (questionId === 'next_appt') {
        const today = new Date().toISOString().split('T')[0];
        const { data: appts } = await supabase
          .from('doctor_appointments')
          .select('appointment_date, doctor_name')
          .eq('patient_id', user.id)
          .gte('appointment_date', today)
          .order('appointment_date', { ascending: true })
          .limit(1);
        if (appts && appts.length > 0) {
          const appt = appts[0];
          botText = `Next appointment: ${appt.appointment_date} with Dr. ${appt.doctor_name}`;
        } else {
          botText = 'No upcoming appointments.';
        }
      } else if (questionId === 'missed_doses') {
        const today = new Date().toISOString().split('T')[0];
        const { data: logs } = await supabase
          .from('medication_administration_logs')
          .select('medication_id, taken_at')
          .eq('user_id', user.id)
          .is('taken_at', null);
        if (logs && logs.length > 0) {
          botText = `You have ${logs.length} missed doses today.`;
        } else {
          botText = 'No missed doses today!';
        }
      } else if (questionId === 'week_appts') {
        const today = new Date();
        const weekFromNow = new Date();
        weekFromNow.setDate(today.getDate() + 7);
        const { data: appts } = await supabase
          .from('doctor_appointments')
          .select('appointment_date, doctor_name')
          .eq('patient_id', user.id)
          .gte('appointment_date', today.toISOString().split('T')[0])
          .lte('appointment_date', weekFromNow.toISOString().split('T')[0])
          .order('appointment_date', { ascending: true });
        if (appts && appts.length > 0) {
          botText = 'Appointments this week: ' + appts.map((a: any) => `${a.appointment_date} with Dr. ${a.doctor_name}`).join('; ');
        } else {
          botText = 'No appointments this week.';
        }
      } else if (questionId === 'last_checkin') {
        const { data: checkins } = await supabase
          .from('health_checkins')
          .select('question_id, response, checkin_date')
          .eq('user_id', user.id)
          .order('checkin_date', { ascending: false })
          .limit(1);
        if (checkins && checkins.length > 0) {
          const c = checkins[0];
          botText = `Last check-in (${c.checkin_date}): ${c.question_id} - ${c.response}`;
        } else {
          botText = 'No health check-ins found.';
        }
      }
    } catch (err) {
      botText = 'Sorry, I could not fetch that information.';
    }
    const botMessage: Message = {
      id: Date.now().toString(),
      type: 'bot',
      text: botText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, botMessage]);
    setIsLoading(false);
  };

  // Health check-in questions
  const HEALTH_CHECKIN_QUESTIONS = [
    { id: 'feeling_today', text: 'How are you feeling today?', options: ['😊 Good', '😐 Okay', '😟 Not great'] },
    { id: 'took_medicine', text: 'Did you take your medicine?', options: ['✅ Yes', '❌ No'] },
    { id: 'tremor', text: 'How is your shivering/tremor?', options: ['🟢 Mild', '🟡 Moderate', '🔴 Severe'] },
    { id: 'sleep', text: 'How was your sleep last night?', options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'] },
    { id: 'stiffness', text: 'Any stiffness in your muscles?', options: ['None', 'Mild', 'Moderate', 'Severe'] },
    { id: 'balance', text: 'How is your balance today?', options: ['Good', 'Fair', 'Poor'] },
    { id: 'energy', text: 'Energy level right now?', options: ['🔋 High', '🔋 Medium', '🔋 Low'] },
  ];

  const [showCheckin, setShowCheckin] = useState(false);
  const [currentCheckinIndex, setCurrentCheckinIndex] = useState(0);
  const [checkinResponses, setCheckinResponses] = useState<{ [key: string]: string }>({});

  // Handler for health check-in answer
  const handleCheckinAnswer = async (questionId: string, answer: string) => {
    setIsLoading(true);
    setCheckinResponses(prev => ({ ...prev, [questionId]: answer }));
    // Save to database
    try {
      await supabase.from('health_checkins').insert({
        user_id: user?.id,
        question_id: questionId,
        response: answer,
        checkin_date: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      // ignore for now
    }
    // Show next question or finish
    if (currentCheckinIndex < HEALTH_CHECKIN_QUESTIONS.length - 1) {
      setCurrentCheckinIndex(currentCheckinIndex + 1);
    } else {
      setShowCheckin(false);
      // Show friendly thank you message
      const botMessage: Message = {
        id: Date.now().toString(),
        type: 'bot',
        text: 'Thank you for your check-in! Your responses have been saved. 😊',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setCurrentCheckinIndex(0);
      setCheckinResponses({});
    }
    setIsLoading(false);
  };

  const renderMessage = (message: Message) => (
    <View
      key={message.id}
      style={[
        styles.messageContainer,
        message.type === 'user' ? styles.userMessage : styles.botMessage,
      ]}
    >
      <Card style={[
        styles.messageCard,
        { backgroundColor: message.type === 'user' ? theme.colors.primary : theme.colors.surface }
      ]}>
        <Card.Content style={styles.messageContent}>
          <Text style={[
            styles.messageText,
            { color: message.type === 'user' ? 'white' : theme.colors.onSurface }
          ]}>
            {message.text}
          </Text>
        </Card.Content>
      </Card>
    </View>
  );

  const renderResponseOptions = (options: string[]) => (
    <View style={styles.optionsContainer}>
      {options.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.optionButton, { borderColor: theme.colors.primary }]}
          onPress={() => handleUserResponse(option)}
          disabled={isLoading}
        >
          <Text style={[styles.optionText, { color: theme.colors.primary }]}>
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Render chatbot error if present
  const renderChatbotError = () =>
    null; // Removed as per new_code

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <View style={[styles.chatContainer, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="robot-outline" size={24} color="white" />
              <Text style={styles.headerTitle}>Health Assistant</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Quick Questions */}
          {visible && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8 }}>
              {QUICK_QUESTIONS.map(q => (
                <TouchableOpacity
                  key={q.id}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 20,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                  onPress={() => handleQuickQuestion(q.id)}
                  disabled={isLoading}
                >
                  <Text style={{ color: 'white', fontWeight: '500' }}>{q.label}</Text>
                </TouchableOpacity>
              ))}
              {/* Health Check-in button */}
              <TouchableOpacity
                style={{
                  backgroundColor: theme.colors.accent,
                  borderRadius: 20,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  marginRight: 8,
                  marginBottom: 8,
                }}
                onPress={() => { setShowCheckin(true); setCurrentCheckinIndex(0); setCheckinResponses({}); }}
                disabled={isLoading}
              >
                <Text style={{ color: 'white', fontWeight: '500' }}>Start Health Check-in</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Health Check-in Questions Modal/Inline */}
          {showCheckin && (
            <View style={{ padding: 20, backgroundColor: 'white', borderRadius: 16, margin: 20, elevation: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{HEALTH_CHECKIN_QUESTIONS[currentCheckinIndex].text}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HEALTH_CHECKIN_QUESTIONS[currentCheckinIndex].options.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={{
                      backgroundColor: theme.colors.primary,
                      borderRadius: 20,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                    onPress={() => handleCheckinAnswer(HEALTH_CHECKIN_QUESTIONS[currentCheckinIndex].id, option)}
                    disabled={isLoading}
                  >
                    <Text style={{ color: 'white', fontWeight: '500' }}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Conversational Health Questions */}
          {renderConversation()}

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            showsVerticalScrollIndicator={false}
          >
            {messages.length > 0 ? renderMessage(messages[messages.length - 1]) : null}
            
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            )}
          </ScrollView>

          {/* Response Options */}
          {messages.length > 0 && !isLoading && (
            <View style={styles.inputContainer}>
              {messages[messages.length - 1].type === 'bot' && 
               messages[messages.length - 1].options &&
               renderResponseOptions(messages[messages.length - 1].options!)}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    height: height * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  closeButton: {
    padding: 5,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  messageContainer: {
    marginVertical: 5,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  botMessage: {
    alignItems: 'flex-start',
  },
  messageCard: {
    maxWidth: '80%',
    borderRadius: 15,
    elevation: 2,
  },
  messageContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    fontStyle: 'italic',
  },
  inputContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ChatInterface; 