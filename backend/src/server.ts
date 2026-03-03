import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type { 
  Room, 
  User, 
  SSEEvent, 
  CreateRoomRequest, 
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  CastVoteRequest,
  UpdateStoryRequest,
  StartTimerRequest,
  UpdateRoomSettingsRequest
} from '../../shared/types';
import { calculateVoteStats } from '../../shared/types';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (rooms will be deleted when creator leaves)
const rooms = new Map<string, Room>();
const roomConnections = new Map<string, Map<string, express.Response>>();

/**
 * Utility function to generate unique user name if duplicate exists
 */
function generateUniqueUserName(roomId: string, requestedName: string): string {
  const room = rooms.get(roomId);
  if (!room) return requestedName;
  
  const existingNames = room.users.map(u => u.name);
  if (!existingNames.includes(requestedName)) {
    return requestedName;
  }
  
  // Find the next available number suffix
  let counter = 2;
  let uniqueName = `${requestedName} (${counter})`;
  while (existingNames.includes(uniqueName)) {
    counter++;
    uniqueName = `${requestedName} (${counter})`;
  }
  
  return uniqueName;
}

/**
 * Send SSE event to all users in a room
 */
function sendSSEToRoom(roomId: string, event: SSEEvent): void {
  const connections = roomConnections.get(roomId);
  if (!connections) return;
  
  const eventData = `data: ${JSON.stringify(event)}\n\n`;
  
  connections.forEach((res, userId) => {
    try {
      res.write(eventData);
    } catch (error) {
      console.log(`Failed to send SSE to user ${userId}`);
      connections.delete(userId);
    }
  });
}

/**
 * Remove user from room and clean up if owner leaves
 */
function removeUserFromRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const userIndex = room.users.findIndex(u => u.id === userId);
  if (userIndex === -1) return;
  
  const user = room.users[userIndex];
  room.users.splice(userIndex, 1);
  
  // Remove user's SSE connection
  const connections = roomConnections.get(roomId);
  if (connections) {
    connections.delete(userId);
  }
  
  // If the room owner leaves, delete the room
  if (user.isOwner) {
    rooms.delete(roomId);
    roomConnections.delete(roomId);
    
    // Notify all remaining users that the room is closed
    sendSSEToRoom(roomId, {
      type: 'room-updated',
      data: { message: 'Room has been closed by the owner' },
      timestamp: new Date()
    });
    return;
  }
  
  // Update remaining users
  rooms.set(roomId, room);
  sendSSEToRoom(roomId, {
    type: 'user-left',
    data: { user, room },
    timestamp: new Date()
  });
}

// API Routes

/**
 * Create a new poker room
 */
