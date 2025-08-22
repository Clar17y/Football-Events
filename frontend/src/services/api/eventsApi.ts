import apiClient from './baseApi';
import type { Event, EventCreateRequest } from '@shared/types';

export const eventsApi = {
  async getByMatch(matchId: string): Promise<Event[]> {
    const response = await apiClient.get<Event[]>(`/events/match/${matchId}`);
    return response.data as unknown as Event[];
  },
  async create(event: EventCreateRequest): Promise<Event> {
    const response = await apiClient.post<Event>('/events', event);
    return response.data as unknown as Event;
  },
  async update(id: string, data: Partial<EventCreateRequest & { sentiment: number; notes?: string; playerId?: string | null }>): Promise<Event> {
    const response = await apiClient.put<Event>(`/events/${id}`, data);
    return response.data as unknown as Event;
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/events/${id}`);
  }
};

export default eventsApi;
