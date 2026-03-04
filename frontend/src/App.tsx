
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Security } from '@okta/okta-react';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginCallback from './auth/LoginCallback';
import HomePage from './pages/HomePage.tsx';
import RoomPage from './pages/RoomPage.tsx';
import JoinPage from './pages/JoinPage.tsx';
import { oktaAuth } from './auth/oktaConfig';
import './App.css';
import './auth/auth.css';

/**
 * Main App component that handles routing between different pages
 * - HomePage: Landing page where users can create new rooms
 * - JoinPage: Page for joining existing rooms  
 * - RoomPage: The main poker room interface
 * - LoginCallback: Handles Okta authentication callback
 * 
 * Note: Authentication is optional - existing functionality preserved
 */
function App() {
  const restoreOriginalUri = async (_oktaAuth: any, originalUri: string) => {
    window.location.replace(originalUri || '/');
  };

  return (
    <Router>
      <Security 
        oktaAuth={oktaAuth} 
        restoreOriginalUri={restoreOriginalUri}
      >
        <AuthProvider>
          <div className="app">
            <Routes>
              {/* Okta login callback */}
              <Route path="/login/callback" element={<LoginCallback />} />
              
              {/* Home page for creating new rooms - requires auth */}
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Join page - allows guest access for easier joining */}
              <Route 
                path="/room/:roomId" 
                element={<JoinPage />}
              />
              
              {/* Main poker room interface - allows guest access to preserve functionality */}
              <Route 
                path="/room/:roomId/play" 
                element={<RoomPage />}
              />
            </Routes>
          </div>
        </AuthProvider>
      </Security>
    </Router>
  );
}

export default App;