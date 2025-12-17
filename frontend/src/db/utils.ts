/**
 * Database Utilities and Helpers
 * 
 * Common database operations, transaction helpers, and query builders
 * for enhanced IndexedDB functionality.
 */

import type { Table, Transaction } from 'dexie';
import type { GrassrootsDB } from './indexedDB';
import type { 
  EnhancedEvent, 
  EnhancedMatch, 
  EnhancedPlayer, 
  EnhancedTeam, 
  EnhancedSeason,
  EnhancedOutboxEvent 
} from './schema';
import type { OutboxEvent } from './indexedDB';
import type { ID, Timestamp } from '../types/index';
import { db } from './indexedDB';
import { autoLinkEvents } from './eventLinking';

/**
 * Bulk operation result interface
 */
export interface BulkOperationResult<T> {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ item: T; error: string }>;
  results: T[];
}

/**
 * Transaction helper for complex operations
 */
export async function withTransaction<T>(
  tables: string[],
  operation: (tx: Transaction) => Promise<T>
): Promise<T> {
  try {
    return await db.transaction('rw', tables.map(name => db.table(name)), operation);
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Bulk insert events with auto-linking
 */
export async function bulkInsertEvents(events: EnhancedEvent[]): Promise<BulkOperationResult<EnhancedEvent>> {
  const result: BulkOperationResult<EnhancedEvent> = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
    results: []
  };

  try {
    await withTransaction(['events'], async () => {
      for (const event of events) {
        try {
          // Add event to database
          await db.events.add(event);
          
          // Auto-link with existing events
          await autoLinkEvents(event);
          
          result.processed++;
          result.results.push(event);
        } catch (error) {
          result.failed++;
          result.errors.push({
            item: event,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          result.success = false;
        }
      }
    });

    console.log(`Bulk insert completed: ${result.processed} processed, ${result.failed} failed`);
    return result;
  } catch (error) {
    console.error('Bulk insert failed:', error);
    result.success = false;
    return result;
  }
}

/**
 * Bulk update events
 */
export async function bulkUpdateEvents(
  updates: Array<{ id: ID; changes: Partial<EnhancedEvent> }>
): Promise<BulkOperationResult<{ id: ID; changes: Partial<EnhancedEvent> }>> {
  const result: BulkOperationResult<{ id: ID; changes: Partial<EnhancedEvent> }> = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
    results: []
  };

  try {
    await withTransaction(['events'], async () => {
      for (const update of updates) {
        try {
          const updatedChanges = {
            ...update.changes,
            updatedAt: Date.now()
          };
          
          await db.events.update(update.id, updatedChanges);
          
          result.processed++;
          result.results.push(update);
        } catch (error) {
          result.failed++;
          result.errors.push({
            item: update,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          result.success = false;
        }
      }
    });

    return result;
  } catch (error) {
    console.error('Bulk update failed:', error);
    result.success = false;
    return result;
  }
}

/**
 * Get match events optimized for mid-match joins
 */
export async function getMatchEventsForJoin(matchId: ID): Promise<{
  events: EnhancedEvent[];
  currentScore: { our: number; opponent: number };
  matchInfo: EnhancedMatch | null;
  totalEvents: number;
}> {
  try {
    // Get match info
    const matchInfo = await db.matches.get(matchId);
    
    // Get all events for the match, ordered by time
    const events = await db.events
      .where('matchId')
      .equals(matchId)
      .toArray();
    
    // Sort by clockMs manually
    events.sort((a, b) => a.clockMs - b.clockMs);

    // Calculate current score from events
    let ourScore = 0;
    let opponentScore = 0;
    
    if (matchInfo) {
      for (const event of events) {
        if (event.kind === 'goal') {
          if (event.teamId === matchInfo.homeTeamId) {
            ourScore++;
          } else if (event.teamId === matchInfo.awayTeamId) {
            opponentScore++;
          }
        } else if (event.kind === 'own_goal') {
          // Own goal counts for the opposing team
          if (event.teamId === matchInfo.homeTeamId) {
            opponentScore++;
          } else if (event.teamId === matchInfo.awayTeamId) {
            ourScore++;
          }
        }
      }
    }

    return {
      events,
      currentScore: { our: ourScore, opponent: opponentScore },
      matchInfo: matchInfo || null,
      totalEvents: events.length
    };
  } catch (error) {
    console.error(`Error getting match events for join (match ${matchId}):`, error);
    return {
      events: [],
      currentScore: { our: 0, opponent: 0 },
      matchInfo: null,
      totalEvents: 0
    };
  }
}

/**
 * Get player performance summary
 */
export async function getPlayerPerformanceSummary(
  playerId: ID,
  matchId?: ID
): Promise<{
  totalEvents: number;
  eventBreakdown: Record<string, number>;
  averageSentiment: number;
  sentimentRange: { min: number; max: number };
  recentEvents: EnhancedEvent[];
}> {
  try {
    let query = db.events.where('playerId').equals(playerId);
    
    if (matchId) {
      query = db.events.where('[matchId+playerId]').equals([matchId, playerId]);
    }
    
    const events = await query.toArray();
    
    // Sort by tsServer in descending order
    events.sort((a, b) => b.tsServer - a.tsServer);
    
    // Calculate statistics
    const totalEvents = events.length;
    const eventBreakdown: Record<string, number> = {};
    let sentimentSum = 0;
    let minSentiment = 0;
    let maxSentiment = 0;
    
    for (const event of events) {
      // Event type breakdown
      eventBreakdown[event.kind] = (eventBreakdown[event.kind] || 0) + 1;
      
      // Sentiment analysis
      sentimentSum += event.sentiment;
      minSentiment = Math.min(minSentiment, event.sentiment);
      maxSentiment = Math.max(maxSentiment, event.sentiment);
    }
    
    const averageSentiment = totalEvents > 0 ? sentimentSum / totalEvents : 0;
    const recentEvents = events.slice(0, 10); // Last 10 events
    
    return {
      totalEvents,
      eventBreakdown,
      averageSentiment,
      sentimentRange: { min: minSentiment, max: maxSentiment },
      recentEvents
    };
  } catch (error) {
    console.error(`Error getting player performance summary for ${playerId}:`, error);
    return {
      totalEvents: 0,
      eventBreakdown: {},
      averageSentiment: 0,
      sentimentRange: { min: 0, max: 0 },
      recentEvents: []
    };
  }
}

/**
 * Get team performance summary
 */
export async function getTeamPerformanceSummary(
  teamId: ID,
  matchId?: ID
): Promise<{
  totalEvents: number;
  eventBreakdown: Record<string, number>;
  averageSentiment: number;
  playerContributions: Record<string, { events: number; sentiment: number }>;
  periodBreakdown: Record<number, number>;
}> {
  try {
    let query = db.events.where('teamId').equals(teamId);
    
    if (matchId) {
      query = db.events.where('[matchId+teamId]').equals([matchId, teamId]);
    }
    
    const events = await query.toArray();
    
    // Calculate statistics
    const totalEvents = events.length;
    const eventBreakdown: Record<string, number> = {};
    const playerContributions: Record<string, { events: number; sentiment: number }> = {};
    const periodBreakdown: Record<number, number> = {};
    let sentimentSum = 0;
    
    for (const event of events) {
      // Event type breakdown
      eventBreakdown[event.kind] = (eventBreakdown[event.kind] || 0) + 1;
      
      // Player contributions
      if (!playerContributions[event.playerId]) {
        playerContributions[event.playerId] = { events: 0, sentiment: 0 };
      }
      playerContributions[event.playerId].events++;
      playerContributions[event.playerId].sentiment += event.sentiment;
      
      // Period breakdown
      periodBreakdown[event.periodNumber] = (periodBreakdown[event.periodNumber] || 0) + 1;
      
      // Overall sentiment
      sentimentSum += event.sentiment;
    }
    
    const averageSentiment = totalEvents > 0 ? sentimentSum / totalEvents : 0;
    
    return {
      totalEvents,
      eventBreakdown,
      averageSentiment,
      playerContributions,
      periodBreakdown
    };
  } catch (error) {
    console.error(`Error getting team performance summary for ${teamId}:`, error);
    return {
      totalEvents: 0,
      eventBreakdown: {},
      averageSentiment: 0,
      playerContributions: {},
      periodBreakdown: {}
    };
  }
}

/**
 * Add item to outbox for sync
 */
export async function addToOutbox(
  tableName: string,
  recordId: ID,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  data?: any,
  createdByUserId?: string
): Promise<void> {
  try {
    const outboxEvent: OutboxEvent = {
      tableName: tableName,
      recordId: recordId,
      operation,
      data,
      synced: 0,
      createdAt: Date.now(),
      retryCount: 0,
      createdByUserId: createdByUserId || 'temp-user-id'
    };
    
    await db.outbox.add(outboxEvent);
    console.log(`Added ${operation} operation for ${tableName}:${recordId} to outbox`);
  } catch (error) {
    console.error(`Error adding to outbox:`, error);
    throw error;
  }
}

/**
 * Get unsynced items from outbox
 */
export async function getUnsyncedItems(limit: number = 50): Promise<OutboxEvent[]> {
  try {
    const items = await db.outbox
      .where('synced')
      .equals(0)
      .toArray();
    
    // Sort by createdAt and limit
    items.sort((a, b) => a.createdAt - b.createdAt);
    return items.slice(0, limit);
  } catch (error) {
    console.error('Error getting unsynced items:', error);
    return [];
  }
}

/**
 * Mark outbox item as synced
 */
export async function markAsSynced(outboxId: number): Promise<void> {
  try {
    await db.outbox.update(outboxId, {
      synced: 1,
      lastSyncAttempt: Date.now()
    });
  } catch (error) {
    console.error(`Error marking outbox item ${outboxId} as synced:`, error);
    throw error;
  }
}

/**
 * Mark outbox item as failed
 */
export async function markSyncFailed(outboxId: number, error: string): Promise<void> {
  try {
    const item = await db.outbox.get(outboxId);
    if (item) {
      await db.outbox.update(outboxId, {
        retryCount: (item.retryCount || 0) + 1,
        lastSyncAttempt: Date.now(),
        syncError: error,
        failedAt: Date.now()
      });
    }
  } catch (updateError) {
    console.error(`Error marking outbox item ${outboxId} as failed:`, updateError);
    throw updateError;
  }
}

/**
 * Clean up old synced outbox items
 */
export async function cleanupOutbox(olderThanDays: number = 7): Promise<number> {
  try {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const itemsToDelete = await db.outbox
      .where('synced')
      .equals(1)
      .and(item => Boolean(item.lastSyncAttempt && item.lastSyncAttempt < cutoffTime))
      .toArray();
    
    if (itemsToDelete.length > 0) {
      await db.outbox.bulkDelete(itemsToDelete.map(item => item.id!));
      console.log(`Cleaned up ${itemsToDelete.length} old outbox items`);
    }
    
    return itemsToDelete.length;
  } catch (error) {
    console.error('Error cleaning up outbox:', error);
    return 0;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  tables: Record<string, { count: number; size?: number }>;
  totalRecords: number;
  lastUpdated: Timestamp;
  outboxStats: {
    pending: number;
    failed: number;
    synced: number;
  };
}> {
  try {
    const tableNames = ['events', 'matches', 'teams', 'players', 'seasons', 'lineup', 'match_notes'];
    const tables: Record<string, { count: number; size?: number }> = {};
    let totalRecords = 0;
    
    // Get counts for each table
    for (const tableName of tableNames) {
      try {
        const count = await db.table(tableName).count();
        tables[tableName] = { count };
        totalRecords += count;
      } catch (error) {
        console.warn(`Error getting count for table ${tableName}:`, error);
        tables[tableName] = { count: 0 };
      }
    }
    
    // Get outbox statistics
    const pendingCount = await db.outbox.where('synced').equals(0).count();
    const failedCount = await db.outbox.where('retry_count').above(0).and(item => !item.synced).count();
    const syncedCount = await db.outbox.where('synced').equals(1).count();
    
    return {
      tables,
      totalRecords,
      lastUpdated: Date.now(),
      outboxStats: {
        pending: pendingCount,
        failed: failedCount,
        synced: syncedCount
      }
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      tables: {},
      totalRecords: 0,
      lastUpdated: Date.now(),
      outboxStats: { pending: 0, failed: 0, synced: 0 }
    };
  }
}

/**
 * Search events with flexible criteria
 */
export async function searchEvents(criteria: {
  matchId?: ID;
  playerId?: ID;
  teamId?: ID;
  eventKind?: string;
  periodNumber?: number;
  sentimentRange?: { min: number; max: number };
  timeRange?: { start: number; end: number };
  hasNotes?: boolean;
  isLinked?: boolean;
  limit?: number;
}): Promise<EnhancedEvent[]> {
  try {
    let query = db.events.toCollection();
    
    // Apply filters
    if (criteria.matchId) {
      query = query.and(event => event.matchId === criteria.matchId);
    }
    
    if (criteria.playerId) {
      query = query.and(event => event.playerId === criteria.playerId);
    }
    
    if (criteria.teamId) {
      query = query.and(event => event.teamId === criteria.teamId);
    }
    
    if (criteria.eventKind) {
      query = query.and(event => event.kind === criteria.eventKind);
    }
    
    if (criteria.periodNumber !== undefined) {
      query = query.and(event => event.periodNumber === criteria.periodNumber);
    }
    
    if (criteria.sentimentRange) {
      query = query.and(event => 
        event.sentiment >= criteria.sentimentRange!.min && 
        event.sentiment <= criteria.sentimentRange!.max
      );
    }
    
    if (criteria.timeRange) {
      query = query.and(event => 
        event.clockMs >= criteria.timeRange!.start && 
        event.clockMs <= criteria.timeRange!.end
      );
    }
    
    if (criteria.hasNotes !== undefined) {
      query = query.and(event => 
        criteria.hasNotes ? Boolean(event.notes && event.notes.length > 0) : !event.notes
      );
    }
    
    if (criteria.isLinked !== undefined) {
      query = query.and(event => 
        criteria.isLinked ? Boolean(event.linkedEvents && event.linkedEvents.length > 0) : !event.linkedEvents
      );
    }
    
    // Get results and sort manually
    const events = await query.toArray();
    
    // Sort by clockMs
    events.sort((a, b) => a.clockMs - b.clockMs);
    
    // Apply limit if specified
    if (criteria.limit) {
      return events.slice(0, criteria.limit);
    }
    
    return events;
  } catch (error) {
    console.error('Error searching events:', error);
    return [];
  }
}

/**
 * Development utility: Expose database reset functions to window
 * Call this from browser console if needed: window.resetDB()
 */
export function exposeDevUtilities(): void {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    (window as any).resetDB = async () => {
      try {
        console.log('Resetting database...');
        const result = await db.forceReset();
        if (result.success) {
          console.log('Database reset successfully. Please refresh the page.');
        } else {
          console.error('Database reset failed:', result.error);
        }
      } catch (error) {
        console.error('Database reset failed:', error);
      }
    };
    
    (window as any).clearDB = async () => {
      try {
        console.log('Clearing database data...');
        const result = await db.clearAllData();
        if (result.success) {
          console.log('Database data cleared successfully.');
        } else {
          console.error('Database clear failed:', result.error);
        }
      } catch (error) {
        console.error('Database clear failed:', error);
      }
    };
    
    console.log('Database utilities exposed: resetDB(), clearDB()');
  }
}