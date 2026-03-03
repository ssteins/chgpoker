import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [voteStats, setVoteStats] = useState<VoteStats | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | number | null>(null);
  // const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStory, setEditingStory] = useState(false);
  const [editingRoom, setEditingRoom] = useState(false);
  const [storyForm, setStoryForm] = useState({ title: '', description: '', jiraId: '' });
  const [roomForm, setRoomForm] = useState({ title: '', description: '' });
  const [copyIndicator, setCopyIndicator] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  // Store user data in localStorage for persistence across refreshes
  const storeUserData = (_roomData: Room, userData: User) => {
    if (roomId && userId) {
      localStorage.setItem(`poker_user_${roomId}`, JSON.stringify({
        userId: userData.id,
        userName: userData.name,
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
      // Check if data is less than 24 hours old
      if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    } catch (e) {}
    return null;
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
          throw new Error('User not found in room. Please rejoin the room.');
        }
        
        setCurrentUser(user);
        storeUserData(roomData, user);
        
        setStoryForm({
          title: roomData.story.title,
          description: roomData.story.description,
          jiraId: roomData.story.jiraId || ''
        });
        
        setRoomForm({
          title: roomData.title,
          description: roomData.description
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
        
        eventSource.onerror = () => {
          setTimeout(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
              window.location.reload();
            }
          }, 5000);
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
        if (!event.data.message) {
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
      case 'story-updated':
        setRoom(prev => prev ? { ...prev, story: event.data } : prev);
        setStoryForm({
          title: event.data.title,
          description: event.data.description,
          jiraId: event.data.jiraId || ''
        });
        break;
      case 'settings-updated':
        setRoom(prev => prev ? { ...prev, title: event.data.title, description: event.data.description } : prev);
        setRoomForm({
          title: event.data.title,
          description: event.data.description
        });
        break;
    }
  };

  const handleVote = async (vote: string | number) => {
    if (!room || !currentUser || !room.isVotingActive) return;
    
    try {
      const response = await fetch(`/api/rooms/${roomId}/vote?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
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

  const handleStartVoting = async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/start-voting?userId=${userId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to start voting');
      setSelectedVote(null);
      setVoteStats(null);
    } catch (err) {
      setActionMessage('Failed to start voting');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleRevealVotes = async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/reveal?userId=${userId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to reveal votes');
    } catch (err) {
      setActionMessage('Failed to reveal votes');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleUpdateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/rooms/${roomId}/story?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyForm)
      });
      if (!response.ok) throw new Error('Failed to update story');
      setEditingStory(false);
    } catch (err) {
      setActionMessage('Failed to update story');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/rooms/${roomId}/settings?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomForm)
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
                      placeholder="Room title"
                      required
                    />
                    <textarea
                      value={roomForm.description}
                      onChange={(e) => setRoomForm(prev => ({ ...prev, description: e.target.value }))}
                      className="form-textarea mb-2"
                      placeholder="Room description"
                      rows={2}
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
                  </div>
                )}
              </div>
              
              <hr className="section-divider" />
              
              {/* Session Controls Section */}
              <div className="management-section">
                <div className="section-header">
                  <h4 className="section-title">Session Controls</h4>
                </div>
                
                <div className="control-buttons-sidebar">
                  {!room.isVotingActive && !room.votesRevealed && (
                    <>
                      {(editingRoom || editingStory) ? (
                        <button 
                          onClick={handlePublishAndStartVoting} 
                          className="btn btn-success w-full"
                        >
                          📝🚀 Publish & Start Voting
                        </button>
                      ) : (
                        <button 
                          onClick={handleStartVoting} 
                          className="btn btn-success w-full"
                        >
                          🚀 Start Voting
                        </button>
                      )}
                    </>
                  )}
                  {room.isVotingActive && (
                    <button 
                      onClick={handleRevealVotes} 
                      className="btn btn-primary w-full"
                    >
                      👀 Reveal Votes
                    </button>
                  )}
                  {room.votesRevealed && (
                    <button 
                      onClick={handleStartVoting} 
                      className="btn btn-success w-full"
                    >
                      🔄 New Voting Round
                    </button>
                  )}
                </div>
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
                  <div className="user-status">
                    {room.isVotingActive ? (
                      user.hasVoted ? (
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
                <h2>🗳️ Voting in Progress</h2>
                <p>Pick your estimate for the current story</p>
                <div className="voting-progress">
                  <span>{usersWhoVoted}/{totalUsers} votes cast</span>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${(usersWhoVoted / totalUsers) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : room.votesRevealed ? (
              <div className="voting-complete">
                <h2>📊 Votes Revealed</h2>
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
                <h2>⏸️ Waiting to Start</h2>
                <p>Room owner will start the next voting session</p>
              </div>
            )}
          </div>
          
          {room.isVotingActive && (
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
                  ✅ You voted: <strong>{selectedVote}</strong>
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