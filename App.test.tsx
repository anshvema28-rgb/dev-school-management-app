import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, Button, Alert } from 'react-native'
import { supabase } from './supabaseClient'

export default function TestSupabaseScreen() {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Test connection by trying to select from a table
    // We'll use a simple approach - just check if the client initializes
    setConnected(true)
  }, [])

  const testConnection = async () => {
    try {
      // Try to get tables - this will fail if URL/key is wrong
      const { error } = await supabase.from('profiles').select('*').limit(1)
      if (error) {
        setError(error.message)
        Alert.alert('Supabase Error', error.message)
      } else {
        Alert.alert('Success', 'Connected to Supabase!')
      }
    } catch (err: any) {
      setError(err.message)
      Alert.alert('Connection Failed', err.message)
    }
  }

  if (!connected) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>Supabase Connection Test</Text>

      <Button title="Test Connection" onPress={testConnection} />

      {error && (
        <Text style={{ color: 'red', marginTop: 10 }}>{error}</Text>
      )}
    </View>
  )
}