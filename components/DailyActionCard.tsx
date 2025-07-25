import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface DailyActionCardProps {
  label: string;
  imageSource: ImageSourcePropType;
  onPress: () => void;
  delay?: number;
}

const DailyActionCard: React.FC<DailyActionCardProps> = ({ label, imageSource, onPress, delay = 0 }) => {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Staggered entrance animation
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
  }, [delay, opacity]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.96, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    onPress();
  }, [onPress, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: 8,
    },
    image: {
      width: '100%',
      height: 150, // Adjust height as needed
      borderRadius: theme.roundness * 2, // 16px
    },
    label: {
      color: theme.colors.onSurface,
      fontSize: 16,
      fontWeight: '500',
    }
  });

  return (
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <TouchableOpacity onPress={handlePress} style={styles.container}>
        <Image source={imageSource} style={styles.image} resizeMode="cover" />
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default DailyActionCard; 