/**
 * Event Auto-Linking System
 * 
 * Automatically links related events based on timing and event types.
 * Supports bidirectional linking and cross-team relationships.
 */

import type { EnhancedEvent } from './schema';
import type { ID, Timestamp } from '../types/index';
import { EVENT_RELATIONSHIPS, LINKING_CONFIG } from './schema';
import { db } from './indexedDB';

/**
 * Auto-link events when a new event is created
 */
export async function autoLinkEvents(newEvent: EnhancedEvent): Promise<void> {
  try {
    const relatedKinds = EVENT_RELATIONSHIPS[newEvent.kind as keyof typeof EVENT_RELATIONSHIPS];
    if (!relatedKinds || relatedKinds.length === 0) {
      return; // No relationships defined for this event type
    }

    // Define time window for linking (15 seconds before and after)
    const timeWindow = {
      start: newEvent.clock_ms - LINKING_CONFIG.TIME_WINDOW_MS,
      end: newEvent.clock_ms + LINKING_CONFIG.TIME_WINDOW_MS
    };

    // Find candidate events within the time window
    const candidateEvents = await findCandidateEvents(
      newEvent.match_id,
      timeWindow,
      relatedKinds,
      newEvent.id
    );

    // Create bidirectional links with all candidates
    for (const candidate of candidateEvents) {
      await linkEventsBidirectionally(newEvent.id, candidate.id);
    }

    console.log(`Auto-linked ${candidateEvents.length} events to ${newEvent.kind} event ${newEvent.id}`);
  } catch (error) {
    console.error('Error in auto-linking events:', error);
    // Don't throw - linking failure shouldn't prevent event creation
  }
}

/**
 * Find candidate events for linking within time window
 */
async function findCandidateEvents(
  matchId: ID,
  timeWindow: { start: number; end: number },
  relatedKinds: readonly string[],
  excludeEventId: ID
): Promise<EnhancedEvent[]> {
  const candidates = await db.events
    .where('[match_id+clock_ms]')
    .between(
      [matchId, timeWindow.start],
      [matchId, timeWindow.end],
      true, // Include lower bound
      true  // Include upper bound
    )
    .and(event => 
      [...relatedKinds].includes(event.kind) && 
      event.id !== excludeEventId &&
      (!event.linked_events || event.linked_events.length < LINKING_CONFIG.MAX_LINKS_PER_EVENT)
    )
    .toArray();

  return candidates;
}

/**
 * Create bidirectional links between two events
 */
async function linkEventsBidirectionally(eventId1: ID, eventId2: ID): Promise<void> {
  const now = Date.now();
  
  try {
    // Use transaction to ensure both updates succeed or fail together
    await db.transaction('rw', db.events, async () => {
      // Update first event
      const event1 = await db.events.get(eventId1);
      if (event1) {
        const updatedLinkedEvents1 = addToLinkedEvents(event1.linked_events || [], eventId2);
        await db.events.update(eventId1, {
          linked_events: updatedLinkedEvents1,
          auto_linked_at: now,
          updated_at: now
        });
      }
      
      // Update second event
      const event2 = await db.events.get(eventId2);
      if (event2) {
        const updatedLinkedEvents2 = addToLinkedEvents(event2.linked_events || [], eventId1);
        await db.events.update(eventId2, {
          linked_events: updatedLinkedEvents2,
          auto_linked_at: now,
          updated_at: now
        });
      }
    });

    console.log(`Successfully linked events ${eventId1} and ${eventId2}`);
  } catch (error) {
    console.error(`Error linking events ${eventId1} and ${eventId2}:`, error);
    throw error;
  }
}

/**
 * Add an event ID to the linked_events array, avoiding duplicates
 */
function addToLinkedEvents(currentLinks: ID[], newEventId: ID): ID[] {
  if (currentLinks.includes(newEventId)) {
    return currentLinks; // Already linked
  }
  
  const updatedLinks = [...currentLinks, newEventId];
  
  // Respect maximum links limit
  if (updatedLinks.length > LINKING_CONFIG.MAX_LINKS_PER_EVENT) {
    return updatedLinks.slice(-LINKING_CONFIG.MAX_LINKS_PER_EVENT);
  }
  
  return updatedLinks;
}

/**
 * Remove a link between two events
 */
export async function unlinkEvents(eventId1: ID, eventId2: ID): Promise<void> {
  const now = Date.now();
  
  try {
    await db.transaction('rw', db.events, async () => {
      // Remove eventId2 from eventId1's links
      const event1 = await db.events.get(eventId1);
      if (event1 && event1.linked_events) {
        const updatedLinks1 = event1.linked_events.filter(id => id !== eventId2);
        await db.events.update(eventId1, {
          linked_events: updatedLinks1.length > 0 ? updatedLinks1 : undefined,
          updated_at: now
        });
      }
      
      // Remove eventId1 from eventId2's links
      const event2 = await db.events.get(eventId2);
      if (event2 && event2.linked_events) {
        const updatedLinks2 = event2.linked_events.filter(id => id !== eventId1);
        await db.events.update(eventId2, {
          linked_events: updatedLinks2.length > 0 ? updatedLinks2 : undefined,
          updated_at: now
        });
      }
    });

    console.log(`Successfully unlinked events ${eventId1} and ${eventId2}`);
  } catch (error) {
    console.error(`Error unlinking events ${eventId1} and ${eventId2}:`, error);
    throw error;
  }
}

/**
 * Get all events linked to a specific event
 */
export async function getLinkedEvents(eventId: ID): Promise<EnhancedEvent[]> {
  try {
    const event = await db.events.get(eventId);
    if (!event || !event.linked_events || event.linked_events.length === 0) {
      return [];
    }

    const linkedEvents = await db.events
      .where('id')
      .anyOf(event.linked_events)
      .toArray();

    return linkedEvents.sort((a, b) => a.clock_ms - b.clock_ms);
  } catch (error) {
    console.error(`Error getting linked events for ${eventId}:`, error);
    return [];
  }
}

/**
 * Get events with their linked events populated
 */
export async function getEventsWithLinks(matchId: ID): Promise<(EnhancedEvent & { linkedEventDetails?: EnhancedEvent[] })[]> {
  try {
    const events = await db.events
      .where('match_id')
      .equals(matchId)
      .toArray();
    
    // Sort by clock_ms
    events.sort((a, b) => a.clock_ms - b.clock_ms);

    // Populate linked event details
    const eventsWithLinks = await Promise.all(
      events.map(async (event) => {
        if (event.linked_events && event.linked_events.length > 0) {
          const linkedEventDetails = await getLinkedEvents(event.id);
          return { ...event, linkedEventDetails };
        }
        return event;
      })
    );

    return eventsWithLinks;
  } catch (error) {
    console.error(`Error getting events with links for match ${matchId}:`, error);
    return [];
  }
}

/**
 * Retroactively link existing events in a match
 * Useful for linking events that were added out of order
 */
export async function retroactivelyLinkMatchEvents(matchId: ID): Promise<number> {
  try {
    const events = await db.events
      .where('match_id')
      .equals(matchId)
      .toArray();
    
    // Sort by clock_ms
    events.sort((a, b) => a.clock_ms - b.clock_ms);

    let linksCreated = 0;

    for (const event of events) {
      const relatedKinds = EVENT_RELATIONSHIPS[event.kind];
      if (!relatedKinds || relatedKinds.length === 0) continue;

      // Find events within linking window
      const timeWindow = {
        start: event.clock_ms - LINKING_CONFIG.TIME_WINDOW_MS,
        end: event.clock_ms + LINKING_CONFIG.TIME_WINDOW_MS
      };

      const candidates = events.filter(candidate => 
        candidate.id !== event.id &&
        candidate.clock_ms >= timeWindow.start &&
        candidate.clock_ms <= timeWindow.end &&
        (relatedKinds as readonly string[]).includes(candidate.kind) &&
        (!event.linked_events || !event.linked_events.includes(candidate.id))
      );

      // Link with candidates
      for (const candidate of candidates) {
        await linkEventsBidirectionally(event.id, candidate.id);
        linksCreated++;
      }
    }

    console.log(`Retroactively created ${linksCreated} links for match ${matchId}`);
    return linksCreated;
  } catch (error) {
    console.error(`Error in retroactive linking for match ${matchId}:`, error);
    return 0;
  }
}

/**
 * Get linking statistics for a match
 */
export async function getMatchLinkingStats(matchId: ID): Promise<{
  totalEvents: number;
  linkedEvents: number;
  totalLinks: number;
  linkingPercentage: number;
  eventTypeBreakdown: Record<string, { total: number; linked: number }>;
}> {
  try {
    const events = await db.events
      .where('match_id')
      .equals(matchId)
      .toArray();

    const totalEvents = events.length;
    const linkedEvents = events.filter(e => e.linked_events && e.linked_events.length > 0).length;
    const totalLinks = events.reduce((sum, e) => sum + (e.linked_events?.length || 0), 0) / 2; // Divide by 2 for bidirectional links
    const linkingPercentage = totalEvents > 0 ? (linkedEvents / totalEvents) * 100 : 0;

    // Event type breakdown
    const eventTypeBreakdown: Record<string, { total: number; linked: number }> = {};
    for (const event of events) {
      if (!eventTypeBreakdown[event.kind]) {
        eventTypeBreakdown[event.kind] = { total: 0, linked: 0 };
      }
      eventTypeBreakdown[event.kind].total++;
      if (event.linked_events && event.linked_events.length > 0) {
        eventTypeBreakdown[event.kind].linked++;
      }
    }

    return {
      totalEvents,
      linkedEvents,
      totalLinks,
      linkingPercentage,
      eventTypeBreakdown
    };
  } catch (error) {
    console.error(`Error getting linking stats for match ${matchId}:`, error);
    return {
      totalEvents: 0,
      linkedEvents: 0,
      totalLinks: 0,
      linkingPercentage: 0,
      eventTypeBreakdown: {}
    };
  }
}

/**
 * Validate event relationships configuration
 */
export function validateEventRelationships(): boolean {
  try {
    // Check for bidirectional consistency
    for (const [eventType, relatedTypes] of Object.entries(EVENT_RELATIONSHIPS)) {
      for (const relatedType of relatedTypes) {
        const reverseRelations = EVENT_RELATIONSHIPS[relatedType as keyof typeof EVENT_RELATIONSHIPS];
        if (!reverseRelations || !(reverseRelations as readonly string[]).includes(eventType)) {
          console.warn(`Missing reverse relationship: ${relatedType} should include ${eventType}`);
          return false;
        }
      }
    }
    
    console.log('Event relationships validation passed');
    return true;
  } catch (error) {
    console.error('Error validating event relationships:', error);
    return false;
  }
}