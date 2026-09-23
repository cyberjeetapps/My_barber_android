import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { useRouter, usePathname } from 'expo-router';

// Extend User type with our custom fields
type AppUser = User & {
  role?: string;
  name?: string;
  phoneNumber?: string | null | undefined;
  shops?: string[];
  isLoggedIn?: boolean;
  profileImageUrl?: string;
  gender?: string;
};

type AuthContextType = {
  user: AppUser | null;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isAdmin: boolean;
  owner: AppUser | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  isLoading: true,
  setIsLoading: () => {},
  isAdmin: false,
  owner: null,
  logout: async () => {},
});

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [owner, setOwner] = useState<AppUser | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Don't process auth state changes during logout
      if (isLoggingOut) return;

      try {
        if (firebaseUser) {
          // Check admin status first
          const adminRef = doc(db, 'admins', firebaseUser.uid);
          const adminSnap = await getDoc(adminRef);

          if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            const updatedUser = {
              ...firebaseUser,
              ...adminData,
              role: 'admin',
            } as AppUser;
            if (isMounted) {
              setUser(updatedUser);
              setIsAdmin(true);
            }
            return;
          }

          // Check owner status
          const ownerRef = doc(db, 'barberowner', firebaseUser.uid);
          const ownerSnap = await getDoc(ownerRef);

          if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data();
            const ownerUser = {
              ...firebaseUser,
              ...ownerData,
              role: 'owner',
            } as AppUser;
            if (isMounted) {
              setUser(ownerUser);
              setOwner(ownerUser);
            }
          } else {
            // For regular users, ensure we have their profile data
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (isMounted) {
              if (userSnap.exists()) {
                setUser({
                  ...firebaseUser,
                  ...userSnap.data(),
                  role: 'user',
                } as AppUser);
              } else {
                setUser({
                  ...firebaseUser,
                  role: 'user',
                } as AppUser);
              }
            }
          }
          if (isMounted) {
            setIsAdmin(false);
          }
        } else {
          // Attempt silent session restoration from saved session before redirecting to login
          let restored = false;
          try {
            const rawSession = Platform.OS === 'web'
              ? localStorage.getItem('user_session')
              : await SecureStore.getItemAsync('user_session');

            if (rawSession) {
              const { phoneNumber } = JSON.parse(rawSession);
              if (phoneNumber) {
                const email = `${phoneNumber}@twilio.user`;
                const password = phoneNumber;
                await signInWithEmailAndPassword(auth, email, password);
                restored = true;
                return; // onAuthStateChanged will fire again with the restored firebaseUser
              }
            }
          } catch (restoreErr) {
            console.log('Silent session check skipped or failed:', restoreErr);
          }

          if (!restored && isMounted) {
            setUser(null);
            setIsAdmin(false);
            setOwner(null);
            
            // Only redirect to login for explicitly protected admin and owner dashboards.
            // NEVER kick the user to /login when they are on customer routes,
            // in the middle of booking (/services), or browsing tabs (/(tabs)).
            if (!isLoggingOut) {
              const currentPath = pathname || '';
              const isProtectedAdminRoute = currentPath.startsWith('/admin') && !currentPath.includes('/admin/login');
              const isProtectedOwnerRoute = currentPath.startsWith('/owner') && !currentPath.includes('/owner/login');

              if (isProtectedAdminRoute) {
                router.replace('/admin/login');
              } else if (isProtectedOwnerRoute) {
                router.replace('/owner/login');
              }
              // Customer routes (/(tabs), /services, /return, etc.) are NEVER interrupted or kicked to /login.
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        if (isMounted) {
          setUser(firebaseUser as AppUser);
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isLoggingOut]);

  const logout = async () => {
    try {
      setIsLoggingOut(true);
      
      // Update Firestore status if user exists
      if (user?.uid) {
        try {
          const collection = user?.role === 'owner' ? 'barberowner' : 'users';
          const userRef = doc(db, collection, user.uid);
          await updateDoc(userRef, {
            isLoggedIn: false,
            lastLogout: new Date().toISOString(),
          });
        } catch (firestoreError) {
          console.warn('Firestore update failed:', firestoreError);
        }
      }

      // Clear storage
      await clearStorage();
      
      // Clear context state
      setUser(null);
      setOwner(null);
      setIsAdmin(false);
      
      // Sign out from Firebase
      await firebaseSignOut(auth);
      
      console.log('✅ Logout completed successfully');
      
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setIsLoggingOut(false);
    }
  };

  const clearStorage = async () => {
    // Clear all possible session storage keys
    const storageKeys = ['user_session', 'owner_session', 'admin_session'];
    
    for (const key of storageKeys) {
      try {
        if (Platform.OS === 'web') {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } else {
          await SecureStore.deleteItemAsync(key);
        }
      } catch (error) {
        console.log(`Error clearing ${key}:`, error);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, setIsLoading, isAdmin, owner, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};