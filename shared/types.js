"use strict";
// Shared types for the pointing poker application
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIBONACCI_SEQUENCE = exports.VOTING_OPTIONS = void 0;
exports.getNearestFibonacci = getNearestFibonacci;
exports.calculateVoteStats = calculateVoteStats;
/**
 * Predefined voting values
 */
exports.VOTING_OPTIONS = {
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
exports.FIBONACCI_SEQUENCE = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
/**
 * Utility function to get the nearest Fibonacci number
 */
function getNearestFibonacci(value) {
    if (value <= 0)
        return 0;
    let closest = exports.FIBONACCI_SEQUENCE[0];
    let minDiff = Math.abs(value - closest);
    for (const fib of exports.FIBONACCI_SEQUENCE) {
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
function calculateVoteStats(users) {
    const votedUsers = users.filter(user => user.hasVoted && user.vote !== undefined);
    const numericVotes = votedUsers
        .map(user => typeof user.vote === 'number' ? user.vote : parseInt(user.vote))
        .filter(vote => !isNaN(vote));
    const average = numericVotes.length > 0
        ? numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length
        : 0;
    const votes = votedUsers.map(user => ({
        userId: user.id,
        userName: user.name,
        vote: user.vote
    }));
    return {
        totalVotes: votedUsers.length,
        average,
        nearestFibonacci: getNearestFibonacci(average),
        votes
    };
}
//# sourceMappingURL=types.js.map