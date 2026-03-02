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
    timerDuration?: number;
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
    votes: {
        userId: string;
        userName: string;
        vote: string | number;
    }[];
}
/**
 * Server-Sent Event types
 */
export type SSEEventType = 'room-updated' | 'user-joined' | 'user-left' | 'vote-cast' | 'votes-revealed' | 'timer-started' | 'timer-tick' | 'timer-ended' | 'story-updated' | 'settings-updated';
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
    duration: number;
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
export declare const VOTING_OPTIONS: Record<VotingOption, (string | number)[]>;
/**
 * Fibonacci sequence for calculating nearest value
 */
export declare const FIBONACCI_SEQUENCE: number[];
/**
 * Utility function to get the nearest Fibonacci number
 */
export declare function getNearestFibonacci(value: number): number;
/**
 * Utility function to calculate vote statistics
 */
export declare function calculateVoteStats(users: User[]): VoteStats;
//# sourceMappingURL=types.d.ts.map