import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Room, User, SSEEvent, VoteStats } from '../../../shared/types';
import './RoomPage.css';

/**
 * RoomPage component - the main poker room interface
 */
const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const { getAccessToken } = useAuth();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [voteStats, setVoteStats] = useState<VoteStats | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | number | null>(null);
  // const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState(false);
  const [preparingVote, setPreparingVote] = useState(false);
  const [ownerParticipating, setOwnerParticipating] = useState(true);
  const [roomForm, setRoomForm] = useState({ title: '', description: '', jiraId: '' });
  const [copyIndicator, setCopyIndicator] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  // Store user data in localStorage for persistence across refreshes
  const storeUserData = (roomData: Room, userData: User) => {
    if (roomId && userId) {
      localStorage.setItem(`poker_user_${roomId}`, JSON.stringify({
        userId: userData.id,
        userName: userData.name,
        isOwner: userData.isOwner,
        roomId: roomId,
        timestamp: Date.now()
      }));
    }
  };

  // Get stored user data
  const getStoredUserData = () => {
    if (!roomId) return null;
    const stored = localStorage.getItem(`poker_user_${roomId}`);
    if (!stored) return null;
    try {
      const data = JSON.parse(stored);
      // Check if data is less than 7 days old
      if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return data;
      }
    } catch (e) {}
    return null;
  };

  // Helper function to get auth token for protected requests
  const getAuthToken = async (): Promise<string | null> => {
    try {
      return await getAccessToken();
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!roomId || !userId) {
      navigate('/');
      return;
    }

    const initializeRoom = async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}`);
        if (!response.ok) throw new Error('Room not found');
        
        const roomData: Room = await response.json();
        setRoom(roomData);
        
        let user = roomData.users.find(u => u.id === userId);
        
        // If user not found but we have stored data, try to rejoin
        if (!user) {
          const storedData = getStoredUserData();
          if (storedData && storedData.userId === userId) {
            try {
              const rejoinResponse = await fetch(`/api/rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: storedData.userName })
              });
              
              if (rejoinResponse.ok) {
                const rejoinData = await rejoinResponse.json();
                setRoom(rejoinData.room);
                user = rejoinData.user;
                // Update URL with new user ID if it changed
                if (user && user.id !== userId) {
                  navigate(`/room/${roomId}/play?userId=${user.id}`, { replace: true });
                  return; // Let the component re-initialize with new URL
                }
              }
            } catch (rejoinError) {
              console.error('Failed to rejoin room:', rejoinError);
            }
          }
        }
        
        if (!user) {
          // If user not found, try one more time to rejoin the room gracefully
          const storedData = getStoredUserData();
          if (storedData && storedData.userId === userId) {
            setActionMessage('Reconnecting to room...');
            try {
              const rejoinResponse = await fetch(`/api/rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: storedData.userName })
              });
              
              if (rejoinResponse.ok) {
                const rejoinData = await rejoinResponse.json();
                user = rejoinData.user;
                setRoom(rejoinData.room);
                
                // Update URL with new user ID if it changed
                if (user && user.id !== userId) {
                  navigate(`/room/${roomId}/play?userId=${user.id}`, { replace: true });
                  return;
                }
                setActionMessage(null);
              }
            } catch (rejoinError) {
              console.error('Final rejoin attempt failed:', rejoinError);
            }
          }
          
          if (!user) {
            // Last resort: redirect to join page instead of showing error
            setActionMessage('Session expired. Redirecting to rejoin...');
            setTimeout(() => {
              navigate(`/room/${roomId}`, { replace: true });
            }, 2000);
            return;
          }
        }
        
        setCurrentUser(user);
        storeUserData(roomData, user);
        
        setRoomForm({
          title: roomData.title,
          description: roomData.description,
          jiraId: roomData.jiraId || ''
        });
        
        const eventSource = new EventSource(`/api/rooms/${roomId}/events?userId=${userId}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
          try {
            const sseEvent: SSEEvent = JSON.parse(event.data);
            handleSSEEvent(sseEvent);
          } catch (err) {
            console.error('Error parsing SSE event:', err);
          }
        };
        
        eventSource.onerror = (error) => {
          console.log('SSE connection error:', error);
          // Don't immediately reload - try to reconnect gracefully
          if (eventSource.readyState === EventSource.CLOSED) {
            setActionMessage('Connection lost. Attempting to reconnect...');
            setTimeout(() => {
              // Check if we're still on the same page before reloading
              if (window.location.pathname.includes(`/room/${roomId}/play`)) {
                window.location.reload();
              }
            }, 3000);
          }
        };
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        setLoading(false);
      }
    };

    initializeRoom();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [roomId, userId, navigate]);

  const handleSSEEvent = (event: SSEEvent) => {
    console.log('Received SSE event:', event.type, event.data);
    
    switch (event.type) {
      case 'room-updated':
        if (event.data.message) {
          // Handle removal or other message events
          if (event.data.message.includes('removed from the room')) {
            setActionMessage(event.data.message);
            setTimeout(() => {
              navigate('/', { replace: true });
            }, 3000);
          } else if (event.data.message.includes('closed by the owner')) {
            setActionMessage('Room has been closed by the owner');
            setTimeout(() => {
              navigate('/', { replace: true });
            }, 3000);
          }
        } else {
          setRoom(event.data);
          // Clear selected vote when a new voting round starts
          if (event.data.isVotingActive && !event.data.votesRevealed) {
            setSelectedVote(null);
          }
          // Update current user data if it's included in the room update
          if (currentUser && event.data.users) {
            const updatedUser = event.data.users.find((u: User) => u.id === currentUser.id);
            if (updatedUser) {
              setCurrentUser(updatedUser);
            }
          }
        }
        break;
      case 'user-joined':
      case 'user-left':
        setRoom(event.data.room);
        break;
      case 'vote-cast':
        setRoom(prev => {
          if (!prev) return prev;
          const updatedUsers = prev.users.map(user => 
            user.id === event.data.userId 
              ? { ...user, hasVoted: event.data.hasVoted }
              : user
          );
          return { ...prev, users: updatedUsers };
        });
        // Update current user if it's our vote
        if (currentUser && event.data.userId === currentUser.id) {
          setCurrentUser(prev => prev ? { ...prev, hasVoted: event.data.hasVoted } : prev);
        }
        break;
      case 'votes-revealed':
        setRoom(event.data.room);
        setVoteStats(event.data.stats);
        break;
      case 'timer-started':
        // setTimerRemaining(event.data.duration);
        break;
      case 'timer-tick':
        // setTimerRemaining(event.data.remaining);
        break;
      case 'timer-ended':
        // setTimerRemaining(null);
        setRoom(event.data.room);
        setVoteStats(event.data.stats);
        break;
    }
  };

  const handleVote = async (vote: string | number) => {
    if (!room || !currentUser || !room.isVotingActive) return;
    
    try {
      const response = await fetch(`/api/rooms/${roomId}/vote?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: String(vote) })
      });
      
      if (!response.ok) throw new Error('Failed to cast vote');
      setSelectedVote(vote);
    } catch (err) {
      console.error('Error casting vote:', err);
      setActionMessage('Failed to cast vote');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const getVotingOptions = (): (string | number)[] => {
    if (!room) return [];
    if (room.votingOption === 'custom') {
      return [...room.customVotingValues, '?'];
    }
    
    // Define voting options inline
    const votingOptions = {
      fibonacci: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'],
      '1-5': [1, 2, 3, 4, 5, '?'],
      '1-10': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '?'],
      evens: [2, 4, 6, 8, 10, 12, 14, 16, '?'],
      odds: [1, 3, 5, 7, 9, 11, 13, 15, '?']
    };
    
    return votingOptions[room.votingOption] || [];
  };

  const handlePrepareVote = () => {
    setRoomForm({
      title: room?.title || '',
      description: room?.description || '',
      jiraId: room?.jiraId || ''
    });
    setPreparingVote(true);
  };

  const handleStartVoting = async () => {
    try {
      const oktaToken = await getAuthToken();
      if (!oktaToken) {
        setActionMessage('Authentication required to start voting');
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }

      const response = await fetch(`/api/rooms/${roomId}/start-voting?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oktaToken, ownerParticipating })
      });
      if (!response.ok) throw new Error('Failed to start voting');
      setSelectedVote(null);
      setVoteStats(null);
      setPreparingVote(false);
    } catch (err) {
      setActionMessage('Failed to start voting');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleStartVotingWithStory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const oktaToken = await getAuthToken();
      if (!oktaToken) {
        setActionMessage('Authentication required to update room and start voting');
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }

      // Update room details first
      const roomResponse = await fetch(`/api/rooms/${roomId}/settings?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...roomForm, oktaToken })
      });
      if (!roomResponse.ok) throw new Error('Failed to update room');

      // Then start voting with owner participation flag
      const voteResponse = await fetch(`/api/rooms/${roomId}/start-voting?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oktaToken, ownerParticipating })
      });
      if (!voteResponse.ok) throw new Error('Failed to start voting');
      
      setSelectedVote(null);
      setVoteStats(null);
      setPreparingVote(false);
    } catch (err) {
      setActionMessage('Failed to start voting session');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleRevealVotes = async () => {
    try {
      const oktaToken = await getAuthToken();
      if (!oktaToken) {
        setActionMessage('Authentication required to reveal votes');
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }

      const response = await fetch(`/api/rooms/${roomId}/reveal?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oktaToken })
      });
      if (!response.ok) throw new Error('Failed to reveal votes');
    } catch (err) {
      setActionMessage('Failed to reveal votes');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const oktaToken = await getAuthToken();
      if (!oktaToken) {
        setActionMessage('Authentication required to update room');
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }

      const response = await fetch(`/api/rooms/${roomId}/settings?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...roomForm, oktaToken })
      });
      if (!response.ok) throw new Error('Failed to update room');
      setEditingRoom(false);
    } catch (err) {
      setActionMessage('Failed to update room');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handlePublishAndStartVoting = async () => {
    try {
      // First update room settings if edited
      if (editingRoom) {
        const roomResponse = await fetch(`/api/rooms/${roomId}/settings?userId=${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(roomForm)
        });
        if (!roomResponse.ok) throw new Error('Failed to update room');
        setEditingRoom(false);
      }

      // Then start voting
      const response = await fetch(`/api/rooms/${roomId}/start-voting?userId=${userId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to start voting');
      setSelectedVote(null);
      setVoteStats(null);
    } catch (err) {
      setActionMessage('Failed to publish changes and start voting');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleCopyLink = async () => {
    try {
      const link = `${window.location.origin}/room/${roomId}`;
      await navigator.clipboard.writeText(link);
      setCopyIndicator(true);
      setTimeout(() => setCopyIndicator(false), 2000);
    } catch (err) {
      setActionMessage('Failed to copy link');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleRemoveUser = async (userIdToRemove: string, userName: string) => {
    if (!room || !currentUser || !currentUser.isOwner) return;
    
    if (!confirm(`Remove ${userName} from the room?`)) return;
    
    try {
      const oktaToken = await getAuthToken();
      if (!oktaToken) {
        setActionMessage('Authentication required to remove user');
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }

      const response = await fetch(`/api/rooms/${roomId}/remove-user?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIdToRemove, oktaToken })
      });
      
      if (!response.ok) throw new Error('Failed to remove user');
      
    } catch (err) {
      setActionMessage('Failed to remove user');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      // Close SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      // Call leave endpoint to properly remove user from room
      if (roomId && userId) {
        await fetch(`/api/rooms/${roomId}/leave?userId=${userId}`, {
          method: 'POST'
        });
        
        // Clean up localStorage
        localStorage.removeItem(`poker_user_${roomId}`);
      }
    } catch (error) {
      console.error('Error leaving room:', error);
    } finally {
      // Always navigate away
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="room-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading poker room...</p>
        </div>
      </div>
    );
  }

  if (error || !room || !currentUser) {
    return (
      <div className="room-page">
        <div className="error-container">
          <h2>Unable to Load Room</h2>
          <p>{error || 'Room not found'}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const votingOptions = getVotingOptions();
  const usersWhoVoted = room.users.filter(u => u.hasVoted).length;
  const eligibleVoters = room.ownerParticipating ? room.users.length : room.users.filter(u => !u.isOwner).length;
  const totalUsers = room.users.length;
  
  return (
    <div className="room-page">
      {/* Action message indicator */}
      {actionMessage && (
        <div className="action-message error">
          {actionMessage}
        </div>
      )}
      
      <header className="room-header">
        <div className="room-header-content">
          <div className="room-actions">
            <button onClick={handleCopyLink} className="btn btn-secondary">
              {copyIndicator ? '✅ Copied!' : '📋 Copy Link'}
            </button>
            <button onClick={handleLeaveRoom} className="btn btn-danger">
              🚪 Leave
            </button>
          </div>
        </div>
      </header>

      <div className="room-content">
        <aside className="room-sidebar">
          {/* Room Management - Owner Only */}
          {currentUser.isOwner && (
            <div className="room-management-card card">
              <div className="card-header">
                <h3 className="card-title">Room Management</h3>
              </div>
              
              {/* Room Settings Section */}
              <div className="management-section">
                <div className="section-header">
                  <h4 className="section-title">Room Settings</h4>
                  <button 
                    onClick={() => setEditingRoom(!editingRoom)}
                    className="btn-icon"
                  >
                    ✏️
                  </button>
                </div>
                
                {editingRoom ? (
                  <form onSubmit={handleUpdateRoom} className="room-form">
                    <input
                      type="text"
                      value={roomForm.title}
                      onChange={(e) => setRoomForm(prev => ({ ...prev, title: e.target.value }))}
                      className="form-input mb-2"
                      placeholder="Title"
                      required
                    />
                    <textarea
                      value={roomForm.description}
                      onChange={(e) => setRoomForm(prev => ({ ...prev, description: e.target.value }))}
                      className="form-textarea mb-2"
                      placeholder="Description"
                      rows={2}
                    />
                    <input
                      type="text"
                      value={roomForm.jiraId}
                      onChange={(e) => setRoomForm(prev => ({ ...prev, jiraId: e.target.value }))}
                      className="form-input mb-2"
                      placeholder="Jira ID (optional)"
                    />
                    <div className="form-buttons">
                      <button type="button" onClick={() => setEditingRoom(false)} className="btn btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary">
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="room-display">
                    <h4 className="room-title-display">{room.title}</h4>
                    {room.description && (
                      <p className="room-description-display">{room.description}</p>
                    )}
                    {room.jiraId && (
                      <p className="room-jira-display">{room.jiraId}</p>
                    )}
                  </div>
                )}
              </div>
              
              <hr className="section-divider" />
              
              {/* Session Controls Section */}
              <div className="management-section">
                <div className="section-header">
                  <h4 className="section-title">Session Controls</h4>
                </div>
                
                {preparingVote ? (
                  <form onSubmit={handleStartVotingWithStory} className="vote-prep-form">
                    <div className="story-inputs">
                      <input
                        type="text"
                        value={roomForm.title}
                        onChange={(e) => setRoomForm(prev => ({ ...prev, title: e.target.value }))}
                        className="form-input mb-2"
                        placeholder="Title"
                        required
                      />
                      <textarea
                        value={roomForm.description}
                        onChange={(e) => setRoomForm(prev => ({ ...prev, description: e.target.value }))}
                        className="form-textarea mb-2"
                        placeholder="Description"
                        rows={3}
                      />
                      <input
                        type="text"
                        value={roomForm.jiraId}
                        onChange={(e) => setRoomForm(prev => ({ ...prev, jiraId: e.target.value }))}
                        className="form-input mb-2"
                        placeholder="Jira ID (optional)"
                      />
                    </div>
                    
                    <div className="owner-participation mb-3">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={ownerParticipating}
                          onChange={(e) => setOwnerParticipating(e.target.checked)}
                          className="checkbox-input"
                        />
                        <span className="checkbox-text">I will vote this round</span>
                      </label>
                    </div>
                    
                    <div className="form-buttons">
                      <button 
                        type="button" 
                        onClick={() => setPreparingVote(false)} 
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-success">
                        Start Voting
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="control-buttons-sidebar">
                    {!room.isVotingActive && !room.votesRevealed && (
                      <>
                        {editingRoom ? (
                          <button 
                            onClick={handlePublishAndStartVoting} 
                            className="btn btn-success w-full"
                          >
                            Publish & Start Voting
                          </button>
                        ) : (
                          <button 
                            onClick={handlePrepareVote} 
                            className="btn btn-success w-full"
                          >
                            Start Voting
                          </button>
                        )}
                      </>
                    )}
                    {room.isVotingActive && (
                      <button 
                        onClick={handleRevealVotes} 
                        className="btn btn-primary w-full"
                      >
                        Reveal Votes
                      </button>
                    )}
                    {room.votesRevealed && (
                      <button 
                        onClick={handlePrepareVote} 
                        className="btn btn-success w-full"
                      >
                        New Voting Round
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="users-card card">
            <div className="card-header">
              <h3 className="card-title">Participants ({room.users.length})</h3>
            </div>
            <div className="users-list">
              {room.users.map((user) => (
                <div key={user.id} className="user-item">
                  <span className="user-name">
                    {user.name}
                    {user.isOwner && ' 👑'}
                  </span>
                  <div className="user-actions">
                    <div className="user-status">
                      {room.isVotingActive ? (
                        user.isOwner && !room.ownerParticipating ? (
                          <span className="vote-status observer">👀</span>
                        ) : user.hasVoted ? (
                          <span className="vote-status voted">✅</span>
                        ) : (
                          <span className="vote-status pending">⏳</span>
                        )
                      ) : (
                        room.votesRevealed && user.vote !== undefined && (
                          <span className="vote-value">{user.vote}</span>
                        )
                      )}
                    </div>
                    {currentUser.isOwner && !user.isOwner && (
                      <button
                        onClick={() => handleRemoveUser(user.id, user.name)}
                        className="btn-remove-user"
                        title={`Remove ${user.name}`}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        
        <main className="room-main">
          <div className="voting-status card">
            <div className="room-info">
              <h1 className="room-title">{room.title}</h1>
              {room.description && (
                <p className="room-description">{room.description}</p>
              )}
            </div>
            
            {room.isVotingActive ? (
              <div className="voting-active">
                <h2>Voting in Progress</h2>
                <p>Pick your estimate for the current story</p>
                <div className="voting-progress">
                  <span>{usersWhoVoted}/{eligibleVoters} votes cast</span>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${(usersWhoVoted / eligibleVoters) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : room.votesRevealed ? (
              <div className="voting-complete">
                <h2>Votes Revealed</h2>
                {voteStats && (
                  <div className="vote-statistics">
                    <div className="stat">
                      <span className="stat-label">Total Votes:</span>
                      <span className="stat-value">{voteStats.totalVotes}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Average:</span>
                      <span className="stat-value">{voteStats.average.toFixed(1)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Nearest Fibonacci:</span>
                      <span className="stat-value">{voteStats.nearestFibonacci}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="voting-idle">
                <h2>Waiting to Start</h2>
                <p>Room owner will start the next voting session</p>
              </div>
            )}
          </div>
          
          {room.isVotingActive && !(currentUser.isOwner && !room.ownerParticipating) && (
            <div className="voting-area card">
              <h3>Choose Your Estimate</h3>
              <div className="voting-options">
                {votingOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleVote(option)}
                    className={`vote-btn ${
                      selectedVote === option ? 'selected' : ''
                    } ${
                      currentUser.hasVoted ? 'voted' : ''
                    }`}
                    disabled={currentUser.hasVoted}
                  >
                    {option}
                  </button>
                ))}
              </div>
              
              {currentUser.hasVoted && (
                <p className="vote-confirmation">
                  You voted: <strong>{selectedVote}</strong>
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default RoomPage;