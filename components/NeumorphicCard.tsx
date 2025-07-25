import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';

interface NeumorphicCardProps {
  children: React.ReactNode;
  style?: ViewStyle; // Style for the main card View
  cardBackgroundColor?: string;
  shadowColor?: string; 
  shadowDistance?: number; // To influence offset and radius
}

export const NeumorphicCard: React.FC<NeumorphicCardProps> = ({
  children,
  style,
  cardBackgroundColor = '#FFFFFF',
  shadowColor = '#000000', // Default shadow color
  shadowDistance = 5,      // Default distance
}) => {
  const cardStyle: ViewStyle = {
    backgroundColor: cardBackgroundColor,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: shadowColor,
        shadowOffset: { width: shadowDistance / 2, height: shadowDistance / 2 },
        shadowOpacity: 0.1, // Softer opacity
        shadowRadius: shadowDistance * 0.8, // Radius related to distance
      },
      android: {
        elevation: shadowDistance, // Elevation related to distance
      },
    }),
  };

  return (
    <View style={[styles.container, cardStyle, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { // This will mostly be for layout, specific card styles are in cardStyle
    padding: 16, // Content padding
  },
}); 