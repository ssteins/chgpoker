import React, { ReactNode } from 'react';
import { useAuth } from './AuthContext';
interface ProtectedRouteProps {
  children: ReactNode;
}
/**
 * ProtectedRoute component that requires authentication
 * - Shows loading spinner while checking authentication
 * - Shows login prompt if not authenticated
 * - Shows children if authenticated
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-container">
          <h2>Loading...</h2>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-prompt">
        <div className="login-prompt-container">
          <h1>🃏 Pointing Poker</h1>
          <h2>Sign In Required</h2>
          <p>Please sign in with your CHG Healthcare email to continue.</p>
          <button 
            onClick={login}
            className="login-button"
          >
            Sign In with Okta
          </button>
          <p className="login-note">
            Only @chghealthcare.com email addresses are allowed.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;