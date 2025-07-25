# Parkinson's Management App

A comprehensive mobile application for Parkinson's disease patients and their caregivers, helping manage medications, track health metrics, follow recommended exercises, journal symptoms, and manage appointments.

## Features

- **Dual-Role System**: Separate interfaces for patients and caregivers
- **Medication Management**: Custom medication tracking with smart reminders
- **Health Tracking**: Monitor vital signs and Parkinson's symptoms
- **Exercise Recommendations**: Curated YouTube exercise videos
- **Journal Feature**: Track symptoms, mood, and attach photos
- **Appointment Management**: Schedule and manage medical appointments
- **Parkinson's Assessment**: Symptom questionnaires with educational content
- **Caregiver Notifications**: Alerts for medication adherence issues

## Technology Stack

- **Frontend**: React Native with Expo Go
- **UI Framework**: React Native Paper components
- **Backend**: Supabase (Authentication, Database, Storage, Edge Functions)
- **Notifications**: Expo Push Notifications
- **Media**: YouTube embedded videos

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm or Yarn
- Expo CLI
- Expo Go app on iOS/Android device for testing

### Installation

1. Clone the repository
   ```
   git clone https://github.com/NickolaiTheek/ParkinsonApp.git
   cd ParkinsonApp
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Start the development server
   ```
   npm start
   ```

4. Open the app on your device by scanning the QR code with Expo Go

## Project Structure

- `/components` - Reusable UI components
- `/screens` - App screens for different features
- `/lib` - Utility functions and Supabase client
- `/hooks` - Custom React hooks
- `/assets` - Images, fonts, and other static assets
- `/navigation` - Navigation configuration
- `/context` - React context providers

## Database Structure

The app uses a Supabase database with the following main tables:

- `profiles` - User information and roles
- `patient_health_info` - Patient-specific health information
- `patient_caregiver_connections` - Patient-caregiver relationships
- `medications` - Medication library
- `medication_schedules` - Scheduled medication times
- `medication_logs` - Tracking of taken/missed medications
- `health_metrics` - Health measurements tracking
- `exercise_videos` - Exercise video library
- `journal_entries` - Patient journal entries
- `appointments` - Medical appointments
- `notifications` - System notifications

## Testing

The app can be fully tested using Expo Go without any formal deployment. Both patient and caregiver functionalities can be tested simultaneously on different devices.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Resources for Parkinson's disease management
- Open-source libraries and tools used in this project
- Supabase for providing backend infrastructure 