import * as SecureStore from 'expo-secure-store';

// Validate key meets SecureStore requirements
const validateKey = (key: string): void => {
  if (!key || typeof key !== 'string') {
    throw new Error('SecureStore key must be a non-empty string.');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
    throw new Error(
      `Invalid SecureStore key "${key}". Keys can only contain letters, numbers, ".", "-", and "_".`
    );
  }
};

// Core SecureStore Wrapper
type SecureStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const secureStorage: SecureStorage = {
  getItem: async (key: string) => {
    try {
      validateKey(key);
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },

  setItem: async (key: string, value: string) => {
    try {
      validateKey(key);
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },

  removeItem: async (key: string) => {
    try {
      validateKey(key);
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  }
};

// App-specific wrapper
export const secureAuthStorage = {
  saveUser: async (userData: object) => {
    try {
      await secureStorage.setItem('auth_user', JSON.stringify(userData));
    } catch (error) {
      console.error('secureAuthStorage.saveUser error:', error);
    }
  },

  getUser: async () => {
    try {
      const user = await secureStorage.getItem('auth_user');
      return user ? JSON.parse(user) : null;
    } catch (error) {
      console.error('secureAuthStorage.getUser error:', error);
      return null;
    }
  },

  clearUser: async () => {
    try {
      await secureStorage.removeItem('auth_user');
    } catch (error) {
      console.error('secureAuthStorage.clearUser error:', error);
    }
  }
};

export default secureStorage;
