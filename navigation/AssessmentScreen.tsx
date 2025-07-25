import React, { useState, /* useContext */ } from 'react';
import { View, ScrollView, StyleSheet, Alert, Text as ReactNativeText } from 'react-native';
import { Card, Title, Paragraph, Button, Text, useTheme } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { supabase } from '../lib/supabase'; // Adjust path as needed
// import { AuthContext } from '../context/AuthContext'; // No longer directly using AuthContext
import { useAuth } from '../context/AuthContext'; // Import useAuth instead
// import { StackNavigationProp } from '@react-navigation/stack'; // No longer Stack
// import { RootStackParamList } from '../navigation/AppNavigator'; // No longer RootStackParamList
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainBottomTabParamList } from './MainBottomTabNavigator'; // Corrected path

// type AssessmentScreenNavigationProp = StackNavigationProp<
//   RootStackParamList,
//   'Assessment'
// >;

type AssessmentScreenNavigationProp = BottomTabNavigationProp<
  MainBottomTabParamList,
  'Assessment'
>;

type Props = {
  navigation: AssessmentScreenNavigationProp;
};

interface AccessibleSliderProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}

const AccessibleSlider: React.FC<AccessibleSliderProps> = ({
  label,
  value,
  onValueChange,
  min = 0,
  max = 10,
}) => {
  const theme = useTheme();
  return (
    <View style={styles.sliderContainer}>
      <Text style={[styles.sliderLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <Slider
        value={value}
        onValueChange={onValueChange}
        minimumValue={min}
        maximumValue={max}
        step={1}
        style={styles.slider}
      />
      <Text style={[styles.sliderValue, { color: theme.colors.primary }]}>{value}</Text>
    </View>
  );
};

const AssessmentScreen: React.FC<Props> = ({ navigation }) => {
  // const { user } = useContext(AuthContext); // Old way
  const { user } = useAuth(); // New way using the custom hook
  const theme = useTheme();
  const [tremor, setTremor] = useState(0);
  const [stiffness, setStiffness] = useState(0);
  const [balance, setBalance] = useState(0);
  const [fatigue, setFatigue] = useState(0);
  const [speech, setSpeech] = useState(0);
  const [writing, setWriting] = useState(0);
  const [mood, setMood] = useState(0); // Example: 0-10, 0 being very low, 10 very high
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to submit an assessment.');
      return;
    }

    setLoading(true);
    const assessmentData = {
      user_id: user.id,
      questionnaire_type: 'PD_SYMPTOM_SCALE_V1', // Example questionnaire type
      responses: {
        tremor,
        stiffness,
        balance,
        fatigue,
        speech,
        writing,
        mood,
      },
      // score: Calculate score if applicable, or handle server-side
      notes: notes,
    };

    const { error } = await supabase.from('assessments').insert(assessmentData);

    setLoading(false);
    if (error) {
      Alert.alert('Error submitting assessment', error.message);
      console.error('Error submitting assessment:', error);
    } else {
      Alert.alert('Success', 'Assessment submitted successfully.');
      // navigation.goBack(); // Or navigate to a results/thank you screen
      // Reset form
      setTremor(0);
      setStiffness(0);
      setBalance(0);
      setFatigue(0);
      setSpeech(0);
      setWriting(0);
      setMood(0);
      setNotes('');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Title 
            title="Parkinson's Symptom Assessment" 
            titleStyle={{color: theme.colors.onSurface}}
            subtitle="Rate your symptoms from 0 (none) to 10 (severe)"
            subtitleStyle={{color: theme.colors.onSurfaceVariant}}
        />
        <Card.Content>
          <AccessibleSlider label="Tremor Severity" value={tremor} onValueChange={setTremor} />
          <AccessibleSlider label="Muscle Stiffness" value={stiffness} onValueChange={setStiffness} />
          <AccessibleSlider label="Balance Problems" value={balance} onValueChange={setBalance} />
          <AccessibleSlider label="Fatigue Level" value={fatigue} onValueChange={setFatigue} />
          <AccessibleSlider label="Speech Difficulty" value={speech} onValueChange={setSpeech} />
          <AccessibleSlider label="Handwriting Difficulty" value={writing} onValueChange={setWriting} />
          <AccessibleSlider label="Overall Mood (0=Low, 10=High)" value={mood} onValueChange={setMood} />
          
          {/* Notes field can be added here if desired - TextInput */}
          {/* Placeholder for future ML prediction results */}
          <View style={styles.placeholder}>
            <Text style={{color: theme.colors.onSurfaceVariant}}>Future ML Prediction Results Area</Text>
          </View>

        </Card.Content>
        <Card.Actions>
          <Button 
            mode="contained" 
            onPress={handleSubmit} 
            disabled={loading}
            loading={loading}
            style={styles.button}
            labelStyle={{color: theme.colors.onPrimary}}
          >
            Submit Assessment
          </Button>
        </Card.Actions>
      </Card>
      
      <Card style={[styles.card, { backgroundColor: theme.colors.surface, marginTop: 20 }]}>
        <Card.Title title="Educational Content" titleStyle={{color: theme.colors.onSurface}}/>
        <Card.Content>
          <Paragraph style={{color: theme.colors.onSurfaceVariant}}>
            Understanding your symptoms is an important step in managing Parkinson's Disease. 
            Regularly assessing your symptoms can help you and your healthcare provider make informed decisions.
          </Paragraph>
          {/* Links to reputable medical resources can be added here */}
          <Button onPress={() => Alert.alert("External Link", "Navigate to Parkinson's Foundation (not implemented).")}>
            Learn more at Parkinson's Foundation
          </Button>
           <Button onPress={() => Alert.alert("External Link", "Navigate to Michael J. Fox Foundation (not implemented).")}>
            Michael J. Fox Foundation
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 16,
    elevation: 4,
  },
  sliderContainer: {
    marginVertical: 12,
  },
  sliderLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  slider: {
    height: 40, // Standard slider height
  },
  sliderValue: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
  },
  button: {
    margin: 8,
  },
  placeholder: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 20,
    marginVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});

export default AssessmentScreen; 