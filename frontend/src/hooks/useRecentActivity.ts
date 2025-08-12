import { useState, useEffect } from 'react';
import { activityApi, type ActivityItem, type ActivityOptions } from '../services/api/activityApi';
import { useAuth } from '../contexts/AuthContext';

export interface UseRecentActivityResult {
  activities: ActivityItem[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null;
  refresh: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
}

export const useRecentActivity = (options: ActivityOptions = {}): UseRecentActivityResult => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseRecentActivityResult['pagination']>(null);
  const [currentPage, setCurrentPage] = useState(1);



  const fetchActivities = async () => {
    console.log('fetchActivities called', { user: !!user });
    if (!user) {
      console.log('No user, returning early');
      setActivities([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const requestOptions = { ...options, page: currentPage };
      const response = await activityApi.getRecentActivity(requestOptions);
      setActivities(response.data || []);
      setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch recent activity:', err);
      setError('Failed to load recent activity');
      setActivities([]);
    } finally {
      setLoading(false);
      console.log('fetchActivities completed');
    }
  };

  const goToPage = async (page: number) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    fetchActivities();
  }, [user?.id, options.limit, options.days, currentPage]);

  return {
    activities,
    loading,
    error,
    pagination,
    refresh: fetchActivities,
    goToPage
  };
};