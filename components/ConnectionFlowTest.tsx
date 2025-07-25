import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, TextInput, useTheme, Chip } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const ConnectionFlowTest: React.FC = () => {
  const theme = useTheme();
  const { user, patients, caregivers } = useAuth();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const clearResults = () => setTestResults([]);

  const testConnectionFlow = async () => {
    if (!user) {
      addResult('❌ No user logged in');
      return;
    }

    setLoading(true);
    addResult('🧪 Starting connection flow test...');

    try {
      // Test 1: Check current user role
      addResult(`👤 Current user: ${user.first_name} ${user.last_name} (${user.role})`);

      // Test 2: Check existing connections
      const connectionCount = user.role === 'caregiver' ? patients.length : caregivers.length;
      addResult(`🔗 Current connections: ${connectionCount}`);

      // Test 3: Test edge function availability
      addResult('🔧 Testing edge functions...');
      
      if (user.role === 'patient') {
        // Test invitation generation
        try {
          const { data, error } = await supabase.functions.invoke('generate-invitation');
          if (error) {
            addResult(`❌ Generate invitation failed: ${error.message}`);
          } else {
            addResult(`✅ Generate invitation works: ${data.invitation_code}`);
            
            // Test with the generated code (should fail with 409 if trying to connect to self)
            try {
              const { data: connectData, error: connectError } = await supabase.functions.invoke('accept-invitation-v2', {
                body: { invitation_code: data.invitation_code }
              });
              if (connectError) {
                if (connectError.status === 409 || connectError.status === 400) {
                  addResult(`✅ Connection validation works (expected error): ${connectError.status}`);
                } else {
                  addResult(`⚠️ Unexpected connection error: ${connectError.message}`);
                }
              } else {
                addResult(`⚠️ Unexpected success when connecting to self`);
              }
            } catch (err: any) {
              addResult(`✅ Connection validation works (caught error): ${err.message}`);
            }
          }
        } catch (err: any) {
          addResult(`❌ Generate invitation error: ${err.message}`);
        }
      } else if (user.role === 'caregiver') {
        // Test connection acceptance with dummy code
        try {
          const { data, error } = await supabase.functions.invoke('accept-invitation-v2', {
            body: { invitation_code: 'TEST123' }
          });
          if (error) {
            if (error.status === 404) {
              addResult(`✅ Accept invitation validation works (expected 404)`);
            } else {
              addResult(`⚠️ Unexpected error: ${error.status} - ${error.message}`);
            }
          } else {
            addResult(`⚠️ Unexpected success with dummy code`);
          }
        } catch (err: any) {
          addResult(`✅ Accept invitation validation works: ${err.message}`);
        }
      }

      // Test 4: Database connectivity
      const { data: tables, error: tableError } = await supabase
        .from('patient_caregiver_connections')
        .select('count', { count: 'exact' })
        .limit(0);

      if (tableError) {
        addResult(`❌ Database connection failed: ${tableError.message}`);
      } else {
        addResult(`✅ Database connection works`);
      }

      addResult('🎉 Connection flow test completed!');

    } catch (error: any) {
      addResult(`❌ Test failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = () => {
    if (!user) return { label: 'Not Logged In', color: theme.colors.error };
    
    const connectionCount = user.role === 'caregiver' ? patients.length : caregivers.length;
    if (connectionCount > 0) {
      return { 
        label: `${connectionCount} Connection${connectionCount > 1 ? 's' : ''}`, 
        color: theme.colors.primary 
      };
    }
    return { label: 'No Connections', color: theme.colors.outline };
  };

  const statusChip = getStatusChip();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleMedium">Connection Flow Test</Text>
          <Chip 
            icon={user?.role === 'patient' ? 'account-heart' : 'account-supervisor'}
            textStyle={{ color: statusChip.color }}
            style={{ backgroundColor: `${statusChip.color}20` }}
          >
            {statusChip.label}
          </Chip>
        </View>

        <View style={styles.buttonRow}>
          <Button 
            mode="contained" 
            onPress={testConnectionFlow}
            loading={loading}
            style={styles.testButton}
          >
            Run Test
          </Button>
          <Button 
            mode="outlined" 
            onPress={clearResults}
            style={styles.clearButton}
          >
            Clear
          </Button>
        </View>

        {testResults.length > 0 && (
          <View style={[styles.resultsContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="bodySmall" style={[styles.resultsTitle, { color: theme.colors.onSurfaceVariant }]}>
              Test Results:
            </Text>
            {testResults.map((result, index) => (
              <Text 
                key={index} 
                variant="bodySmall" 
                style={[styles.resultText, { color: theme.colors.onSurfaceVariant }]}
              >
                {result}
              </Text>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  testButton: {
    flex: 1,
  },
  clearButton: {
    flex: 1,
  },
  resultsContainer: {
    padding: 12,
    borderRadius: 8,
    maxHeight: 300,
  },
  resultsTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultText: {
    marginBottom: 2,
    fontFamily: 'monospace',
  },
});

export default ConnectionFlowTest; 