import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Card,
  useTheme,
  Divider,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';

const AnimatedCard = Animated.createAnimatedComponent(Card);

interface ConnectionGuideProps {
  userType: 'patient' | 'caregiver';
}

const ConnectionGuide: React.FC<ConnectionGuideProps> = ({ userType }) => {
  const theme = useTheme();

  const patientSteps = [
    {
      icon: 'numeric-1-circle',
      title: 'Generate Code',
      description: 'Tap "Generate Invitation Code" to create an invitation code for your caregiver.'
    },
    {
      icon: 'numeric-2-circle',
      title: 'Share with Caregiver',
      description: 'Share the code via text, email, or show them the QR code.'
    },
    {
      icon: 'numeric-3-circle',
      title: 'They Connect',
      description: 'Your caregiver enters the code in their app to connect with you.'
    },
    {
      icon: 'check-circle',
      title: 'Done!',
      description: 'Your caregiver can now monitor your health data and help with care.'
    }
  ];

  const caregiverSteps = [
    {
      icon: 'numeric-1-circle',
      title: 'Get Invitation Code',
      description: 'Ask your patient to share their invitation code with you.'
    },
    {
      icon: 'numeric-2-circle',
      title: 'Enter Code',
      description: 'Type the code in the "Connect with New Patient" section above.'
    },
    {
      icon: 'numeric-3-circle',
      title: 'Connect',
      description: 'Tap "Connect with Patient" to establish the connection.'
    },
    {
      icon: 'check-circle',
      title: 'Start Caring',
      description: 'You can now view their health data and help with their care.'
    }
  ];

  const steps = userType === 'patient' ? patientSteps : caregiverSteps;
  const title = userType === 'patient' 
    ? 'How to Connect with Your Caregiver' 
    : 'How to Connect with a Patient';

  return (
    <AnimatedCard
      entering={FadeInDown.delay(400).springify()}
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      elevation={2}
    >
      <Card.Content>
        <View style={styles.header}>
          <MaterialCommunityIcons 
            name="help-circle-outline" 
            size={24} 
            color={theme.colors.primary} 
          />
          <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
        </View>
        
        <Divider style={styles.divider} />
        
        {steps.map((step, index) => (
          <View key={index} style={styles.step}>
            <MaterialCommunityIcons 
              name={step.icon as any} 
              size={32} 
              color={step.icon === 'check-circle' ? '#22c55e' : theme.colors.primary} 
            />
            <View style={styles.stepContent}>
              <Text variant="titleSmall" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>
                {step.title}
              </Text>
              <Text variant="bodySmall" style={[styles.stepDescription, { color: theme.colors.onSurfaceVariant }]}>
                {step.description}
              </Text>
            </View>
          </View>
        ))}
        
        <View style={[styles.note, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons 
            name="information" 
            size={20} 
            color={theme.colors.primary} 
          />
          <Text variant="bodySmall" style={[styles.noteText, { color: theme.colors.onPrimaryContainer }]}>
            {userType === 'patient' 
              ? 'Invitation codes expire after 24 hours for security. Generate a new one if needed.'
              : 'Make sure to enter the code exactly as shared. Codes are case-sensitive.'}
          </Text>
        </View>
      </Card.Content>
    </AnimatedCard>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  title: {
    fontWeight: '600',
    flex: 1,
  },
  divider: {
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDescription: {
    lineHeight: 18,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});

export default ConnectionGuide; 