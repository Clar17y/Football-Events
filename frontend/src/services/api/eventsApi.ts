import apiClient from './baseApi';
import type { Event, EventCreateRequest } from '@shared/types';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import { db } from '../../db/indexedDB';
import type { EnhancedEvent } from '../../db/schema';

/**
 * Show offline toast notification
 * Requirements: 4.2 - Show toast when data is saved locally
 */
function showOfflineToast(message: string): void {
  try {
    (window as any).__toastApi?.current?.showInfo?.(message);
  } catch {
    console.log('[eventsApi] Offline:', message);
  }
}

/**
 * Transform local EnhancedEvent to API Event format
 * Requirements: 1.2 - Return transformed local event
 */
function transformToApiEvent(localEvent: EnhancedEvent): Event {
  return {
    id: localEvent.id,
    matchId: localEvent.match_id,
    createdAt: new Date(localEvent.created_at),
    periodNumber: localEvent.period_number,
    clockMs: localEvent.clock_ms,
    kind: localEvent.kind,
    teamId: localEvent.team_id || undefined,
    playerId: localEvent.player_id || undefined,
    notes: localEvent.notes,
    sentiment: localEvent.sentiment,
    updatedAt: localEvent.updated_at ? new Date(localEvent.updated_at) : undefined,
    created_by_user_id: localEvent.created_by_user_id,
    deleted_at: localEvent.deleted_at ? new Date(localEvent.deleted_at) : undefined,
    deleted_by_user_id: localEvent.deleted_by_user_id,
    is_deleted: localEvent.is_deleted,
  };
}

export const eventsApi = {
  async getByMatch(matchId: string): Promise<Event[]> {
    const response = await apiClient.get<Event[]>(`/events/match/${matchId}`);
    return response.data as unknown as Event[];
  },

  /**
   * Create an event with offline fallback
   * 
   * Requirements: 1.1 - Write to local events table with synced equals false when offline
   * Requirements: 1.2 - Return locally created event without throwing network error
   * Requirements: 5.1 - Use authenticated user ID for created_by_user_id
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async create(event: EventCreateRequest): Promise<Event> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<Event>('/events', event);
        return response.data as unknown as Event;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: write to local events table
    const now = Date.now();
    const eventId = `event-${now}-${Math.random().toString(36).slice(2, 11)}`;
    const userId = getCurrentUserId();

    const localEvent: EnhancedEvent = {
      id: eventId,
      match_id: event.matchId,
      ts_server: now,
      period_number: event.periodNumber ?? 1,
      clock_ms: event.clockMs ?? 0,
      kind: event.kind,
      team_id: event.teamId ?? '',
      player_id: event.playerId ?? '',
      sentiment: event.sentiment ?? 0,
      notes: event.notes,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    };

    await db.events.add(localEvent);
    showOfflineToast('Event saved locally - will sync when online');

    return transformToApiEvent(localEvent);
  },

  /**
   * Update an event with offline fallback
   * 
   * Requirements: 1.1 - Update local record if exists when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async update(id: string, data: Partial<EventCreateRequest & { sentiment: number; notes?: string; playerId?: string | null }>): Promise<Event> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.put<Event>(`/events/${id}`, data);
        return response.data as unknown as Event;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local record
    const existingEvent = await db.events.get(id);
    if (!existingEvent) {
      throw new Error(`Event ${id} not found in local storage`);
    }

    const now = Date.now();
    const updates: Partial<EnhancedEvent> = {
      updated_at: now,
      synced: false,
    };

    // Map API fields to local schema fields
    if (data.matchId !== undefined) updates.match_id = data.matchId;
    if (data.periodNumber !== undefined) updates.period_number = data.periodNumber;
    if (data.clockMs !== undefined) updates.clock_ms = data.clockMs;
    if (data.kind !== undefined) updates.kind = data.kind;
    if (data.teamId !== undefined) updates.team_id = data.teamId;
    if (data.playerId !== undefined) updates.player_id = data.playerId ?? '';
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.sentiment !== undefined) updates.sentiment = data.sentiment;

    await db.events.update(id, updates);
    showOfflineToast('Event updated locally - will sync when online');

    const updatedEvent = await db.events.get(id);
    if (!updatedEvent) {
      throw new Error(`Failed to retrieve updated event ${id}`);
    }

    return transformToApiEvent(updatedEvent);
  },

  /**
   * Delete an event with offline fallback
   * 
   * Requirements: 1.1 - Mark local record as deleted when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async delete(id: string): Promise<void> {
    // Try server first if online
    if (isOnline()) {
      try {
        await apiClient.delete(`/events/${id}`);
        return;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: mark local record as deleted (soft delete)
    const existingEvent = await db.events.get(id);
    if (!existingEvent) {
      // Event doesn't exist locally - nothing to delete
      return;
    }

    const now = Date.now();
    const userId = getCurrentUserId();

    await db.events.update(id, {
      is_deleted: true,
      deleted_at: now,
      deleted_by_user_id: userId,
      updated_at: now,
      synced: false,
    });

    showOfflineToast('Event deleted locally - will sync when online');
  }
};

export default eventsApi;
