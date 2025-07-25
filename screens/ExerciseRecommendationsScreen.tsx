import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Modal,
  Alert,
  Image,
} from 'react-native';
import {
  Text,
  useTheme,
  Chip,
  Card,
  Button,
  ActivityIndicator,
  Surface,
  IconButton,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  FadeInDown,
  SlideInRight,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const AnimatedCard = Animated.createAnimatedComponent(Card);

interface ExerciseVideo {
  id: string;
  title: string;
  youtube_id: string;
  youtube_url: string;
  thumbnail_url?: string;
  duration_minutes: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  symptoms_targeted: string[];
  equipment_needed: string[];
  description: string;
  instructor_name: string;
  is_active: boolean;
}

interface FilterOption {
  label: string;
  value: string;
  color: string;
  icon: string;
}

const CATEGORIES: FilterOption[] = [
  { label: 'All', value: 'all', color: '#667eea', icon: 'view-grid' },
  { label: 'Balance', value: 'balance', color: '#4CAF50', icon: 'scale-balance' },
  { label: 'Strength', value: 'strength', color: '#FF9800', icon: 'dumbbell' },
  { label: 'Flexibility', value: 'flexibility', color: '#9C27B0', icon: 'yoga' },
  { label: 'Cardio', value: 'cardio', color: '#F44336', icon: 'heart-pulse' },
  { label: 'Voice', value: 'voice', color: '#00BCD4', icon: 'microphone' },
];

const DIFFICULTY_LEVELS: FilterOption[] = [
  { label: 'All Levels', value: 'all', color: '#667eea', icon: 'star' },
  { label: 'Beginner', value: 'beginner', color: '#4CAF50', icon: 'star-outline' },
  { label: 'Intermediate', value: 'intermediate', color: '#FF9800', icon: 'star-half-full' },
  { label: 'Advanced', value: 'advanced', color: '#F44336', icon: 'star' },
];

const ExerciseRecommendationsScreen = () => {
  const theme = useTheme();
  const { user } = useAuth();
  
  // State
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<ExerciseVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState<ExerciseVideo | null>(null);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  
  // Animation values
  const headerOpacity = useSharedValue(0);
  const cardsOpacity = useSharedValue(0);

  // Initialize animations
  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 600 });
    cardsOpacity.value = withTiming(1, { duration: 800 });
  }, []);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const cardsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
  }));

  // Sample data - In real app, this would come from Supabase
  const sampleVideos: ExerciseVideo[] = [
    {
      id: '1',
      title: 'PWR! Moves for Parkinson\'s - Beginner Balance',
      youtube_id: 'jyOk-2DmVnU',
      youtube_url: 'https://www.youtube.com/watch?v=jyOk-2DmVnU',
      thumbnail_url: 'https://img.youtube.com/vi/jyOk-2DmVnU/maxresdefault.jpg',
      duration_minutes: 15,
      difficulty_level: 'beginner',
      category: 'balance',
      symptoms_targeted: ['balance', 'mobility'],
      equipment_needed: ['chair'],
      description: 'Gentle balance exercises designed specifically for people with Parkinson\'s disease.',
      instructor_name: 'PWR! Certified Instructor',
      is_active: true,
    },
    {
      id: '2',
      title: 'Rock Steady Boxing - Non-Contact Training',
      youtube_id: 'MXo6yM_PPPk',
      youtube_url: 'https://www.youtube.com/watch?v=MXo6yM_PPPk',
      thumbnail_url: 'https://img.youtube.com/vi/MXo6yM_PPPk/maxresdefault.jpg',
      duration_minutes: 30,
      difficulty_level: 'intermediate',
      category: 'cardio',
      symptoms_targeted: ['tremor', 'stiffness', 'balance'],
      equipment_needed: ['none'],
      description: 'Non-contact boxing exercises to improve coordination, balance, and strength.',
      instructor_name: 'Rock Steady Boxing',
      is_active: true,
    },
    {
      id: '3',
      title: 'Seated Exercises for Parkinson\'s',
      youtube_id: 'KNWqyKluZgg',
      youtube_url: 'https://www.youtube.com/watch?v=KNWqyKluZgg',
      thumbnail_url: 'https://img.youtube.com/vi/KNWqyKluZgg/maxresdefault.jpg',
      duration_minutes: 20,
      difficulty_level: 'beginner',
      category: 'strength',
      symptoms_targeted: ['stiffness', 'mobility'],
      equipment_needed: ['chair'],
      description: 'Chair-based exercises perfect for those with limited mobility.',
      instructor_name: 'Parkinson\'s Foundation',
      is_active: true,
    },
    {
      id: '4',
      title: 'Voice Exercises for Parkinson\'s - LOUD Program',
      youtube_id: '7YEs9ycVTB0',
      youtube_url: 'https://www.youtube.com/watch?v=7YEs9ycVTB0',
      thumbnail_url: 'https://img.youtube.com/vi/7YEs9ycVTB0/maxresdefault.jpg',
      duration_minutes: 10,
      difficulty_level: 'beginner',
      category: 'voice',
      symptoms_targeted: ['voice', 'speech'],
      equipment_needed: ['none'],
      description: 'Voice strengthening exercises to improve speech clarity and volume.',
      instructor_name: 'Speech Therapist',
      is_active: true,
    },
    {
      id: '5',
      title: 'Parkinson\'s Yoga - Gentle Flexibility',
      youtube_id: 'Ih0UY8jgfkc',
      youtube_url: 'https://www.youtube.com/watch?v=Ih0UY8jgfkc',
      thumbnail_url: 'https://img.youtube.com/vi/Ih0UY8jgfkc/maxresdefault.jpg',
      duration_minutes: 25,
      difficulty_level: 'beginner',
      category: 'flexibility',
      symptoms_targeted: ['stiffness', 'mobility', 'balance'],
      equipment_needed: ['yoga mat'],
      description: 'Gentle yoga poses and stretches to improve flexibility and reduce stiffness.',
      instructor_name: 'Certified Yoga Instructor',
      is_active: true,
    },
    {
      id: '6',
      title: 'PWR! Moves - Intermediate Strength Training',
      youtube_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      duration_minutes: 35,
      difficulty_level: 'intermediate',
      category: 'strength',
      symptoms_targeted: ['muscle weakness', 'mobility'],
      equipment_needed: ['light weights', 'resistance bands'],
      description: 'Progressive strength training exercises designed for people with Parkinson\'s.',
      instructor_name: 'PWR! Certified Instructor',
      is_active: true,
    },
    {
      id: '7',
      title: 'Dance Therapy for Parkinson\'s',
      youtube_id: 'ScMzIvxBSi4',
      youtube_url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
      thumbnail_url: 'https://img.youtube.com/vi/ScMzIvxBSi4/maxresdefault.jpg',
      duration_minutes: 45,
      difficulty_level: 'intermediate',
      category: 'cardio',
      symptoms_targeted: ['balance', 'coordination', 'mood'],
      equipment_needed: ['none'],
      description: 'Joyful dance movements that improve balance, coordination, and mood.',
      instructor_name: 'Dance Movement Therapist',
      is_active: true,
    },
    {
      id: '8',
      title: 'Advanced Balance Challenge',
      youtube_id: 'oHg5SJYRHA0',
      youtube_url: 'https://www.youtube.com/watch?v=oHg5SJYRHA0',
      thumbnail_url: 'https://img.youtube.com/vi/oHg5SJYRHA0/maxresdefault.jpg',
      duration_minutes: 20,
      difficulty_level: 'advanced',
      category: 'balance',
      symptoms_targeted: ['balance', 'falls prevention'],
      equipment_needed: ['none'],
      description: 'Challenging balance exercises for those ready to advance their stability training.',
      instructor_name: 'Physical Therapist',
      is_active: true,
    },
  ];

  // Load videos
  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      // In real implementation, fetch from Supabase
      // const { data, error } = await supabase
      //   .from('exercise_videos')
      //   .select('*')
      //   .eq('is_active', true)
      //   .order('created_at', { ascending: false });
      
      // For now, use sample data
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading
      setVideos(sampleVideos);
    } catch (error) {
      console.error('Error loading videos:', error);
      Alert.alert('Error', 'Failed to load exercise videos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter videos
  const filterVideos = useCallback(() => {
    let filtered = videos;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(video => video.category === selectedCategory);
    }

    if (selectedDifficulty !== 'all') {
      filtered = filtered.filter(video => video.difficulty_level === selectedDifficulty);
    }

    setFilteredVideos(filtered);
  }, [videos, selectedCategory, selectedDifficulty]);

  // Effects
  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    filterVideos();
  }, [filterVideos]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadVideos();
    setIsRefreshing(false);
  }, [loadVideos]);

  const handleVideoPress = useCallback((video: ExerciseVideo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedVideo(video);
    setIsPlayerVisible(true);
  }, []);

  const handleClosePlayer = useCallback(() => {
    setIsPlayerVisible(false);
    setSelectedVideo(null);
  }, []);

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner': return '#4CAF50';
      case 'intermediate': return '#FF9800';
      case 'advanced': return '#F44336';
      default: return theme.colors.primary;
    }
  };

  const renderVideoCard = (video: ExerciseVideo, index: number) => (
    <AnimatedCard
      key={video.id}
      entering={FadeInDown.delay(index * 100).springify()}
      layout={Layout.springify()}
      style={[styles.videoCard, { backgroundColor: theme.colors.surface }]}
      elevation={3}
      onPress={() => handleVideoPress(video)}
    >
      <View style={styles.videoThumbnail}>
        {video.thumbnail_url ? (
          <View style={styles.thumbnailContainer}>
            <Image 
              source={{ uri: video.thumbnail_url }} 
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
            <View style={styles.playButtonOverlay}>
              <MaterialCommunityIcons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
            </View>
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{video.duration_minutes}min</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
            <MaterialCommunityIcons name="play-circle" size={48} color={theme.colors.primary} />
          </View>
        )}
      </View>
      
      <View style={styles.videoInfo}>
        <Text style={[styles.videoTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.instructorName, { color: theme.colors.onSurfaceVariant }]}>
          {video.instructor_name}
        </Text>
        
        <View style={styles.videoMeta}>
          <Chip
            mode="outlined"
            style={[styles.difficultyChip, { borderColor: getDifficultyColor(video.difficulty_level) }]}
            textStyle={{ color: getDifficultyColor(video.difficulty_level), fontSize: 12 }}
          >
            {video.difficulty_level}
          </Chip>
          <Chip
            mode="outlined"
            style={styles.categoryChip}
            textStyle={{ fontSize: 12 }}
          >
            {video.category}
          </Chip>
        </View>
        
        <Text style={[styles.videoDescription, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
          {video.description}
        </Text>
      </View>
    </AnimatedCard>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header */}
      <Animated.View style={[styles.headerContainer, headerAnimatedStyle]}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <MaterialCommunityIcons name="dumbbell" size={28} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Exercise Recommendations</Text>
            <Text style={styles.headerSubtitle}>Targeted exercises for Parkinson's</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScrollContent}>
          <BlurView intensity={20} tint="light" style={styles.filtersBlur}>
            <Text style={[styles.filterLabel, { color: theme.colors.onSurface }]}>Category:</Text>
            {CATEGORIES.map((category) => (
              <Chip
                key={category.value}
                selected={selectedCategory === category.value}
                onPress={() => setSelectedCategory(category.value)}
                style={[
                  styles.filterChip,
                  selectedCategory === category.value && { backgroundColor: category.color + '20' }
                ]}
                textStyle={selectedCategory === category.value ? { color: category.color } : {}}
                icon={category.icon}
              >
                {category.label}
              </Chip>
            ))}
          </BlurView>
        </ScrollView>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScrollContent}>
          <BlurView intensity={20} tint="light" style={styles.filtersBlur}>
            <Text style={[styles.filterLabel, { color: theme.colors.onSurface }]}>Level:</Text>
            {DIFFICULTY_LEVELS.map((level) => (
              <Chip
                key={level.value}
                selected={selectedDifficulty === level.value}
                onPress={() => setSelectedDifficulty(level.value)}
                style={[
                  styles.filterChip,
                  selectedDifficulty === level.value && { backgroundColor: level.color + '20' }
                ]}
                textStyle={selectedDifficulty === level.value ? { color: level.color } : {}}
                icon={level.icon}
              >
                {level.label}
              </Chip>
            ))}
          </BlurView>
        </ScrollView>
      </View>

      {/* Video List */}
      <Animated.View style={[styles.contentContainer, cardsAnimatedStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
                Loading exercise videos...
              </Text>
            </View>
          ) : filteredVideos.length === 0 ? (
            <Surface style={styles.emptyContainer} elevation={1}>
              <MaterialCommunityIcons name="video-off" size={64} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
                No videos found
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Try adjusting your filters or check back later
              </Text>
            </Surface>
          ) : (
            filteredVideos.map((video, index) => renderVideoCard(video, index))
          )}
        </ScrollView>
      </Animated.View>

      {/* Video Player Modal */}
      <Modal
        visible={isPlayerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClosePlayer}
      >
        <View style={[styles.playerContainer, { backgroundColor: theme.colors.background }]}>
          <View style={styles.playerHeader}>
            <Text style={[styles.playerTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
              {selectedVideo?.title}
            </Text>
            <IconButton
              icon="close"
              size={24}
              onPress={handleClosePlayer}
              iconColor={theme.colors.onSurface}
            />
          </View>
          
          {selectedVideo && (
            <WebView
              source={{ uri: `https://www.youtube.com/embed/${selectedVideo.youtube_id}?autoplay=1&rel=0` }}
              style={styles.webView}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              )}
            />
          )}
          
          {selectedVideo && (
            <View style={styles.playerInfo}>
              <Text style={[styles.playerDescription, { color: theme.colors.onSurfaceVariant }]}>
                {selectedVideo.description}
              </Text>
              <View style={styles.playerMeta}>
                <Chip mode="outlined" style={styles.metaChip}>
                  {selectedVideo.duration_minutes} minutes
                </Chip>
                <Chip mode="outlined" style={styles.metaChip}>
                  {selectedVideo.difficulty_level}
                </Chip>
                <Chip mode="outlined" style={styles.metaChip}>
                  {selectedVideo.category}
                </Chip>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 0,
    paddingBottom: 10,
    zIndex: 1,
  },
  headerGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerContent: {
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  filtersContainer: {
    paddingVertical: 12,
    gap: 8,
  },
  filtersScrollContent: {
    paddingHorizontal: 16,
  },
  filtersBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 8,
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  filterChip: {
    marginHorizontal: 2,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
    margin: 16,
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '400',
  },
  videoCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  videoThumbnail: {
    height: 200,
    position: 'relative',
  },
  thumbnailContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnailImage: {
    flex: 1,
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  videoInfo: {
    padding: 16,
    gap: 8,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  instructorName: {
    fontSize: 14,
    fontWeight: '500',
  },
  videoMeta: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  difficultyChip: {
    height: 28,
  },
  categoryChip: {
    height: 28,
  },
  videoDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  playerContainer: {
    flex: 1,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 60,
  },
  playerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 16,
  },
  webView: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  playerInfo: {
    padding: 16,
    gap: 12,
  },
  playerDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  playerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    height: 32,
  },
});

export default ExerciseRecommendationsScreen; 