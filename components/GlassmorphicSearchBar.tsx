import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface GlassmorphicSearchBarProps {
  searchQuery: string;
  onChangeSearch: (query: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const GlassmorphicSearchBar: React.FC<GlassmorphicSearchBarProps> = ({
  searchQuery,
  onChangeSearch,
  onFocus,
  onBlur,
}) => {
  const animatedValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(animatedValue.value, [0, 1], [1, 1.02]),
        },
      ],
      shadowOpacity: interpolate(animatedValue.value, [0, 1], [0.1, 0.2]),
    };
  });

  const handleFocus = () => {
    animatedValue.value = withSpring(1);
    onFocus?.();
  };

  const handleBlur = () => {
    animatedValue.value = withTiming(0);
    onBlur?.();
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <BlurView intensity={50} tint="light" style={styles.blurContainer}>
        <Searchbar
          placeholder="Search medications..."
          onChangeText={onChangeSearch}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.input}
          iconColor="rgba(0, 0, 0, 0.6)"
          onFocus={handleFocus}
          onBlur={handleBlur}
          elevation={0}
        />
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 32,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowRadius: 12,
    elevation: 5,
  },
  blurContainer: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  searchBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 0,
    borderRadius: 20,
  },
  input: {
    fontSize: 16,
    color: 'rgba(0, 0, 0, 0.8)',
  },
});

export default GlassmorphicSearchBar; 