import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, FlatList } from 'react-native';
import { Button, Card, Text, ActivityIndicator, useTheme, HelperText, TextInput, Title, Paragraph, Avatar } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

const ConnectionsScreen = () => {
  const { user, initialLoading, loading } = useAuth(); // Use initialLoading (or loading)
  const theme = useTheme();
  const navigation = useNavigation();
  
  // Get role from user object
  const role = user?.role;

  // State for Patient View
  const [patientInvitation, setPatientInvitation] = useState<{ code: string; expires: string } | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // State for Caregiver View
  const [caregiverInviteCode, setCaregiverInviteCode] = useState('');
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState<string | null>(null);

  // State for connected users
  const [connectedUsers, setConnectedUsers] = useState<any[]>([]); // Replace 'any' with a proper type later
  const [isFetchingConnections, setIsFetchingConnections] = useState(false);
  const [fetchConnectionsError, setFetchConnectionsError] = useState<string | null>(null);

  // State for removing connection
  const [isRemovingConnection, setIsRemovingConnection] = useState<string | null>(null); // Store ID of user being removed
  const [removeConnectionError, setRemoveConnectionError] = useState<string | null>(null);
  const [removeConnectionSuccess, setRemoveConnectionSuccess] = useState<string | null>(null);

  const handleGenerateInvitation = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }
    
    // Check if user is a patient
    if (user.role !== 'patient') {
      console.log('ConnectionsScreen: Non-patient trying to generate invitation:', { 
        userRole: user.role, 
        userId: user.id 
      });
      Alert.alert('Error', 'Only patients can generate invitation codes. Caregivers should accept codes from patients.');
      return;
    }
    
    console.log('ConnectionsScreen: Generate invitation called for patient:', { 
      userId: user.id, 
      userRole: user.role 
    });
    
    setIsGeneratingInvite(true);
    setGenerateError(null);
    setPatientInvitation(null);
    try {
      // Get the current session to ensure we have a valid token
      console.log('1. Getting session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('Session data:', {
        sessionExists: !!session,
        userExists: !!session?.user,
        tokenExists: !!session?.access_token,
        userIdMatch: session?.user?.id === user.id,
        tokenLength: session?.access_token?.length
      });
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        console.error('No session found');
        throw new Error('No active session found. Please log in again.');
      }

      console.log('2. Calling function with headers...');
      console.log('Authorization header:', `Bearer ${session.access_token.substring(0, 20)}...`);

      const { data, error: funcError } = await supabase.functions.invoke('generate-invitation', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('3. Function response:', {
        data,
        error: funcError,
        hasError: !!funcError,
        errorMessage: funcError?.message,
        errorDetails: funcError?.details
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error.details || data.error.message);

      console.log('4. Success! Setting invitation:', data);
      setPatientInvitation({ code: data.invitation_code, expires: data.expires_at });
    } catch (err: any) {
      console.error('Error generating invitation:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        cause: err.cause
      });
      setGenerateError(err.message || 'Failed to generate invitation. Please try again.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }
    if (!caregiverInviteCode.trim()) {
      setAcceptError('Please enter an invitation code.');
      return;
    }
    setIsAcceptingInvite(true);
    setAcceptError(null);
    setAcceptSuccess(null);
    try {
      const { data, error: funcError } = await supabase.functions.invoke('accept-invitation-v2', {
        body: { invitation_code: caregiverInviteCode.trim() },
      });

      if (funcError) {
        // Check for specific error status if possible (depends on how funcError is structured)
        if (funcError.details && typeof funcError.details === 'string' && funcError.details.includes('409')) {
            setAcceptError('You are already connected to this patient.');
        } else if (funcError.details && typeof funcError.details === 'string' && funcError.details.includes('404')) {
            setAcceptError('Invalid or expired invitation code.');
        } else if (funcError.message.includes('already linked')) { // Fallback check on message
            setAcceptError('You are already connected to this patient.');
        } else if (funcError.message.includes('Invalid or expired')) { // Fallback check on message
            setAcceptError('Invalid or expired invitation code.');
        } else {
            console.error('Raw accept invitation error:', funcError);
            setAcceptError(`Error accepting invitation: ${funcError.message || 'Unknown error'}`);
        }
        return; // Stop execution if there was an error
      }
      
      setAcceptSuccess(data.message || 'Invitation accepted successfully!');
      setCaregiverInviteCode(''); // Clear input
      fetchConnections(); // Refetch connections after accepting one
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setAcceptError(err.message || 'Failed to accept invitation.');
    } finally {
      setIsAcceptingInvite(false);
    }
  };

  const handleRemoveConnection = async (otherUserId: string) => {
    Alert.alert(
      "Confirm Removal",
      "Are you sure you want to remove this connection? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsRemovingConnection(otherUserId);
            setRemoveConnectionError(null);
            setRemoveConnectionSuccess(null);
            try {
              const { data, error: funcError } = await supabase.functions.invoke('remove-connection', {
                body: { other_user_id: otherUserId },
              });

              if (funcError) throw funcError;
              if (data.error) throw new Error(data.error.details || data.error.message);

              setRemoveConnectionSuccess(data.message || 'Connection removed successfully!');
              fetchConnections(); // Refresh list
            } catch (err: any) {
              console.error('Error removing connection:', err);
              setRemoveConnectionError(err.message || 'Failed to remove connection.');
            }
            setIsRemovingConnection(null);
          }
        }
      ]
    );
  };

  // Function to fetch connections
  const fetchConnections = async () => {
    console.log('[ConnectionsScreen] fetchConnections called. User:', user, 'Role:', role, 'InitialLoading:', initialLoading);
    if (!user || !role) {
      console.log('[ConnectionsScreen] fetchConnections: Aborting, no user or role.');
      return;
    }
    // Use initialLoading to ensure profile and role are settled from AuthContext's first load cycle
    if (initialLoading) { 
      console.log('[ConnectionsScreen] fetchConnections: Aborting, initial auth data still loading.');
      return;
    }

    setIsFetchingConnections(true);
    setFetchConnectionsError(null);
    setConnectedUsers([]);

    try {
      let connectionQuery;
      if (role === 'patient') {
        connectionQuery = supabase
          .from('patient_caregiver_connections')
          .select(`
            id,
            caregiver_id,
            profiles:caregiver_id (
              id,
              full_name,
              email,
              avatar_url,
              role
            )
          `)
          .eq('patient_id', user.id)
          .eq('connection_status', 'active');
      } else if (role === 'caregiver') {
        connectionQuery = supabase
          .from('patient_caregiver_connections')
          .select(`
            id,
            patient_id,
            profiles:patient_id (
              id,
              full_name,
              email,
              avatar_url,
              role
            )
          `)
          .eq('caregiver_id', user.id)
          .eq('connection_status', 'active');
      } else {
        setIsFetchingConnections(false);
        return;
      }

      const { data, error: dbError } = await connectionQuery;

      if (dbError) {
        console.error('Error fetching connections:', dbError);
        setFetchConnectionsError(dbError.message);
        setConnectedUsers([]);
      } else if (data) {
        const users = data.map(item => item.profiles).filter(profile => profile != null);
        setConnectedUsers(users as any[]); 
      }
    } catch (e: any) {
      console.error('Catch error fetching connections:', e);
      setFetchConnectionsError(e.message || 'An unexpected error occurred.');
    } finally {
      setIsFetchingConnections(false);
    }
  };

  useEffect(() => {
    console.log('[ConnectionsScreen] useEffect triggered. User:', user, 'Role:', role, 'InitialLoading:', initialLoading);
    if (user && role && initialLoading === false) {
      console.log('[ConnectionsScreen] useEffect: Calling fetchConnections initially.');
      fetchConnections();
    }
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[ConnectionsScreen] Focus event. User:', user, 'Role:', role, 'InitialLoading:', initialLoading);
      setGenerateError(null); 
      setAcceptError(null);   
      setAcceptSuccess(null); 
      setFetchConnectionsError(null);
      if (user && role && initialLoading === false) {
        console.log('[ConnectionsScreen] Focus event: Calling fetchConnections.');
        fetchConnections();
      }
    });
    return unsubscribe;
  }, [user, role, initialLoading]); // Use initialLoading in dependency array and user.role for 'role'

  // Render connected users
  const renderConnectedUser = ({ item }: { item: any }) => ( 
    <Card style={styles.cardItem}>
      <Card.Title
        title={item.full_name || 'N/A'}
        subtitle={item.email || 'No email'}
        left={(props) => <Avatar.Image {...props} size={40} source={item.avatar_url ? { uri: item.avatar_url } : require('../assets/icon.png')} />}
      />
      <Card.Content>
        <Paragraph>Role: {item.role}</Paragraph>
      </Card.Content>
      <Card.Actions>
        <Button 
          icon="account-remove-outline"
          onPress={() => handleRemoveConnection(item.id)} 
          disabled={isRemovingConnection === item.id} // Disable button for this specific user if removal is in progress
          loading={isRemovingConnection === item.id}
          mode="outlined"
          textColor={theme.colors.error}
          style={{borderColor: theme.colors.error}}
        >
          Remove
        </Button>
      </Card.Actions>
    </Card>
  );

  if (initialLoading === true || (initialLoading === undefined && !user) ) { 
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text>Please log in to manage connections.</Text>
      </View>
    );
  }

  // Header for FlatList
  const listHeader = (
    <>
      <Title style={styles.pageTitle}>Manage Connections</Title>
      {isFetchingConnections && <ActivityIndicator animating={true} style={{ marginVertical: 20 }} />}
      {fetchConnectionsError && <HelperText type="error" visible={true} style={styles.errorText}>Error fetching connections: {fetchConnectionsError}</HelperText>}
      {role === 'patient' && (
        <Card style={styles.card}>
          <Card.Title title="Invite a Caregiver" />
          <Card.Content>
            <Button 
              mode="contained" 
              onPress={handleGenerateInvitation} 
              loading={isGeneratingInvite}
              disabled={isGeneratingInvite}
              style={styles.button}
              icon="qrcode-plus"
            >
              Generate New Invitation Code
            </Button>
            {generateError && <HelperText type="error" visible={!!generateError} style={styles.errorText}>{generateError}</HelperText>}
            {isGeneratingInvite && !patientInvitation && (
              <View style={styles.centeredSmallPadding}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8 }}>Generating code...</Text>
              </View>
            )}
            {patientInvitation && (
              <View style={styles.invitationContainer}>
                <Text variant="titleMedium" style={styles.subHeader}>Scan QR Code or Enter Code Manually</Text>
                <View style={styles.qrContainer}>
                  <QRCode 
                    value={patientInvitation.code} 
                    size={200} 
                    backgroundColor={theme.colors.surface}
                    color={theme.colors.onSurface}
                  />
                </View>
                <Text selectable style={styles.invitationCodeText}>Code: {patientInvitation.code}</Text>
                <Text style={styles.expiresText}>
                  Expires: {new Date(patientInvitation.expires).toLocaleString()}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      )}
      {role === 'caregiver' && (
        <Card style={styles.card}>
          <Card.Title title="Accept Patient Invitation" />
          <Card.Content>
            <TextInput
              label="Invitation Code"
              value={caregiverInviteCode}
              onChangeText={setCaregiverInviteCode}
              mode="outlined"
              style={styles.input}
              disabled={isAcceptingInvite}
              error={!!acceptError}
            />
            <Button 
              mode="contained" 
              onPress={handleAcceptInvitation} 
              loading={isAcceptingInvite}
              disabled={isAcceptingInvite}
              style={styles.button}
              icon="check-circle-outline"
            >
              Accept Invitation
            </Button>
            {acceptError && <HelperText type="error" visible={!!acceptError} style={styles.errorText}>{acceptError}</HelperText>}
            {acceptSuccess && <HelperText type="info" visible={!!acceptSuccess} style={styles.successText}>{acceptSuccess}</HelperText>}
          </Card.Content>
        </Card>
      )}
    </>
  );

  return (
    <FlatList
      data={connectedUsers}
      renderItem={renderConnectedUser}
      keyExtractor={item => item.id.toString()}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <View style={styles.sectionContainerAlt}>
          <Paragraph style={{textAlign: 'center'}}>
            {role === 'patient'
              ? 'You have not linked with any caregivers yet.'
              : 'You have not linked with any patients yet.'}
          </Paragraph>
        </View>
      }
      contentContainerStyle={styles.contentContainer}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32, 
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredSmallPadding: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    elevation: 2,
  },
  cardItem: { 
    marginBottom: 12,
    // backgroundColor: theme.colors.surfaceVariant, // theme cannot be used directly in StyleSheet
  },
  sectionContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    // backgroundColor: theme.colors.surface, 
    borderRadius: 8,
    elevation: 1, 
  },
  sectionContainerAlt: { 
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    // backgroundColor: theme.colors.surfaceDisabled, 
    borderRadius: 8,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
  },
  invitationContainer: {
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.05)', 
    borderRadius: 8,
  },
  subHeader: {
    marginBottom: 15,
    fontWeight: 'bold',
  },
  qrContainer: {
    marginBottom: 20,
    padding: 10, 
    backgroundColor: 'white',
    borderRadius: 5,
    elevation: 1,
  },
  invitationCodeText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'center',
  },
  expiresText: {
    fontSize: 14,
    color: 'gray',
    marginTop: 5,
    textAlign: 'center',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 10,
  },
  successText: {
    textAlign: 'center',
    marginBottom: 10,
    color: 'green', 
  },
});

export default ConnectionsScreen; 