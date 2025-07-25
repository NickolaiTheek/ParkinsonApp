import { MD3LightTheme, configureFonts } from 'react-native-paper';
import { Platform } from 'react-native';

const fontConfig = {
  customVariant: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
      default: 'System',
    }),
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.15,
    lineHeight: 24,
  },
};

export const Theme = {
  ...MD3LightTheme,
  dark: false,
  roundness: 8,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#5E5CE6',
    primaryContainer: '#E6E6FA',
    secondary: '#00C7BE',
    secondaryContainer: '#D7F8F6',
    tertiary: '#FF8C42',
    tertiaryContainer: '#FFF0E6',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceVariant: '#F8F9FA',
    surfaceDisabled: 'rgba(0, 0, 0, 0.08)',
    backdrop: 'rgba(0, 0, 0, 0.4)',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#2C2C8A',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#004D4A',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#66361A',
    onBackground: '#1C1C1E',
    onSurface: '#1C1C1E',
    onSurfaceVariant: '#495057',
    outline: '#DEE2E6',
    outlineVariant: '#CED4DA',
    error: '#D93025',
    errorContainer: '#FCE8E6',
    onError: '#FFFFFF',
    onErrorContainer: '#5C110D',
    appHeader: '#FFFFFF',
    textDimmed: '#6C757D',
    accentBlue: '#4A4AFF',
    accentRed: '#C00000',
    accentBrownish: '#D2691E',
  },
  fonts: configureFonts({ config: fontConfig as any }),
}; 