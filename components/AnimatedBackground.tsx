import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const getTimeBasedColors = () => {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) { // Morning
    return {
      primary: ['#FFB88C', '#FF9A9E', '#FAD0C4'],
      accent: ['#A1C4FD', '#C2E9FB'],
      opacity: 0.8
    };
  } else if (hour >= 12 && hour < 17) { // Afternoon
    return {
      primary: ['#89F7FE', '#66A6FF', '#4FACFE'],
      accent: ['#C2E9FB', '#A1C4FD'],
      opacity: 0.7
    };
  } else if (hour >= 17 && hour < 20) { // Evening
    return {
      primary: ['#FF9A9E', '#FAD0C4', '#FFB88C'],
      accent: ['#A18CD1', '#FBC2EB'],
      opacity: 0.75
    };
  } else { // Night
    return {
      primary: ['#2C3E50', '#3498DB', '#2980B9'],
      accent: ['#6DD5FA', '#2980B9'],
      opacity: 0.85
    };
  };
};

const AnimatedBackground: React.FC = () => {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const colors = getTimeBasedColors();

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 20000,
        easing: Easing.linear,
      }),
      -1
    );

    scale.value = withRepeat(
      withSequence(
        withTiming(1.2, {
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1
    );

    translateY.value = withRepeat(
      withSequence(
        withTiming(50, {
          duration: 15000,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: 15000,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${rotation.value}deg` },
        { scale: scale.value },
        { translateY: translateY.value },
      ],
    };
  });

  return (
    <>
      <LinearGradient
        colors={colors.primary}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Animated.View style={[styles.patternContainer, animatedStyle]}>
        <Svg height={height * 2} width={width * 2} style={styles.pattern}>
          <Defs>
            <RadialGradient id="grad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor={colors.accent[0]} stopOpacity={colors.opacity} />
              <Stop offset="100%" stopColor={colors.accent[1]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="60%" fill="url(#grad)" />
        </Svg>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  patternContainer: {
    position: 'absolute',
    top: -height / 2,
    left: -width / 2,
    right: 0,
    bottom: 0,
  },
  pattern: {
    opacity: 0.6,
  },
});

export default AnimatedBackground; 