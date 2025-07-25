import React, { useEffect } from 'react';
import { StyleSheet, View, ScrollView, Dimensions } from 'react-native';
import { Text, useTheme, Avatar, Card, List, Button, Switch, Surface } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const AnimatedView = Animated.createAnimatedComponent(View);
const { width } = Dimensions.get('window');

const ProfileScreen: React.FC = () => {
  const { user, signOut, currentTheme, setCurrentTheme } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();

  // Animation for the entire screen content
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
    translateY.value = withSpring(0, { damping: 15 });
    scale.value = withSpring(1, { damping: 12 });
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!user) return null;

  const getInitials = (firstName?: string | null, lastName?: string | null): string => {
    const f = firstName?.[0] || '';
    const l = lastName?.[0] || '';
    return `${f}${l}`.toUpperCase() || 'U';
  };
  
  // Fix the name parsing issue
  const getDisplayName = () => {
    let firstName = '';
    let lastName = '';
    
    // Try to parse if first_name contains JSON
    if (user.first_name && typeof user.first_name === 'string' && user.first_name.startsWith('{')) {
      try {
        const parsed = JSON.parse(user.first_name);
        firstName = parsed.first_name || '';
        lastName = parsed.last_name || '';
      } catch (e) {
        firstName = user.first_name || '';
        lastName = user.last_name || '';
      }
    } else {
      firstName = user.first_name || '';
      lastName = user.last_name || '';
    }
    
    return `${firstName} ${lastName}`.trim() || 'Anonymous User';
  };

  const displayName = getDisplayName();
  const initials = getInitials(
    user.first_name?.startsWith('{') ? JSON.parse(user.first_name).first_name : user.first_name,
    user.first_name?.startsWith('{') ? JSON.parse(user.first_name).last_name : user.last_name
  );

  const handleNavigation = (screenName: string) => {
    navigation.navigate(screenName as never);
  };

  const isDarkMode = currentTheme === 'dark';

  const onToggleSwitch = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    if (setCurrentTheme) {
      setCurrentTheme(newTheme);
    }
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Modern Header with Gradient Background */}
      <AnimatedView style={[styles.headerContainer, animatedContainerStyle]}>
        <LinearGradient
          colors={user?.role === 'caregiver' ? ['#16c47e', '#11998e'] : ['#667eea', '#764ba2']}
          style={styles.gradientHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.profileHeader}>
            <Surface style={[styles.avatarContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]} elevation={0}>
              <Avatar.Text
                size={120}
                label={initials}
                style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.3)' }]}
                labelStyle={{ color: '#FFFFFF', fontSize: 36, fontWeight: 'bold' }}
              />
            </Surface>
            <Text variant="headlineLarge" style={styles.name}>
              {displayName}
            </Text>
            <Surface style={styles.emailBadge} elevation={1}>
              <Text variant="bodyMedium" style={styles.email}>
                {user.email}
              </Text>
            </Surface>
          </View>
        </LinearGradient>
      </AnimatedView>
      
      {/* Modern Cards with Enhanced Styling */}
      <Animated.View style={[styles.cardsContainer, animatedContainerStyle]}>
        {/* Account Section */}
        <Surface style={[styles.modernCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons 
              name="account-circle-outline" 
              size={24} 
              color={theme.colors.primary} 
            />
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              Account
            </Text>
          </View>
          
          <View style={styles.listContainer}>
            <List.Item
              title="Edit Profile"
              description="Update your personal information"
              left={props => <List.Icon {...props} icon="account-edit-outline" color={theme.colors.primary} />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => handleNavigation('EditProfile')}
              style={styles.listItem}
            />
            <View style={styles.divider} />
            <List.Item
              title="Manage Connections"
              description="Connect with caregivers or patients"
              left={props => <List.Icon {...props} icon="account-multiple-outline" color={theme.colors.primary} />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => handleNavigation('Connections')}
              style={styles.listItem}
            />
          </View>
        </Surface>

        {/* Preferences Section */}
        <Surface style={[styles.modernCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons 
              name="cog-outline" 
              size={24} 
              color={theme.colors.primary} 
            />
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              Preferences
            </Text>
          </View>
          
          <View style={styles.listContainer}>
            <List.Item
              title="Dark Mode"
              description={isDarkMode ? "Dark theme enabled" : "Light theme enabled"}
              left={props => <List.Icon {...props} icon="theme-light-dark" color={theme.colors.primary} />}
              right={() => (
                <Surface style={styles.switchContainer} elevation={0}>
                  <Switch value={isDarkMode} onValueChange={onToggleSwitch} />
                </Surface>
              )}
              style={styles.listItem}
            />
            <View style={styles.divider} />
          </View>
        </Surface>

        {/* Sign Out Section */}
        <Surface style={[styles.modernCard, styles.signOutCard]} elevation={2}>
          <List.Item
            title="Sign Out"
            description="Sign out of your account"
            titleStyle={{ color: theme.colors.error, fontWeight: '600' }}
            descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
            left={props => <List.Icon {...props} icon="logout" color={theme.colors.error} />}
            onPress={signOut}
            style={styles.listItem}
          />
        </Surface>
      </Animated.View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  headerContainer: {
    marginBottom: 24,
  },
  gradientHeader: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  profileHeader: {
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    borderRadius: 70,
    padding: 10,
    marginBottom: 8,
  },
  avatar: {
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  name: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  emailBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  email: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cardsContainer: {
    paddingHorizontal: 16,
    gap: 16,
  },
  modernCard: {
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  listContainer: {
    paddingBottom: 8,
  },
  listItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 20,
  },
  switchContainer: {
    backgroundColor: 'transparent',
  },
  signOutCard: {
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.2)',
  },
});

export default ProfileScreen; 