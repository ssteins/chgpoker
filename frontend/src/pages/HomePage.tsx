import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { VotingOption, CreateRoomRequest, CreateRoomResponse } from '../../../shared/types';

import './HomePage.css';

/**
 * HomePage component for creating new pointing poker rooms
 * This is the landing page where users can set up a new poker session
 */
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, getAccessToken, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    ownerName: user?.name || user?.email?.split('@')[0] || '', // Pre-fill from Okta
    votingOption: 'fibonacci' as VotingOption,
    customVotingValues: ''
  });

  /**
   * Update form when user info changes
   */
  useEffect(() => {
    if (user && !formData.ownerName) {
      setFormData(prev => ({
        ...prev,
        ownerName: user.name || user.email?.split('@')[0] || ''
      }));
    }
  }, [user, formData.ownerName]);

  /**
   * Handle form input changes
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Clear action message after timeout
   */
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => {
        setActionMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  /**
   * Create a new poker room
   */
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get Okta token if authenticated
      let oktaToken: string | null = null;
      try {
        if (isAuthenticated) {
          oktaToken = await getAccessToken();
        }
      } catch (error) {
        console.log('Could not get access token, proceeding without auth');
      }

      const request: CreateRoomRequest = {
        title: formData.title || 'Planning Poker Session',
        description: formData.description,
        ownerName: formData.ownerName.trim(),
        votingOption: formData.votingOption,
        customVotingValues: formData.votingOption === 'custom' 
          ? formData.customVotingValues.split(',').map(v => v.trim()).filter(Boolean)
          : [],
        // Include Okta info if available
        oktaToken: oktaToken || undefined,
        email: user?.email || undefined
      };

      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data: CreateRoomResponse = await response.json();
      
      // Navigate to the room with the owner's user ID
      const owner = data.room.users.find(user => user.isOwner);
      if (owner) {
        navigate(`/room/${data.room.id}/play?userId=${owner.id}`);
      }
    } catch (error) {
      console.error('Error creating room:', error);
      setActionMessage('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <div className="home-container">
        {/* User info header */}
        {isAuthenticated && user && (
          <div className="user-header">
            <div className="user-info">
              <span className="user-email">{user.email}</span>
              <button 
                onClick={logout} 
                className="logout-button"
                type="button"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
        
        <div className="home-header">
          <h1 className="home-title">Pointing Poker</h1>
          <p className="home-subtitle">
            Create a planning poker session to estimate your user stories with your team
          </p>
        </div>

        {/* Action message for errors */}
        {actionMessage && (
          <div className="action-message action-message-error">
            {actionMessage}
          </div>
        )}

        {/* Form to create a new room */}
        <div className="create-room-card card">
          <div className="card-header">
            <h2 className="card-title">Create New Room</h2>
            <p className="card-subtitle">Set up your poker session and invite your team</p>
          </div>

          <form onSubmit={handleCreateRoom} className="create-room-form">
            {/* Owner name (required) */}
            <div className="form-group">
              <label htmlFor="ownerName" className="form-label">Your Name *</label>
              <input
                id="ownerName"
                name="ownerName"
                type="text"
                className="form-input"
                value={formData.ownerName}
                onChange={handleInputChange}
                required
                placeholder="Enter your name"
              />
            </div>

            {/* Room title */}
            <div className="form-group">
              <label htmlFor="title" className="form-label">Room Title</label>
              <input
                id="title"
                name="title"
                type="text"
                className="form-input"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Planning Poker Session"
              />
            </div>

            {/* Room description */}
            <div className="form-group">
              <label htmlFor="description" className="form-label">Description</label>
              <textarea
                id="description"
                name="description"
                className="form-textarea"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this planning session"
                rows={3}
              />
            </div>

            {/* Voting options */}
            <div className="form-group">
              <label htmlFor="votingOption" className="form-label">Voting Scale</label>
              <select
                id="votingOption"
                name="votingOption"
                className="form-select"
                value={formData.votingOption}
                onChange={handleInputChange}
              >
                <option value="fibonacci">Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?)</option>
                <option value="1-5">Simple (1, 2, 3, 4, 5, ?)</option>
                <option value="1-10">Linear (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ?)</option>
                <option value="evens">Even Numbers (2, 4, 6, 8, 10, 12, 14, 16, ?)</option>
                <option value="odds">Odd Numbers (1, 3, 5, 7, 9, 11, 13, 15, ?)</option>
                <option value="custom">Custom Values</option>
              </select>
            </div>

            {/* Custom voting values (only shown when custom is selected) */}
            {formData.votingOption === 'custom' && (
              <div className="form-group">
                <label htmlFor="customVotingValues" className="form-label">Custom Values</label>
                <input
                  id="customVotingValues"
                  name="customVotingValues"
                  type="text"
                  className="form-input"
                  value={formData.customVotingValues}
                  onChange={handleInputChange}
                  placeholder="XS, S, M, L, XL, XXL"
                />
                <small className="form-help">Separate values with commas (e.g., XS, S, M, L, XL)</small>
              </div>
            )}

            {/* Submit button */}
            <button 
              type="submit" 
              className="btn btn-primary w-full"
              disabled={loading || !formData.ownerName.trim()}
            >
              {loading ? 'Creating Room...' : 'Create Room'}
            </button>
          </form>
        </div>

        {/* Features section */}
        <div className="features-section">
          <h3 className="features-title">Features</h3>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">★</div>
              <h4>Real-time Voting</h4>
              <p>See when team members vote without revealing the actual estimates</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◆</div>
              <h4>Vote Statistics</h4>
              <p>Automatic calculation of averages and nearest Fibonacci numbers</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⏱️</div>
              <h4>Timer Support</h4>
              <p>Set time limits for voting sessions to keep discussions focused</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◇</div>
              <h4>Nudge Feature</h4>
              <p>Gently remind team members who haven't voted yet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;