import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, TouchableRipple, useTheme } from 'react-native-paper';

interface AccessibleCardProps {
  title: string;
  subtitle?: string;
  content?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * An accessible card component with large touch targets and clear visual hierarchy.
 * Designed specifically for users with motor difficulties.
 */
const AccessibleCard: React.FC<AccessibleCardProps> = ({
  title,
  subtitle,
  content,
  onPress,
  icon,
  accessibilityLabel,
  testID,
}) => {
  const theme = useTheme();

  const cardContent = (
    <Card style={styles.card}>
      {icon && <Card.Content style={styles.iconContainer}>{icon}</Card.Content>}
      <Card.Content>
        <Text variant="titleLarge" style={styles.title}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="titleMedium" style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
        {content && (
          <Text variant="bodyMedium" style={styles.content}>
            {content}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  if (onPress) {
    return (
      <TouchableRipple
        onPress={onPress}
        style={styles.touchable}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        testID={testID}
      >
        {cardContent}
      </TouchableRipple>
    );
  }

  return (
    <Card 
      style={styles.card}
      accessible={true}
      accessibilityLabel={accessibilityLabel || title}
      testID={testID}
    >
      {cardContent}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
  },
  touchable: {
    borderRadius: 8,
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 8,
  },
  content: {
    marginTop: 8,
  },
});

export default AccessibleCard; 