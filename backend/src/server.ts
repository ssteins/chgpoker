import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import helmet from 'helmet';
import type { 
  Room, 
  User, 
  SSEEvent, 
  CreateRoomRequest, 
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  CastVoteRequest,
  StartTimerRequest,
  UpdateRoomSettingsRequest
} from '../../shared/types';
import { calculateVoteStats } from '../../shared/types';

// Extend Express Request interface to include Okta user
declare global {
  namespace Express {
    interface Request {
      oktaUser?: {
        sub: string;
        email: string;
        name?: string;
        iss: string;
        exp: number;
      };
    }
  }
}

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false // Allow SSE in development
}));

// CORS configuration
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://your-domain.com'
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: NODE_ENV === 'development' ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1min dev, 15min prod
  max: NODE_ENV === 'development' ? 200 : 100, // More requests allowed in dev
  message: 'Too many requests, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input validation error handler
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors for', req.method, req.path, ':', errors.array());
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array(),
      help: NODE_ENV === 'development' ? 'Check request body, params, and query parameters match API requirements' : undefined
    });
  }
  next();
};

// In-memory storage (rooms will be deleted when creator leaves)
const rooms = new Map<string, Room>();
const roomConnections = new Map<string, Map<string, express.Response>>();

/**
 * Interface for Okta JWT payload
 */
interface OktaTokenPayload {
  sub: string; // Okta user ID
  email: string;
  name?: string;
  iss: string; // Issuer
  exp: number; // Expiration
}

/**
 * Middleware to validate Okta JWT tokens
 * Development: validates structure, expiration, and claims (signature verification requires Okta public key setup)
 * Production: should include full signature verification against Okta's public key
 */
function validateOktaToken(token?: string): OktaTokenPayload | null {
  if (!token) {
    console.log('Token validation failed: no token provided');
    return null;
  }
  
  try {
    console.log('Validating token:', token.substring(0, 50) + '...');
    
    // Parse and validate token structure and claims
    // Note: Full signature verification requires Okta public key configuration
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || typeof decoded === 'string' || !decoded.payload) {
      console.log('Token validation failed: invalid token structure');
      return null;
    }
    
    const payload = decoded.payload as OktaTokenPayload;
    
    // Validate required claims
    if (!payload.sub || !payload.iss || !payload.exp) {
      console.log('Token validation failed: missing required claims', {
        hasSub: !!payload.sub,
        hasIss: !!payload.iss,
        hasExp: !!payload.exp
      });
      return null;
    }
    
    console.log('Token validation - decoded payload:', {
      sub: payload?.sub?.substring(0, 10) + '...',
      email: payload?.email,
      exp: payload?.exp,
      iss: payload?.iss,
      expDate: new Date(payload.exp * 1000).toISOString()
    });
    
    // Check token expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.log('Token validation failed: token expired at', new Date(payload.exp * 1000).toISOString());
      return null;
    }
    
    // Domain validation handled by Okta policies
    console.log('Token validation successful - email:', payload.email || 'not provided');
    return payload;
  } catch (error) {
    console.log('Token validation error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Authentication middleware - requires valid Okta token
 */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { oktaToken } = req.body;
  
  console.log('Authentication check:', {
    hasToken: !!oktaToken,
    tokenLength: oktaToken?.length,
    endpoint: req.path,
    method: req.method
  });
  
  if (!oktaToken) {
    console.log('Authentication failed: no oktaToken in request body');
    return res.status(401).json({ error: 'Authentication required', details: 'oktaToken is required in request body' });
  }
  
  const oktaUser = validateOktaToken(oktaToken);
  if (!oktaUser) {
    console.log('Authentication failed: token validation failed');
    return res.status(401).json({ error: 'Invalid authentication token', details: 'Token validation failed - check server logs' });
  }
  
  console.log('Authentication successful for user:', oktaUser.email);
  // Store user info for use in route handler
  req.oktaUser = oktaUser;
  next();
}

/**
 * Optional authentication middleware - validates token if present
 */
function optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { oktaToken } = req.body;
  
  if (oktaToken) {
    const oktaUser = validateOktaToken(oktaToken);
    if (oktaUser) {
      req.oktaUser = oktaUser;
    }
  }
  
  next();
}

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
      if (res.writable) {
        res.write(eventData);
      } else {
        connections.delete(userId);
      }
    } catch (error) {
      console.log(`Failed to send SSE to user ${userId}:`, error instanceof Error ? error.message : String(error));
      connections.delete(userId);
    }
  });
}

/**
 * Send SSE event to a specific user
 */
