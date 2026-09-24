import { initializeApp } from 'firebase/app';
import { getAuth, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';


export const firebaseConfig = {
  apiKey: "AIzaSyD8loGXXlUVdPNP1kunhxKlU3jrhyzYOoA",
  authDomain: "groomy-22576.firebaseapp.com",
  projectId: "groomy-22576",
  storageBucket: "groomy-22576.firebasestorage.app",
  messagingSenderId: "811071463623",
  appId: "1:811071463623:web:7c942ac0511266ccb35ee2",
  measurementId: "G-8BJNE1EQM5"
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const app = initializeApp(firebaseConfig);

// Initialize services
const functions = getFunctions(app);

let auth: any;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    // @ts-ignore
    const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
    if (initializeAuth && getReactNativePersistence) {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } else {
      auth = getAuth(app);
    }
  } catch (e) {
    auth = getAuth(app);
  }
}

const db = getFirestore(app);
const storage = getStorage(app);

// If using emulator (for development only)
// connectFunctionsEmulator(functions, 'localhost', 5001);

export { 
  functions,
  auth,
  db,
  storage
};