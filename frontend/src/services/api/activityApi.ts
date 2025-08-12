import apiClient from './baseApi';

export interface ActivityItem {
  id: string;
  type: 'team' | 'player' | 'season' | 'match' | 'award' | 'event';
  action: string;
  description: string;
  entityId: string;
  entityName: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface ActivityResponse {
  data: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ActivityOptions {
  limit?: number;
  days?: number;
  page?: number;
}

export const activityApi = {
  /**
   * Get recent activity across all entities
   */
  async getRecentActivity(options: ActivityOptions = {}): Promise<ActivityResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.days) params.append('days', options.days.toString());
    if (options.page) params.append('page', options.page.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/activity/recent?${queryString}` : '/activity/recent';

    const response = await apiClient.get(endpoint);
    // response.data is the backend response: { success: true, data: [...], meta: {...} }
    return response.data as ActivityResponse;
  }
};