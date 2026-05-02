import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Grammar BD Native</Text>
        <Text style={styles.subtitle}>Option A (React Native) starter</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next migration steps</Text>
        <Text style={styles.item}>1) Port SmartCreator UI</Text>
        <Text style={styles.item}>2) Move storage to AsyncStorage</Text>
        <Text style={styles.item}>3) Replace camera with expo-camera</Text>
        <Text style={styles.item}>4) Replace downloads with native share/files</Text>
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Start SmartCreator migration</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { marginTop: 12, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#475569' },
  card: { backgroundColor: 'white', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: '#1e293b' },
  item: { fontSize: 14, color: '#334155', marginBottom: 6 },
  button: { marginTop: 16, backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '700' }
});
