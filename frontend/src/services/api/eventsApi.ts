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
   * Create an event - LOCAL-FIRST
   */
  async create(event: EventCreateRequest): Promise<Event> {
    const { eventsDataLayer } = await import('../dataLayer');

    const localEvent = await eventsDataLayer.create({
      matchId: event.matchId,
      kind: event.kind,
      periodNumber: event.periodNumber,
      clockMs: event.clockMs,
      teamId: event.teamId,
      playerId: event.playerId,
      notes: event.notes,
      sentiment: event.sentiment,
    });

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return transformToApiEvent(localEvent);
  },

  /**
   * Update an event - LOCAL-FIRST
   */
  async update(id: string, data: Partial<EventCreateRequest & { sentiment: number; notes?: string; playerId?: string | null }>): Promise<Event> {
    const { eventsDataLayer } = await import('../dataLayer');

    await eventsDataLayer.update(id, {
      kind: data.kind,
      periodNumber: data.periodNumber,
      clockMs: data.clockMs,
      teamId: data.teamId,
      playerId: data.playerId ?? undefined,
      notes: data.notes,
      sentiment: data.sentiment,
    });

    const updatedEvent = await db.events.get(id);
    if (!updatedEvent) {
      throw new Error(`Event ${id} not found`);
    }

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return transformToApiEvent(updatedEvent);
  },

  /**
   * Delete an event - LOCAL-FIRST
   */
  async delete(id: string): Promise<void> {
    const { eventsDataLayer } = await import('../dataLayer');
    await eventsDataLayer.delete(id);
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }
  }
};

export default eventsApi;
