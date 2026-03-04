import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { oktaAuth } from './oktaConfig';

/**
 * LoginCallback component handles the redirect from Okta after authentication
 */
const LoginCallback: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Handle the callback and exchange code for tokens
        await oktaAuth.handleLoginRedirect();
        setLoading(false);
      } catch (err) {
        console.error('Login callback failed:', err);
        setError('Authentication failed. Please try again.');
        setLoading(false);
      }
    };

    handleCallback();
  }, []);

  if (error) {
    return (
      <div className="login-callback">
        <div className="login-callback-container">
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.href = '/'}>Return Home</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-callback">
        <div className="login-callback-container">
          <h2>Completing Sign In...</h2>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  // Redirect to home page after successful authentication
  return <Navigate to="/" replace />;
};

export default LoginCallback;