import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { UserClaims } from '@okta/okta-auth-js';
import { oktaAuth } from './oktaConfig';

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserClaims | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authenticated = await oktaAuth.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          const userInfo = await oktaAuth.getUser();
          setUser(userInfo);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    oktaAuth.authStateManager.subscribe(checkAuth);

    return () => {
      oktaAuth.authStateManager.unsubscribe(checkAuth);
    };
  }, []);

  const login = () => {
    oktaAuth.signInWithRedirect();
  };

  const logout = async () => {
    try {
      await oktaAuth.signOut();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    try {
      const accessToken = await oktaAuth.getAccessToken();
      return accessToken || null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  };

  const value = {
    isAuthenticated,
    user,
    isLoading,
    login,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};