app.post('/api/rooms', (req, res) => {
  try {
    const { title, description, ownerName, votingOption, customVotingValues }: CreateRoomRequest = req.body;
    
    const roomId = uuidv4();
    const ownerId = uuidv4();
    
    const room: Room = {
      id: roomId,
      title: title || 'Planning Poker Session',
      description: description || '',
      ownerId,
      users: [{
        id: ownerId,
        name: ownerName,
        isOwner: true,
        hasVoted: false,
        joinedAt: new Date()
      }],
      story: {
        id: uuidv4(),
        title: 'Story to estimate',
        description: 'Enter your story details here',
        jiraId: ''
      },
      votingOption: votingOption || 'fibonacci',
      customVotingValues: customVotingValues || [],
      isVotingActive: false,
      votesRevealed: false,
      createdAt: new Date()
    };
    
    rooms.set(roomId, room);
    roomConnections.set(roomId, new Map());
    
    const joinUrl = `${req.protocol}://${req.get('host')}/room/${roomId}`;
    
    const response: CreateRoomResponse = {
      room,
      joinUrl
    };
    
    console.log(`Room created: ${roomId} by ${ownerName}`);
    res.json(response);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * Get room details
 */
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json(room);
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

/**
 * Join a room
 */
app.post('/api/rooms/:roomId/join', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userName }: JoinRoomRequest = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const uniqueName = generateUniqueUserName(roomId, userName);
    const userId = uuidv4();
    
    const user: User = {
      id: userId,
      name: uniqueName,
      isOwner: false,
      hasVoted: false,
      joinedAt: new Date()
    };
    
    room.users.push(user);
    rooms.set(roomId, room);
    
    const response: JoinRoomResponse = {
      room,
      user
    };
    
    // Notify other users
    sendSSEToRoom(roomId, {
      type: 'user-joined',
      data: { user, room },
      timestamp: new Date()
    });
    
    console.log(`User ${uniqueName} joined room ${roomId}`);
    res.json(response);
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

/**
 * Leave a room (explicit user action)
 */
app.post('/api/rooms/:roomId/leave', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    removeUserFromRoom(roomId, userId as string);
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

/**
 * Cast a vote
 */
app.post('/api/rooms/:roomId/vote', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { vote }: CastVoteRequest = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (!room.isVotingActive) {
      return res.status(400).json({ error: 'Voting is not active' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found in room' });
    }
    
    user.vote = vote;
    user.hasVoted = true;
    
    rooms.set(roomId, room);
    
    // Notify other users (without revealing the actual vote)
    sendSSEToRoom(roomId, {
      type: 'vote-cast',
      data: { userId: user.id, userName: user.name, hasVoted: true },
      timestamp: new Date()
    });
    
    console.log(`User ${user.name} voted in room ${roomId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

/**
 * Reveal votes (owner only)
 */
app.post('/api/rooms/:roomId/reveal', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user || !user.isOwner) {
      return res.status(403).json({ error: 'Only room owner can reveal votes' });
    }
    
    room.votesRevealed = true;
    room.isVotingActive = false;
    
    const stats = calculateVoteStats(room.users);
    
    rooms.set(roomId, room);
    
    sendSSEToRoom(roomId, {
      type: 'votes-revealed',
      data: { room, stats },
      timestamp: new Date()
    });
    
    console.log(`Votes revealed in room ${roomId}`);
    res.json({ room, stats });
  } catch (error) {
    console.error('Error revealing votes:', error);
    res.status(500).json({ error: 'Failed to reveal votes' });
  }
});

/**
 * Start new voting session (owner only)
 */
app.post('/api/rooms/:roomId/start-voting', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user || !user.isOwner) {
      return res.status(403).json({ error: 'Only room owner can start voting' });
    }
    
    // Reset votes
    room.users.forEach(u => {
      u.hasVoted = false;
      u.vote = undefined;
    });
    
    room.isVotingActive = true;
    room.votesRevealed = false;
    
    rooms.set(roomId, room);
    
    sendSSEToRoom(roomId, {
      type: 'room-updated',
      data: room,
      timestamp: new Date()
    });
    
    console.log(`Voting started in room ${roomId}`);
    res.json(room);
  } catch (error) {
    console.error('Error starting voting:', error);
    res.status(500).json({ error: 'Failed to start voting' });
  }
});

/**
 * Update story details (owner only)
 */
app.put('/api/rooms/:roomId/story', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { title, description, jiraId }: UpdateStoryRequest = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user || !user.isOwner) {
      return res.status(403).json({ error: 'Only room owner can update story' });
    }
    
    // Update story details
    room.story.title = title || room.story.title;
    room.story.description = description || room.story.description;
    room.story.jiraId = jiraId || room.story.jiraId;
    
    rooms.set(roomId, room);
    
    sendSSEToRoom(roomId, {
      type: 'story-updated',
      data: room.story,
      timestamp: new Date()
    });
    
    console.log(`Story updated in room ${roomId}`);
    res.json(room.story);
  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({ error: 'Failed to update story' });
  }
});

/**
 * Update room settings (owner only)
 */
app.put('/api/rooms/:roomId/settings', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { title, description } = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user || !user.isOwner) {
      return res.status(403).json({ error: 'Only room owner can update room settings' });
    }
    
    // Update room settings
    if (title !== undefined) room.title = title;
    if (description !== undefined) room.description = description;
    
    rooms.set(roomId, room);
    
    sendSSEToRoom(roomId, {
      type: 'settings-updated',
      data: { title: room.title, description: room.description },
      timestamp: new Date()
    });
    
    console.log(`Room settings updated in room ${roomId}`);
    res.json({ title: room.title, description: room.description });
  } catch (error) {
    console.error('Error updating room settings:', error);
    res.status(500).json({ error: 'Failed to update room settings' });
  }
});

/**
 * Server-Sent Events endpoint
 */
app.get('/api/rooms/:roomId/events', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.query as { userId: string };
  
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const user = room.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found in room' });
  }
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Store connection (replace existing connection if user is reconnecting)
  let connections = roomConnections.get(roomId);
  if (!connections) {
    connections = new Map();
    roomConnections.set(roomId, connections);
  }
  
  // Close any existing connection for this user
  const existingConnection = connections.get(userId);
  if (existingConnection) {
    try {
      existingConnection.end();
    } catch (e) {
      // Connection already closed
    }
  }
  
  connections.set(userId, res);
  
  // Send initial room state
  res.write(`data: ${JSON.stringify({
    type: 'room-updated',
    data: room,
    timestamp: new Date()
  })}\\n\\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`SSE connection closed for user ${userId} in room ${roomId}`);
    // Remove connection but keep user in room for reconnection
    const connections = roomConnections.get(roomId);
    if (connections) {
      connections.delete(userId);
    }
  });
  
  req.on('error', () => {
    console.log(`SSE connection error for user ${userId} in room ${roomId}`);
    // Remove connection but keep user in room for reconnection
    const connections = roomConnections.get(roomId);
    if (connections) {
      connections.delete(userId);
    }
  });
  
  console.log(`SSE connection established for user ${userId} in room ${roomId}`);
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    activeRooms: rooms.size,
    totalConnections: Array.from(roomConnections.values())
      .reduce((sum, connections) => sum + connections.size, 0)
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🃏 Pointing Poker server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/api/health`);
});