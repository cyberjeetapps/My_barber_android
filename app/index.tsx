import { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
// App.js or your main navigator



export default function Index() {
  const { user, setUser, isLoading } = useAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      // Note: isLoading is managed by AuthProvider, not here
    });

    return () => unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.brandTitle}>MyBarber</Text>
        <Text style={styles.brandTagline}>Connecting every Salon in India</Text>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 24 }} />
        <Text style={styles.loadingText}>Starting up...</Text>
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/login" />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  brandTitle: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: Colors.primary,
  },
  brandTagline: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight || '#888',
    marginTop: 4,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text,
    fontFamily: 'Poppins-Regular',
  },
});