// Shared types for the pointing poker application

/**
 * Voting options available for a room
 */
export type VotingOption = 'fibonacci' | '1-5' | '1-10' | 'evens' | 'odds' | 'custom';

/**
 * User in a poker room
 */
export interface User {
  id: string;
  name: string;
  isOwner: boolean;
  hasVoted: boolean;
  vote?: string | number;
  joinedAt: Date;
}

/**
 * Current story being voted on
 */
export interface Story {
  id: string;
  title: string;
  description: string;
  jiraId?: string;
}

/**
 * Poker room configuration and state
 */
export interface Room {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  users: User[];
  story: Story;
  votingOption: VotingOption;
  customVotingValues: string[];
  isVotingActive: boolean;
  votesRevealed: boolean;
  timerDuration?: number; // in seconds
  timerStartTime?: Date;
  createdAt: Date;
}

/**
 * Vote statistics after votes are revealed
 */
export interface VoteStats {
  totalVotes: number;
  average: number;
  nearestFibonacci: number;
  votes: { userId: string; userName: string; vote: string | number }[];
}

/**
 * Server-Sent Event types
 */
export type SSEEventType = 
  | 'room-updated' 
  | 'user-joined' 
  | 'user-left' 
  | 'vote-cast' 
  | 'votes-revealed' 
  | 'timer-started' 
  | 'timer-tick' 
  | 'timer-ended'
  | 'story-updated'
  | 'settings-updated';

/**
 * SSE event data structure
 */
export interface SSEEvent<T = any> {
  type: SSEEventType;
  data: T;
  timestamp: Date;
}

/**
 * API request/response types
 */
export interface CreateRoomRequest {
  title: string;
  description: string;
  ownerName: string;
  votingOption: VotingOption;
  customVotingValues?: string[];
}

export interface CreateRoomResponse {
  room: Room;
  joinUrl: string;
}

export interface JoinRoomRequest {
  userName: string;
}

export interface JoinRoomResponse {
  room: Room;
  user: User;
}

export interface CastVoteRequest {
  vote: string | number;
}

export interface UpdateStoryRequest {
  title: string;
  description: string;
  jiraId?: string;
}

export interface StartTimerRequest {
  duration: number; // in seconds
}

export interface UpdateRoomSettingsRequest {
  title?: string;
  description?: string;
  votingOption?: VotingOption;
  customVotingValues?: string[];
}

/**
 * Predefined voting values
 */
export const VOTING_OPTIONS: Record<VotingOption, (string | number)[]> = {
  fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'],
  '1-5': [1, 2, 3, 4, 5, '?'],
  '1-10': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '?'],
  evens: [2, 4, 6, 8, 10, 12, 14, 16, '?'],
  odds: [1, 3, 5, 7, 9, 11, 13, 15, '?'],
  custom: [] // Will be populated from customVotingValues
};

/**
 * Fibonacci sequence for calculating nearest value
 */
export const FIBONACCI_SEQUENCE = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];

/**
 * Utility function to get the nearest Fibonacci number
 */
export function getNearestFibonacci(value: number): number {
  if (value <= 0) return 0;
  
  let closest = FIBONACCI_SEQUENCE[0];
  let minDiff = Math.abs(value - closest);
  
  for (const fib of FIBONACCI_SEQUENCE) {
    const diff = Math.abs(value - fib);
    if (diff < minDiff) {
      minDiff = diff;
      closest = fib;
    }
  }
  
  return closest;
}

/**
 * Utility function to calculate vote statistics
 */
export function calculateVoteStats(users: User[]): VoteStats {
  const votedUsers = users.filter(user => user.hasVoted && user.vote !== undefined);
  const numericVotes = votedUsers
    .map(user => typeof user.vote === 'number' ? user.vote : parseInt(user.vote as string))
    .filter(vote => !isNaN(vote));
  
  const average = numericVotes.length > 0 
    ? numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length 
    : 0;
  
  const votes = votedUsers.map(user => ({
    userId: user.id,
    userName: user.name,
    vote: user.vote!
  }));
  
  return {
    totalVotes: votedUsers.length,
    average,
    nearestFibonacci: getNearestFibonacci(average),
    votes
  };
}