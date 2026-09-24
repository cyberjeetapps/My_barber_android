import React from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean; errorMessage: string };

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMessage: error?.message || 'Unexpected error occurred' };
  }

  componentDidCatch(error: any, info: any) {
    console.log('ErrorBoundary caught:', error, info);
    Alert.alert('Something went wrong', error?.message || 'Unexpected app error');
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorTitle}>⚠️ Oops!</Text>
          <Text style={styles.errorText}>
            {this.state.errorMessage || 'An unexpected error occurred.'}
          </Text>
          <Text style={styles.retryText}>Please reload or restart the app.</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.error,
    marginBottom: 10,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 10,
  },
  retryText: {
    fontSize: 14,
    color: Colors.textLight,
  },
});
