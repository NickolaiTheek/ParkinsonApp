import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  RadioButton,
  Surface,
  Divider,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY, // API key should be in .env file
});

interface AssessmentData {
  age: string;
  gender: string;
  handShaking: string;
  stiffness: string;
  slowMovement: string;
  lossOfSmell: string;
  familyHistory: string;
  timeline: string;
}

interface AssessmentResult {
  riskLevel: 'Low' | 'Moderate' | 'High';
  percentage: number;
  keyFactors: string[];
  recommendations: string[];
}

const ParkinsonsAssessmentScreen: React.FC = () => {
  const theme = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    age: '',
    gender: '',
    handShaking: '',
    stiffness: '',
    slowMovement: '',
    lossOfSmell: '',
    familyHistory: '',
    timeline: '',
  });
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const questions = [
    {
      title: 'Basic Information',
      fields: [
        {
          key: 'age' as keyof AssessmentData,
          question: 'What is your age?',
          type: 'radio',
          options: ['Under 40', '40-50', '50-60', '60-70', 'Over 70'],
        },
        {
          key: 'gender' as keyof AssessmentData,
          question: 'Gender',
          type: 'radio',
          options: ['Male', 'Female'],
        },
      ],
    },
    {
      title: 'Motor Symptoms',
      fields: [
        {
          key: 'handShaking' as keyof AssessmentData,
          question: 'Do your hands shake when at rest?',
          type: 'radio',
          options: ['Yes', 'No', 'Sometimes'],
        },
        {
          key: 'stiffness' as keyof AssessmentData,
          question: 'Do you feel stiff in your arms or legs?',
          type: 'radio',
          options: ['Yes', 'No', 'Sometimes'],
        },
      ],
    },
    {
      title: 'Other Symptoms',
      fields: [
        {
          key: 'slowMovement' as keyof AssessmentData,
          question: 'Are your movements slower than before?',
          type: 'radio',
          options: ['Yes', 'No', 'Sometimes'],
        },
        {
          key: 'lossOfSmell' as keyof AssessmentData,
          question: 'Have you lost your sense of smell?',
          type: 'radio',
          options: ['Yes', 'No', 'Not sure'],
        },
      ],
    },
    {
      title: 'Family History & Timeline',
      fields: [
        {
          key: 'familyHistory' as keyof AssessmentData,
          question: 'Does anyone in your family have Parkinson\'s?',
          type: 'radio',
          options: ['Yes', 'No', 'Not sure'],
        },
        {
          key: 'timeline' as keyof AssessmentData,
          question: 'How long have you noticed these symptoms?',
          type: 'radio',
          options: ['Less than 6 months', '6-12 months', '1-2 years', 'Over 2 years'],
        },
      ],
    },
  ];

  const updateAssessmentData = (key: keyof AssessmentData, value: string) => {
    setAssessmentData(prev => ({ ...prev, [key]: value }));
  };

  const isStepComplete = () => {
    const currentFields = questions[currentStep].fields;
    return currentFields.every(field => assessmentData[field.key] !== '');
  };

  const nextStep = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      performAssessment();
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const performAssessment = async () => {
    // Prevent multiple simultaneous calls
    if (isProcessing) return;
    
    setLoading(true);
    setIsProcessing(true);
    
    try {
      const prompt = `
You are a medical AI assistant specialized in Parkinson's disease risk assessment. 
Based on the following information, provide a risk assessment:

Patient Information:
- Age: ${assessmentData.age}
- Gender: ${assessmentData.gender}
- Hand shaking/tremor: ${assessmentData.handShaking}
- Stiffness: ${assessmentData.stiffness}
- Slow movement: ${assessmentData.slowMovement}
- Loss of smell: ${assessmentData.lossOfSmell}
- Family history: ${assessmentData.familyHistory}
- Symptom timeline: ${assessmentData.timeline}

Please provide your assessment in the following JSON format:
{
  "riskLevel": "Low|Moderate|High",
  "percentage": number (0-100),
  "keyFactors": ["factor1", "factor2", "factor3"],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}

Important notes:
- This is for informational purposes only
- Always recommend consulting a healthcare professional
- Base assessment on established medical research
- Be conservative in risk assessment
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a medical AI assistant. Provide accurate, evidence-based Parkinson\'s risk assessments. Always recommend professional medical consultation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      const resultText = response.choices[0].message.content;
      if (resultText) {
        try {
          const parsedResult = JSON.parse(resultText);
          setResult(parsedResult);
          setUsingFallback(false);
        } catch (parseError) {
          throw new Error('Failed to parse AI response');
        }
      }
    } catch (error) {
      // Only log the error once, don't spam console
      if (!usingFallback) {
        console.log('OpenAI API unavailable, using fallback assessment');
      }
      
      // Check if it's a quota/billing error and provide fallback
      if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('billing')) {
        setUsingFallback(true);
        // Provide a basic rule-based assessment as fallback
        const fallbackResult = generateFallbackAssessment(assessmentData);
        setResult(fallbackResult);
      } else {
        Alert.alert(
          'Assessment Error',
          'Unable to complete the assessment. Please try again later.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
      setIsProcessing(false);
    }
  };

  // Fallback assessment logic when API is unavailable
  const generateFallbackAssessment = (data: AssessmentData): AssessmentResult => {
    let riskScore = 0;
    const factors: string[] = [];
    const recommendations: string[] = [];

    // Age factor
    if (data.age === 'Over 70') riskScore += 3;
    else if (data.age === '60-70') riskScore += 2;
    else if (data.age === '50-60') riskScore += 1;

    // Symptom factors
    if (data.handShaking === 'Yes') {
      riskScore += 3;
      factors.push('Resting hand tremor present');
    } else if (data.handShaking === 'Sometimes') {
      riskScore += 1;
      factors.push('Intermittent hand tremor');
    }

    if (data.stiffness === 'Yes') {
      riskScore += 2;
      factors.push('Muscle stiffness reported');
    } else if (data.stiffness === 'Sometimes') {
      riskScore += 1;
    }

    if (data.slowMovement === 'Yes') {
      riskScore += 2;
      factors.push('Bradykinesia (slow movement)');
    }

    if (data.lossOfSmell === 'Yes') {
      riskScore += 2;
      factors.push('Loss of smell (anosmia)');
    }

    if (data.familyHistory === 'Yes') {
      riskScore += 2;
      factors.push('Family history of Parkinson\'s disease');
    }

    // Timeline factor
    if (data.timeline === 'Over 2 years') riskScore += 1;

    // Determine risk level
    let riskLevel: 'Low' | 'Moderate' | 'High';
    let percentage: number;

    if (riskScore >= 8) {
      riskLevel = 'High';
      percentage = Math.min(75 + (riskScore - 8) * 5, 95);
    } else if (riskScore >= 4) {
      riskLevel = 'Moderate';
      percentage = 40 + (riskScore - 4) * 8;
    } else {
      riskLevel = 'Low';
      percentage = Math.max(5, riskScore * 8);
    }

    // Generate recommendations
    recommendations.push('Consult with a neurologist for proper evaluation');
    
    if (riskScore >= 6) {
      recommendations.push('Consider DaTscan or other specialized Parkinson\'s tests');
      recommendations.push('Monitor symptoms closely and keep a symptom diary');
    } else if (riskScore >= 3) {
      recommendations.push('Regular check-ups with your healthcare provider');
      recommendations.push('Maintain regular exercise and healthy lifestyle');
    } else {
      recommendations.push('Continue regular health screenings');
      recommendations.push('Stay active and maintain good overall health');
    }

    if (factors.length === 0) {
      factors.push('Age within normal risk range');
      factors.push('No major motor symptoms reported');
    }

    return {
      riskLevel,
      percentage,
      keyFactors: factors,
      recommendations,
    };
  };

  const resetAssessment = () => {
    setCurrentStep(0);
    setResult(null);
    setAssessmentData({
      age: '',
      gender: '',
      handShaking: '',
      stiffness: '',
      slowMovement: '',
      lossOfSmell: '',
      familyHistory: '',
      timeline: '',
    });
    setUsingFallback(false);
    setIsProcessing(false);
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Low': return '#4CAF50';
      case 'Moderate': return '#FF9800';
      case 'High': return '#F44336';
      default: return theme.colors.primary;
    }
  };

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View
          style={[styles.header, { backgroundColor: '#667eea' }]}
        >
          <View style={styles.headerContent}>
            <MaterialCommunityIcons name="brain" size={40} color="white" />
            <Text style={styles.headerTitle}>Assessment Results</Text>
          </View>
        </View>

        <ScrollView style={styles.content}>
          <Card style={styles.resultCard}>
            <Card.Content>
              <View style={styles.resultHeader}>
                <MaterialCommunityIcons 
                  name="chart-donut" 
                  size={60} 
                  color={getRiskColor(result.riskLevel)} 
                />
                <View style={styles.resultInfo}>
                  <Text style={[styles.riskLevel, { color: getRiskColor(result.riskLevel) }]}>
                    {result.riskLevel} Risk
                  </Text>
                  <Text style={styles.percentage}>
                    {result.percentage}% likelihood
                  </Text>
                </View>
              </View>

              <Divider style={styles.divider} />

              <Text style={styles.sectionTitle}>Key Factors Identified:</Text>
              {result.keyFactors.map((factor, index) => (
                <View key={index} style={styles.factorItem}>
                  <MaterialCommunityIcons name="circle" size={8} color={theme.colors.primary} />
                  <Text style={styles.factorText}>{factor}</Text>
                </View>
              ))}

              <Divider style={styles.divider} />

              <Text style={styles.sectionTitle}>Recommendations:</Text>
              {result.recommendations.map((recommendation, index) => (
                <View key={index} style={styles.factorItem}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#4CAF50" />
                  <Text style={styles.factorText}>{recommendation}</Text>
                </View>
              ))}

              <Surface style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                  ⚠️ This assessment is for informational purposes only and should not replace professional medical advice. Please consult with a healthcare provider for proper diagnosis and treatment.
                </Text>
              </Surface>

              {usingFallback && (
                <Surface style={[styles.disclaimer, { backgroundColor: '#e3f2fd', marginTop: 10 }]}>
                  <Text style={[styles.disclaimerText, { color: '#1565c0' }]}>
                    ℹ️ This assessment was generated using built-in medical guidelines due to API limitations. For the most accurate AI-powered assessment, please try again later.
                  </Text>
                </Surface>
              )}
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={resetAssessment}
            style={styles.resetButton}
            icon="refresh"
          >
            Take Assessment Again
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[styles.header, { backgroundColor: '#667eea' }]}
      >
        <View style={styles.headerContent}>
          <MaterialCommunityIcons name="brain" size={40} color="white" />
          <Text style={styles.headerTitle}>Parkinson's Risk Assessment</Text>
          <Text style={styles.headerSubtitle}>
            Step {currentStep + 1} of {questions.length}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <Card style={styles.loadingCard}>
            <Card.Content style={styles.loadingContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Analyzing your responses...</Text>
              <Text style={styles.loadingSubtext}>This may take a few moments</Text>
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.questionCard}>
            <Card.Content>
              <Text style={styles.stepTitle}>{questions[currentStep].title}</Text>
              
              {questions[currentStep].fields.map((field, index) => (
                <View key={index} style={styles.questionContainer}>
                  <Text style={styles.questionText}>{field.question}</Text>
                  <RadioButton.Group
                    onValueChange={(value) => updateAssessmentData(field.key, value)}
                    value={assessmentData[field.key]}
                  >
                    {field.options.map((option, optionIndex) => (
                      <TouchableOpacity
                        key={optionIndex}
                        onPress={() => updateAssessmentData(field.key, option)}
                        style={[
                          styles.radioTouchable,
                          assessmentData[field.key] === option && styles.radioSelected
                        ]}
                        activeOpacity={0.7}
                      >
                        <View style={styles.radioItem}>
                          <RadioButton value={option} />
                          <Text style={styles.radioLabel}>{option}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </RadioButton.Group>
                  {index < questions[currentStep].fields.length - 1 && (
                    <Divider style={styles.fieldDivider} />
                  )}
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        <View style={styles.navigationButtons}>
          {currentStep > 0 && (
            <Button
              mode="outlined"
              onPress={previousStep}
              style={styles.navButton}
              icon="arrow-left"
            >
              Previous
            </Button>
          )}
          
          <Button
            mode="contained"
            onPress={nextStep}
            disabled={!isStepComplete() || loading || isProcessing}
            style={styles.navButton}
            icon={currentStep === questions.length - 1 ? "check" : "arrow-right"}
          >
            {currentStep === questions.length - 1 ? 'Get Results' : 'Next'}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'center',
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 16,
    marginTop: 5,
    opacity: 0.9,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  questionCard: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  questionContainer: {
    marginBottom: 15,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 10,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  radioLabel: {
    fontSize: 16,
    marginLeft: 8,
    flex: 1,
  },
  fieldDivider: {
    marginTop: 15,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  navButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  loadingCard: {
    marginBottom: 20,
  },
  loadingContent: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.7,
  },
  resultCard: {
    marginBottom: 20,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultInfo: {
    marginLeft: 20,
    flex: 1,
  },
  riskLevel: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  percentage: {
    fontSize: 16,
    marginTop: 5,
    opacity: 0.7,
  },
  divider: {
    marginVertical: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  factorText: {
    marginLeft: 10,
    fontSize: 14,
    flex: 1,
  },
  disclaimer: {
    padding: 15,
    marginTop: 20,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 10,
    marginBottom: 20,
  },
  radioTouchable: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  radioSelected: {
    backgroundColor: '#e0e0e0', // A light gray background for selected state
  },
});

export default ParkinsonsAssessmentScreen; 