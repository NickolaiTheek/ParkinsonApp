import { Dimensions, PixelRatio } from 'react-native';

// Get screen dimensions
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Device type detection
export const DeviceTypes = {
  PHONE: 'phone',
  TABLET: 'tablet',
  LARGE_TABLET: 'large_tablet',
} as const;

// Breakpoints (in dp)
export const Breakpoints = {
  phone: 0,
  tablet: 600,
  largeTablet: 900,
} as const;

// Get current device type
export const getDeviceType = (): keyof typeof DeviceTypes => {
  if (screenWidth >= Breakpoints.largeTablet) {
    return DeviceTypes.LARGE_TABLET;
  }
  if (screenWidth >= Breakpoints.tablet) {
    return DeviceTypes.TABLET;
  }
  return DeviceTypes.PHONE;
};

// Check if device is tablet
export const isTablet = (): boolean => {
  return getDeviceType() !== DeviceTypes.PHONE;
};

// Check if device is large tablet (iPad Pro, etc.)
export const isLargeTablet = (): boolean => {
  return getDeviceType() === DeviceTypes.LARGE_TABLET;
};

// Responsive spacing system
export const getResponsiveSpacing = () => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return {
        xs: 6,
        sm: 12,
        md: 20,
        lg: 32,
        xl: 48,
        xxl: 64,
        padding: 32,
        margin: 24,
        cardPadding: 24,
        sectionGap: 40,
      };
    case DeviceTypes.TABLET:
      return {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 40,
        padding: 24,
        margin: 20,
        cardPadding: 20,
        sectionGap: 32,
      };
    default: // PHONE
      return {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 24,
        padding: 16,
        margin: 12,
        cardPadding: 16,
        sectionGap: 24,
      };
  }
};

// Responsive typography scale
export const getResponsiveFontSizes = () => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return {
        caption: 14,
        body: 18,
        bodyLarge: 20,
        title: 24,
        titleLarge: 28,
        headline: 32,
        display: 40,
      };
    case DeviceTypes.TABLET:
      return {
        caption: 12,
        body: 16,
        bodyLarge: 18,
        title: 20,
        titleLarge: 24,
        headline: 28,
        display: 34,
      };
    default: // PHONE
      return {
        caption: 11,
        body: 14,
        bodyLarge: 16,
        title: 18,
        titleLarge: 20,
        headline: 24,
        display: 28,
      };
  }
};

// Responsive grid system
export const getResponsiveColumns = (totalItems: number = 2) => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return Math.min(totalItems, 4); // Max 4 columns on large tablets
    case DeviceTypes.TABLET:
      return Math.min(totalItems, 3); // Max 3 columns on tablets
    default: // PHONE
      return Math.min(totalItems, 2); // Max 2 columns on phones
  }
};

// Calculate responsive width for grid items
export const getResponsiveItemWidth = (columns: number, gap: number = 16) => {
  return (screenWidth - (gap * (columns + 1))) / columns;
};

// Responsive card dimensions
export const getResponsiveCardSize = () => {
  const deviceType = getDeviceType();
  const spacing = getResponsiveSpacing();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return {
        minHeight: 140,
        padding: spacing.cardPadding,
        borderRadius: 20,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 8,
      };
    case DeviceTypes.TABLET:
      return {
        minHeight: 130,
        padding: spacing.cardPadding,
        borderRadius: 16,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
        elevation: 6,
      };
    default: // PHONE
      return {
        minHeight: 120,
        padding: spacing.cardPadding,
        borderRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        elevation: 4,
      };
  }
};

// Helper for responsive dimensions
export const wp = (percentage: number) => {
  return (percentage * screenWidth) / 100;
};

export const hp = (percentage: number) => {
  return (percentage * screenHeight) / 100;
};

// Normalize pixel values for different screen densities
export const normalize = (size: number) => {
  const newSize = size * PixelRatio.get();
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Container max width for large screens
export const getContainerMaxWidth = () => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return 1200; // Max width for very large tablets
    case DeviceTypes.TABLET:
      return 800;  // Max width for tablets
    default:
      return screenWidth; // Full width for phones
  }
};

// Responsive margins for centered content on large screens
export const getResponsiveContainerStyle = () => {
  const maxWidth = getContainerMaxWidth();
  const spacing = getResponsiveSpacing();
  
  return {
    maxWidth,
    width: '100%',
    marginHorizontal: 'auto' as const,
    paddingHorizontal: screenWidth > maxWidth ? spacing.xl : spacing.padding,
  };
};

// Export screen dimensions for direct use
export const screenDimensions = {
  width: screenWidth,
  height: screenHeight,
};

// Responsive icon sizes
export const getResponsiveIconSize = () => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return {
        small: 20,
        medium: 28,
        large: 36,
        xl: 44,
      };
    case DeviceTypes.TABLET:
      return {
        small: 18,
        medium: 24,
        large: 32,
        xl: 40,
      };
    default: // PHONE
      return {
        small: 16,
        medium: 20,
        large: 24,
        xl: 32,
      };
  }
};

// Avatar sizes for different devices
export const getResponsiveAvatarSize = () => {
  const deviceType = getDeviceType();
  
  switch (deviceType) {
    case DeviceTypes.LARGE_TABLET:
      return {
        small: 40,
        medium: 60,
        large: 80,
        xl: 120,
      };
    case DeviceTypes.TABLET:
      return {
        small: 36,
        medium: 50,
        large: 70,
        xl: 100,
      };
    default: // PHONE
      return {
        small: 32,
        medium: 40,
        large: 50,
        xl: 80,
      };
  }
}; 