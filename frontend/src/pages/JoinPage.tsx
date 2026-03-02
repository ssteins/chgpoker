import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Room, JoinRoomRequest, JoinRoomResponse } from '../../../shared/types';
import './JoinPage.css';

/**
 * JoinPage component for joining an existing poker room
 * Users land here when they click on a room link shared by the room owner
 */
const JoinPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load room details when component mounts
   */
  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId) {
        setError('Invalid room link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/rooms/${roomId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Room not found. It may have been closed by the owner.');
          }
          throw new Error('Failed to load room details');
        }

        const roomData: Room = await response.json();
        setRoom(roomData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        setLoading(false);
      }
    };

    loadRoom();
  }, [roomId]);

  /**
   * Join the poker room
   */
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim() || !roomId) return;
    
    setJoining(true);
    setError(null);

    try {
      const request: JoinRoomRequest = {
        userName: userName.trim()
      };

      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to join room');
      }

      const data: JoinRoomResponse = await response.json();
      
      // Navigate to the room with the user's ID
      navigate(`/room/${roomId}/play?userId=${data.user.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setJoining(false);
    }
  };

  /**
   * Navigate back to home page
   */
  const handleGoHome = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="join-page">
        <div className="join-container">
          <div className="loading-card card text-center">
            <div className="loading-spinner"></div>
            <p>Loading room details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="join-page">
        <div className="join-container">
          <div className="error-card card text-center">
            <div className="error-icon">❌</div>
            <h2 className="error-title">Unable to Join Room</h2>
            <p className="error-message">{error}</p>
            <button onClick={handleGoHome} className="btn btn-primary mt-3">
              🏠 Go to Home Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return null;
  }

  return (
    <div className="join-page">
      <div className="join-container">
        {/* Room information */}
        <div className="room-info-card card">
          <div className="card-header">
            <h1 className="card-title">🃏 Join Poker Room</h1>
            <p className="card-subtitle">You're about to join an active planning session</p>
          </div>
          
          <div className="room-details">
            <div className="room-detail">
              <span className="detail-label">Room:</span>
              <span className="detail-value">{room.title}</span>
            </div>
            
            {room.description && (
              <div className="room-detail">
                <span className="detail-label">Description:</span>
                <span className="detail-value">{room.description}</span>
              </div>
            )}
            
            <div className="room-detail">
              <span className="detail-label">Voting Scale:</span>
              <span className="detail-value">
                {room.votingOption === 'fibonacci' && 'Fibonacci'}
                {room.votingOption === '1-5' && 'Simple (1-5)'}
                {room.votingOption === '1-10' && 'Linear (1-10)'}
                {room.votingOption === 'evens' && 'Even Numbers'}
                {room.votingOption === 'odds' && 'Odd Numbers'}
                {room.votingOption === 'custom' && `Custom (${room.customVotingValues.join(', ')})`}
              </span>
            </div>
            
            <div className="room-detail">
              <span className="detail-label">Participants:</span>
              <span className="detail-value">{room.users.length} member{room.users.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Join form */}
        <div className="join-form-card card">
          <div className="card-header">
            <h2 className="card-title">Enter Your Name</h2>
            <p className="card-subtitle">Choose a name that your team will recognize</p>
          </div>

          <form onSubmit={handleJoinRoom} className="join-form">
            <div className="form-group">
              <label htmlFor="userName" className="form-label">Your Name *</label>
              <input
                id="userName"
                type="text"
                className="form-input"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                placeholder="Enter your name"
                autoComplete="name"
                autoFocus
              />
              <small className="form-help">
                If someone already has this name, a number will be added to make it unique
              </small>
            </div>

            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}

            <div className="form-buttons">
              <button 
                type="button" 
                onClick={handleGoHome}
                className="btn btn-secondary"
                disabled={joining}
              >
                🏠 Go Home
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={joining || !userName.trim()}
              >
                {joining ? 'Joining...' : '🚀 Join Room'}
              </button>
            </div>
          </form>
        </div>

        {/* Current participants */}
        {room.users.length > 0 && (
          <div className="participants-card card">
            <h3 className="participants-title">Current Participants</h3>
            <div className="participants-list">
              {room.users.map((user) => (
                <div key={user.id} className="participant">
                  <span className="participant-name">
                    {user.name}
                    {user.isOwner && ' 👑'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinPage;