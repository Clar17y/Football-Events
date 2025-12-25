import apiClient from './baseApi';
import type { Event, EventCreateRequest } from '@shared/types';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import { db } from '../../db/indexedDB';
import { dbToEvent } from '../../db/transforms';
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
    if (!event.teamId) {
      throw new Error('Team ID is required for events');
    }

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

    return dbToEvent(localEvent);
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

    return dbToEvent(updatedEvent);
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
