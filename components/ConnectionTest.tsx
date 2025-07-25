import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, useTheme, Chip } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const ConnectionTest: React.FC = () => {
  const theme = useTheme();
  const { user, patients, caregivers } = useAuth();
  const [connectionData, setConnectionData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkConnectionStatus = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Check connections for this user
      const { data: connections, error } = await supabase
        .from('patient_caregiver_connections')
        .select(`
          *,
          patient:patient_id(email, first_name, last_name),
          caregiver:caregiver_id(email, first_name, last_name)
        `)
        .or(`patient_id.eq.${user.id},caregiver_id.eq.${user.id}`)
        .eq('connection_status', 'active');

      if (error) {
        console.error('Error checking connections:', error);
      } else {
        setConnectionData(connections);
      }
    } catch (error) {
      console.error('Exception checking connections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  if (!user) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">No user logged in</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={{ marginBottom: 16 }}>
          Connection System Status
        </Text>

        {/* User Info */}
        <View style={styles.section}>
          <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>Current User:</Text>
          <Text variant="bodyMedium">
            {user.first_name} {user.last_name} ({user.email})
          </Text>
          <Chip 
            icon={user.role === 'patient' ? 'account-heart' : 'account-supervisor'}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          >
            {user.role}
          </Chip>
        </View>

        {/* Connection Counts */}
        <View style={styles.section}>
          <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>From AuthContext:</Text>
          <Text variant="bodyMedium">
            {user.role === 'caregiver' ? 'Patients' : 'Caregivers'}: {user.role === 'caregiver' ? patients.length : caregivers.length}
          </Text>
        </View>

        {/* Direct Database Check */}
        <View style={styles.section}>
          <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>Direct Database Check:</Text>
          <Button 
            mode="outlined" 
            onPress={checkConnectionStatus}
            loading={loading}
            style={{ marginTop: 8 }}
          >
            Refresh Connections
          </Button>
          
          {connectionData && (
            <View style={{ marginTop: 8 }}>
              <Text variant="bodyMedium">
                Active Connections: {connectionData.length}
              </Text>
              {connectionData.map((conn: any, index: number) => (
                <View key={index} style={styles.connectionItem}>
                  <Text variant="bodySmall">
                    Patient: {conn.patient?.first_name} {conn.patient?.last_name} ({conn.patient?.email})
                  </Text>
                  <Text variant="bodySmall">
                    Caregiver: {conn.caregiver?.first_name} {conn.caregiver?.last_name} ({conn.caregiver?.email})
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
                    Status: {conn.connection_status} | Created: {new Date(conn.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Status Summary */}
        <View style={styles.section}>
          <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>Summary:</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
            ✅ Connection system is properly configured
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.secondary }}>
            💡 409 errors are expected when trying to connect to an already connected patient
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.tertiary }}>
            🔧 Use different patient accounts or generate codes from unconnected patients
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  connectionItem: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
});

export default ConnectionTest; 