function sendSSEToUser(res: express.Response, event: SSEEvent): void {
  try {
    const eventData = `data: ${JSON.stringify(event)}\n\n`;
    res.write(eventData);
  } catch (error) {
    console.log('Failed to send SSE to user');
  }
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
 * Create a new poker room - REQUIRES AUTHENTICATION
 */
app.post('/api/rooms', 
  [
    body('title').optional().isString().trim().isLength({ max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('ownerName').optional().isString().trim().isLength({ max: 50 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('oktaToken').isString().notEmpty(),
    handleValidationErrors,
    requireAuth
  ],
  (req: express.Request, res: express.Response) => {
  try {
    const { title, description, ownerName, votingOption, customVotingValues, email }: CreateRoomRequest = req.body;
    const oktaUser = req.oktaUser; // Set by requireAuth middleware
    
    console.log('Room creation request:', {
      email: oktaUser?.email,
      ownerName: ownerName || oktaUser?.name
    });
    
    const roomId = uuidv4();
    const ownerId = uuidv4();
    
    // Use Okta info
    const userEmail = oktaUser?.email || email;
    const userName = ownerName || oktaUser?.name || userEmail?.split('@')[0] || 'Unknown User';
    
    const room: Room = {
      id: roomId,
      title: title || 'Planning Poker Session',
      description: description || '',
      jiraId: '',
      ownerId,
      ownerParticipating: true,
      users: [{
        id: ownerId,
        name: userName,
        isOwner: true,
        hasVoted: false,
        joinedAt: new Date(),
        email: userEmail,
        oktaId: oktaUser?.sub
      }],
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
    
    console.log(`Room created: ${roomId} by ${userName}${userEmail ? ` (${userEmail})` : ''}`);
    res.json(response);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * Get room details
 */
app.get('/api/rooms/:roomId', (req: express.Request, res: express.Response) => {
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
 * Join a room - NO AUTH REQUIRED
 */
app.post('/api/rooms/:roomId/join',
  [
    param('roomId').isUUID(),
    body('userName').optional().isString().trim().isLength({ max: 50 }),
    body('existingUserId').optional().isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    handleValidationErrors,
    optionalAuth
  ],
  (req: express.Request, res: express.Response) => {
  try {
    const { roomId } = req.params;
    const { userName, existingUserId, email }: JoinRoomRequest = req.body;
    const oktaUser = req.oktaUser; // Optional - set by optionalAuth middleware if token provided
    
    console.log('Room join request:', {
      roomId,
      hasToken: !!oktaUser,
      email: oktaUser?.email || email,
      userName
    });
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Use Okta info if available
    const userEmail = oktaUser?.email || email;
    const finalUserName = userName || oktaUser?.name || userEmail?.split('@')[0] || 'Unknown User';
    
    // Check if this is a rejoin attempt with an existing user ID
    if (existingUserId) {
      const existingUser = room.users.find(u => u.id === existingUserId);
      if (existingUser && existingUser.name === finalUserName) {
        // User is rejoining with same name and ID - reuse their session
        // Update with Okta info if available
        if (oktaUser) {
          existingUser.email = userEmail;
          existingUser.oktaId = oktaUser.sub;
        }
        const response: JoinRoomResponse = {
          room,
          user: existingUser
        };
        console.log(`User ${finalUserName} rejoined room ${roomId} with existing ID`);
        return res.json(response);
      }
    }
    
    // Check if user with exact same name already exists (and is reconnecting)
    const existingUserByName = room.users.find(u => u.name === finalUserName);
    if (existingUserByName) {
      // Reuse existing user session instead of creating duplicate
      // Update with Okta info if available
      if (oktaUser) {
        existingUserByName.email = userEmail;
        existingUserByName.oktaId = oktaUser.sub;
      }
      const response: JoinRoomResponse = {
        room,
        user: existingUserByName
      };
      console.log(`User ${finalUserName} reconnected to room ${roomId}`);
      return res.json(response);
    }
    
    // Check if Okta user with same oktaId exists
    if (oktaUser) {
      const existingOktaUser = room.users.find(u => u.oktaId === oktaUser.sub);
      if (existingOktaUser) {
        // Same Okta user rejoining - update name if changed
        existingOktaUser.name = finalUserName;
        existingOktaUser.email = userEmail;
        const response: JoinRoomResponse = {
          room,
          user: existingOktaUser
        };
        console.log(`Okta user ${finalUserName} reconnected to room ${roomId}`);
        return res.json(response);
      }
    }
    
    // Create new user (only if no existing session found)
    const uniqueName = generateUniqueUserName(roomId, finalUserName);
    const userId = uuidv4();
    
    const user: User = {
      id: userId,
      name: uniqueName,
      isOwner: false,
      hasVoted: false,
      joinedAt: new Date(),
      email: userEmail,
      oktaId: oktaUser?.sub
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
    
    console.log(`User ${uniqueName} joined room ${roomId}${userEmail ? ` (${userEmail})` : ''}`);
    res.json(response);
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

/**
 * Leave a room (explicit user action)
 */
app.post('/api/rooms/:roomId/leave', (req: express.Request, res: express.Response) => {
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
 * Remove a user from room - REQUIRES AUTHENTICATION (owner only)
 */
app.post('/api/rooms/:roomId/remove-user',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    body('oktaToken').isString().notEmpty(),
    body('userIdToRemove').isUUID(),
    handleValidationErrors,
    requireAuth
  ],
  (req: express.Request, res: express.Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { userIdToRemove } = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const requestingUser = room.users.find(u => u.id === userId);
    if (!requestingUser || !requestingUser.isOwner) {
      return res.status(403).json({ error: 'Only room owner can remove users' });
    }
    
    const userToRemove = room.users.find(u => u.id === userIdToRemove);
    if (!userToRemove) {
      return res.status(404).json({ error: 'User not found in room' });
    }
    
    if (userToRemove.isOwner) {
      return res.status(403).json({ error: 'Cannot remove room owner' });
    }
    
    // Send notification to the user being removed first
    const userConnection = roomConnections.get(roomId)?.get(userIdToRemove);
    if (userConnection) {
      sendSSEToUser(userConnection, {
        type: 'room-updated',
        data: { message: 'You have been removed from the room by the owner' },
        timestamp: new Date()
      });
    }
    
    // Get user info before removal for the user-left event
    const userToRemoveData = room.users.find(u => u.id === userIdToRemove);
    
    // Remove user from room users list
    const userIndex = room.users.findIndex(u => u.id === userIdToRemove);
    if (userIndex !== -1) {
      room.users.splice(userIndex, 1);
      rooms.set(roomId, room);
    }
    
    // Notify all remaining users with user-left event (preserves vote states)
    sendSSEToRoom(roomId, {
      type: 'user-left',
      data: { user: userToRemoveData, room },
      timestamp: new Date()
    });
    
    // Finally, close the removed user's connection
    if (userConnection) {
      const connections = roomConnections.get(roomId);
      if (connections) {
        connections.delete(userIdToRemove);
      }
      userConnection.end();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing user from room:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

/**
 * Cast a vote - NO AUTH REQUIRED
 */
app.post('/api/rooms/:roomId/vote',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    body('vote').isString().trim().notEmpty(),
    handleValidationErrors
  ],
  (req: express.Request, res: express.Response) => {
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
 * Reveal votes - REQUIRES AUTHENTICATION (owner only)
 */
app.post('/api/rooms/:roomId/reveal',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    body('oktaToken').isString().notEmpty(),
    handleValidationErrors,
    requireAuth
  ],
  (req: express.Request, res: express.Response) => {
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
 * Start new voting session - REQUIRES AUTHENTICATION (owner only)
 */
app.post('/api/rooms/:roomId/start-voting',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    body('oktaToken').isString().notEmpty(),
    body('ownerParticipating').optional().isBoolean(),
    handleValidationErrors,
    requireAuth
  ],
  (req: express.Request, res: express.Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { ownerParticipating } = req.body;
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const user = room.users.find(u => u.id === userId);
    if (!user || !user.isOwner) {
      return res.status(403).json({ error: 'Only room owner can start voting' });
    }
    
    // Set owner participation flag
    if (ownerParticipating !== undefined) {
      room.ownerParticipating = ownerParticipating;
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
    
    console.log(`Voting started in room ${roomId} (owner participating: ${room.ownerParticipating})`);
    res.json(room);
  } catch (error) {
    console.error('Error starting voting:', error);
    res.status(500).json({ error: 'Failed to start voting' });
  }
});

/**
 * Update room settings - REQUIRES AUTHENTICATION (owner only)
 */
app.put('/api/rooms/:roomId/settings',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    body('oktaToken').isString().notEmpty(),
    body('title').optional().isString().trim().isLength({ max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('jiraId').optional().isString().trim().isLength({ max: 50 }),
    handleValidationErrors,
    requireAuth
  ],
  (req: express.Request, res: express.Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const { title, description, jiraId } = req.body;
    
    console.log('Room settings update request:', {
      roomId,
      userId,
      hasAuthenticatedUser: !!req.oktaUser,
      changes: { title, description, jiraId }
    });
    
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
    if (jiraId !== undefined) room.jiraId = jiraId;
    
    rooms.set(roomId, room);
    
    sendSSEToRoom(roomId, {
      type: 'room-updated',
      data: room,
      timestamp: new Date()
    });
    
    console.log(`Room settings updated in room ${roomId}`);
    res.json(room);
  } catch (error) {
    console.error('Error updating room settings:', error);
    res.status(500).json({ error: 'Failed to update room settings' });
  }
});

/**
 * Server-Sent Events endpoint - Basic validation, no auth required for development
 */
app.get('/api/rooms/:roomId/events',
  [
    param('roomId').isUUID(),
    query('userId').isUUID(),
    handleValidationErrors
  ],
  (req: express.Request, res: express.Response) => {
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
  
  // Set up SSE headers with better security
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': NODE_ENV === 'development' 
      ? req.get('origin') || '*'
      : process.env.FRONTEND_URL || 'https://your-domain.com',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Content-Type-Options': 'nosniff'
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
  })}\n\n`);
  
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
app.get('/api/health', (req: express.Request, res: express.Response) => {
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