
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.tsx';
import RoomPage from './pages/RoomPage.tsx';
import JoinPage from './pages/JoinPage.tsx';
import './App.css';

/**
 * Main App component that handles routing between different pages
 * - HomePage: Landing page where users can create new rooms
 * - JoinPage: Page for joining existing rooms
 * - RoomPage: The main poker room interface
 */
function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          {/* Home page for creating new rooms */}
          <Route path="/" element={<HomePage />} />
          
          {/* Join page for entering room with a link */}
          <Route path="/room/:roomId" element={<JoinPage />} />
          
          {/* Main poker room interface */}
          <Route path="/room/:roomId/play" element={<RoomPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;