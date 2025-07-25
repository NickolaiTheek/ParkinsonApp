import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import {
  getDeviceType,
  isTablet,
  isLargeTablet,
  getResponsiveSpacing,
  getResponsiveFontSizes,
  getResponsiveColumns,
  getResponsiveCardSize,
  getContainerMaxWidth,
  getResponsiveContainerStyle,
  getResponsiveIconSize,
  getResponsiveAvatarSize,
  screenDimensions,
  DeviceTypes,
} from '../lib/responsive';

export const useResponsive = () => {
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  return {
    // Device detection
    deviceType: getDeviceType(),
    isTablet: isTablet(),
    isLargeTablet: isLargeTablet(),
    isPhone: !isTablet(),
    
    // Screen dimensions
    width: dimensions.width,
    height: dimensions.height,
    
    // Responsive values
    spacing: getResponsiveSpacing(),
    fontSizes: getResponsiveFontSizes(),
    cardSize: getResponsiveCardSize(),
    iconSizes: getResponsiveIconSize(),
    avatarSizes: getResponsiveAvatarSize(),
    containerStyle: getResponsiveContainerStyle(),
    maxWidth: getContainerMaxWidth(),
    
    // Grid helpers
    getColumns: getResponsiveColumns,
    
    // Breakpoint checks
    isMobile: dimensions.width < 600,
    isTabletSize: dimensions.width >= 600 && dimensions.width < 900,
    isLargeTabletSize: dimensions.width >= 900,
  };
}; 