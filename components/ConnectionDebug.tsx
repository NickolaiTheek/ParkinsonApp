import React, { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ConnectionDebug: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string>('');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setResults(prev => `${prev}\n[${timestamp}] ${message}`);
  };

  const clearLogs = () => setResults('');

  const checkTables = async () => {
    setLoading(true);
    addLog('🔍 Checking database tables...');

    try {
      // Check if tables exist
      const { data: tables, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['linking_invitations', 'patient_caregiver_connections', 'profiles']);

      if (error) {
        addLog(`❌ Error checking tables: ${error.message}`);
      } else {
        addLog(`✅ Found tables: ${tables.map(t => t.table_name).join(', ')}`);
      }
    } catch (err: any) {
      addLog(`❌ Exception checking tables: ${err.message}`);
    }

    setLoading(false);
  };

  const checkUserProfile = async () => {
    setLoading(true);
    addLog('👤 Checking user profile...');

    if (!user) {
      addLog('❌ No user logged in');
      setLoading(false);
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        addLog(`❌ Profile error: ${error.message}`);
      } else {
        addLog(`✅ Profile found: ${profile.email}, Role: ${profile.role || profile.user_type}`);
        addLog(`   Name: ${profile.first_name} ${profile.last_name}`);
      }
    } catch (err: any) {
      addLog(`❌ Exception checking profile: ${err.message}`);
    }

    setLoading(false);
  };

  const checkConnections = async () => {
    setLoading(true);
    addLog('🔗 Checking connections...');

    if (!user) {
      addLog('❌ No user logged in');
      setLoading(false);
      return;
    }

    try {
      const { data: connections, error } = await supabase
        .from('patient_caregiver_connections')
        .select('*')
        .or(`patient_id.eq.${user.id},caregiver_id.eq.${user.id}`);

      if (error) {
        addLog(`❌ Connections error: ${error.message}`);
      } else {
        addLog(`✅ Found ${connections.length} connections`);
        connections.forEach((conn, i) => {
          addLog(`   ${i + 1}. Patient: ${conn.patient_id}, Caregiver: ${conn.caregiver_id}, Status: ${conn.connection_status}`);
        });
      }
    } catch (err: any) {
      addLog(`❌ Exception checking connections: ${err.message}`);
    }

    setLoading(false);
  };

  const checkInvitations = async () => {
    setLoading(true);
    addLog('📧 Checking invitations...');

    if (!user) {
      addLog('❌ No user logged in');
      setLoading(false);
      return;
    }

    try {
      const { data: invitations, error } = await supabase
        .from('linking_invitations')
        .select('*')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        addLog(`❌ Invitations error: ${error.message}`);
      } else {
        addLog(`✅ Found ${invitations.length} invitations`);
        invitations.forEach((inv, i) => {
          addLog(`   ${i + 1}. Code: ${inv.invitation_code}, Status: ${inv.status}, Expires: ${new Date(inv.expires_at).toLocaleString()}`);
        });
      }
    } catch (err: any) {
      addLog(`❌ Exception checking invitations: ${err.message}`);
    }

    setLoading(false);
  };

  const testGenerateInvitation = async () => {
    setLoading(true);
    addLog('🎯 Testing invitation generation...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-invitation');

      if (error) {
        addLog(`❌ Generate invitation error: ${error.message}`);
      } else {
        addLog(`✅ Generated invitation: ${data.invitation_code}`);
        addLog(`   Expires: ${new Date(data.expires_at).toLocaleString()}`);
      }
    } catch (err: any) {
      addLog(`❌ Exception generating invitation: ${err.message}`);
    }

    setLoading(false);
  };

  const [testCode, setTestCode] = useState('');

  const testAcceptInvitation = async () => {
    if (!testCode.trim()) {
      Alert.alert('Error', 'Please enter an invitation code');
      return;
    }

    setLoading(true);
    addLog(`🤝 Testing invitation acceptance with code: ${testCode}`);

    try {
      const { data, error } = await supabase.functions.invoke('accept-invitation-v2', {
        body: { invitation_code: testCode.trim() }
      });

      if (error) {
        addLog(`❌ Accept invitation error: ${error.message}`);
      } else {
        addLog(`✅ Successfully accepted invitation!`);
        addLog(`   Response: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      addLog(`❌ Exception accepting invitation: ${err.message}`);
    }

    setLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Card style={{ marginBottom: 16 }}>
        <Card.Content>
          <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
            Connection System Debug Tools
          </Text>
          
          <View style={{ gap: 8, marginBottom: 16 }}>
            <Button mode="outlined" onPress={checkTables} loading={loading}>
              Check Database Tables
            </Button>
            <Button mode="outlined" onPress={checkUserProfile} loading={loading}>
              Check User Profile
            </Button>
            <Button mode="outlined" onPress={checkConnections} loading={loading}>
              Check Connections
            </Button>
            <Button mode="outlined" onPress={checkInvitations} loading={loading}>
              Check Invitations
            </Button>
          </View>

          {user?.role === 'patient' && (
            <Button mode="contained" onPress={testGenerateInvitation} loading={loading}>
              Test Generate Invitation
            </Button>
          )}

          {user?.role === 'caregiver' && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput
                mode="outlined"
                label="Test Invitation Code"
                value={testCode}
                onChangeText={setTestCode}
                placeholder="Enter code to test"
              />
              <Button mode="contained" onPress={testAcceptInvitation} loading={loading}>
                Test Accept Invitation
              </Button>
            </View>
          )}

          <Button mode="text" onPress={clearLogs} style={{ marginTop: 8 }}>
            Clear Logs
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>
            Debug Log
          </Text>
          <ScrollView 
            style={{ 
              height: 300, 
              backgroundColor: '#f5f5f5', 
              padding: 8, 
              borderRadius: 4 
            }}
          >
            <Text variant="bodySmall" style={{ fontFamily: 'monospace' }}>
              {results || 'Run debug commands to see results...'}
            </Text>
          </ScrollView>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

export default ConnectionDebug; 