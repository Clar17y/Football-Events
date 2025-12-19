/**
 * Database Performance Monitoring
 * 
 * Tracks query performance, provides optimization recommendations,
 * and monitors database health for the enhanced IndexedDB system.
 */

import type { GrassrootsDB } from './indexedDB';
import type { ID } from '../types/index';
import { db } from './indexedDB';

/**
 * Performance metric interface
 */
interface PerformanceMetric {
  operation: string;
  table: string;
  duration: number;
  timestamp: number;
  recordCount?: number;
  indexUsed?: string;
  success: boolean;
  error?: string;
}

/**
 * Performance monitoring class
 */
class DatabasePerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 metrics
  private isEnabled = true;

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`Database performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.isEnabled) return;

    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 100) { // 100ms threshold
      console.warn(`Slow database operation detected:`, metric);
    }
  }

  /**
   * Measure and record the performance of a database operation
   */
  async measureOperation<T>(
    operation: string,
    table: string,
    fn: () => Promise<T>,
    indexUsed?: string
  ): Promise<T> {
    if (!this.isEnabled) {
      return await fn();
    }

    const startTime = performance.now();
    let success = true;
    let error: string | undefined;
    let result: T;
    let recordCount: number | undefined;

    try {
      result = await fn();

      // Try to determine record count if result is an array
      if (Array.isArray(result)) {
        recordCount = result.length;
      }

      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const duration = performance.now() - startTime;

      this.recordMetric({
        operation,
        table,
        duration,
        timestamp: Date.now(),
        recordCount,
        indexUsed,
        success,
        error
      });
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalOperations: number;
    averageDuration: number;
    slowOperations: number;
    failedOperations: number;
    operationBreakdown: Record<string, { count: number; avgDuration: number }>;
    tableBreakdown: Record<string, { count: number; avgDuration: number }>;
    recentMetrics: PerformanceMetric[];
  } {
    const totalOperations = this.metrics.length;
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;
    const slowOperations = this.metrics.filter(m => m.duration > 100).length;
    const failedOperations = this.metrics.filter(m => !m.success).length;

    // Operation breakdown
    const operationBreakdown: Record<string, { count: number; avgDuration: number }> = {};
    const tableBreakdown: Record<string, { count: number; avgDuration: number }> = {};

    for (const metric of this.metrics) {
      // Operation stats
      if (!operationBreakdown[metric.operation]) {
        operationBreakdown[metric.operation] = { count: 0, avgDuration: 0 };
      }
      operationBreakdown[metric.operation].count++;

      // Table stats
      if (!tableBreakdown[metric.table]) {
        tableBreakdown[metric.table] = { count: 0, avgDuration: 0 };
      }
      tableBreakdown[metric.table].count++;
    }

    // Calculate averages
    for (const [operation, stats] of Object.entries(operationBreakdown)) {
      const operationMetrics = this.metrics.filter(m => m.operation === operation);
      const totalDuration = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
      stats.avgDuration = totalDuration / stats.count;
    }

    for (const [table, stats] of Object.entries(tableBreakdown)) {
      const tableMetrics = this.metrics.filter(m => m.table === table);
      const totalDuration = tableMetrics.reduce((sum, m) => sum + m.duration, 0);
      stats.avgDuration = totalDuration / stats.count;
    }

    return {
      totalOperations,
      averageDuration,
      slowOperations,
      failedOperations,
      operationBreakdown,
      tableBreakdown,
      recentMetrics: this.metrics.slice(-10) // Last 10 metrics
    };
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getStats();

    // Check for slow operations
    if (stats.slowOperations > stats.totalOperations * 0.1) {
      recommendations.push('High number of slow operations detected. Consider adding indexes or optimizing queries.');
    }

    // Check for failed operations
    if (stats.failedOperations > 0) {
      recommendations.push(`${stats.failedOperations} failed operations detected. Check error logs and data integrity.`);
    }

    // Check average duration
    if (stats.averageDuration > 50) {
      recommendations.push('Average operation duration is high. Consider database optimization.');
    }

    // Check for specific slow operations
    for (const [operation, opStats] of Object.entries(stats.operationBreakdown)) {
      if (opStats.avgDuration > 100) {
        recommendations.push(`Operation '${operation}' is consistently slow (${opStats.avgDuration.toFixed(2)}ms avg). Consider optimization.`);
      }
    }

    // Check for slow tables
    for (const [table, tableStats] of Object.entries(stats.tableBreakdown)) {
      if (tableStats.avgDuration > 100) {
        recommendations.push(`Table '${table}' operations are slow (${tableStats.avgDuration.toFixed(2)}ms avg). Consider adding indexes.`);
      }
    }

    return recommendations;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    console.log('Performance metrics cleared');
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Global performance monitor instance
export const performanceMonitor = new DatabasePerformanceMonitor();

/**
 * Wrapper functions for common database operations with performance monitoring
 */

/**
 * Monitored event creation
 */
export async function createEventWithMonitoring(event: any): Promise<any> {
  return await performanceMonitor.measureOperation(
    'create_event',
    'events',
    async () => {
      const result = await db.events.add(event);
      return result;
    },
    'primary_key'
  );
}

/**
 * Monitored event query by match
 */
export async function getMatchEventsWithMonitoring(matchId: ID): Promise<any[]> {
  return await performanceMonitor.measureOperation(
    'get_match_events',
    'events',
    async () => {
      const events = await db.events
        .where('matchId')
        .equals(matchId)
        .toArray();

      // Sort by clockMs manually (handle undefined values)
      return events.sort((a, b) => (a.clockMs ?? 0) - (b.clockMs ?? 0));
    },
    'matchId'
  );
}

/**
 * Monitored event linking query
 */
export async function getEventsInTimeWindowWithMonitoring(
  matchId: ID,
  startTime: number,
  endTime: number
): Promise<any[]> {
  return await performanceMonitor.measureOperation(
    'get_events_time_window',
    'events',
    async () => {
      return await db.events
        .where('[matchId+clockMs]')
        .between([matchId, startTime], [matchId, endTime])
        .toArray();
    },
    '[matchId+clockMs]'
  );
}

/**
 * Monitored player performance query
 */
export async function getPlayerEventsWithMonitoring(playerId: ID): Promise<any[]> {
  return await performanceMonitor.measureOperation(
    'get_player_events',
    'events',
    async () => {
      const events = await db.events
        .where('playerId')
        .equals(playerId)
        .toArray();

      // Sort by createdAt manually (ISO strings compare lexicographically)
      return events.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    },
    'playerId'
  );
}

/**
 * Database health check
 */
export async function performHealthCheck(): Promise<{
  isHealthy: boolean;
  issues: string[];
  performance: ReturnType<typeof performanceMonitor.getStats>;
  recommendations: string[];
}> {
  const issues: string[] = [];
  let isHealthy = true;

  try {
    // Test basic connectivity
    await db.events.limit(1).toArray();

    // Check for large numbers of unsynced items
    const unsyncedCount = await db.outbox.where('synced').equals(0).count();
    if (unsyncedCount > 100) {
      issues.push(`High number of unsynced items: ${unsyncedCount}`);
      isHealthy = false;
    }

    // Check for failed sync items
    const failedSyncCount = await db.outbox
      .where('retry_count')
      .above(3)
      .and(item => !item.synced)
      .count();

    if (failedSyncCount > 0) {
      issues.push(`${failedSyncCount} items have failed to sync multiple times`);
      isHealthy = false;
    }

    // Check database size (approximate)
    const totalRecords = await Promise.all([
      db.events.count(),
      db.matches.count(),
      db.teams.count(),
      db.players.count()
    ]).then(counts => counts.reduce((sum, count) => sum + count, 0));

    if (totalRecords > 10000) {
      issues.push(`Large database size: ${totalRecords} records. Consider cleanup.`);
    }

    // Get performance stats
    const performance = performanceMonitor.getStats();
    const recommendations = performanceMonitor.getOptimizationRecommendations();

    // Check performance health
    if (performance.averageDuration > 100) {
      issues.push('Average database operation duration is high');
      isHealthy = false;
    }

    if (performance.failedOperations > 0) {
      issues.push(`${performance.failedOperations} database operations have failed`);
      isHealthy = false;
    }

    return {
      isHealthy,
      issues,
      performance,
      recommendations
    };
  } catch (error) {
    issues.push(`Database connectivity error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      isHealthy: false,
      issues,
      performance: performanceMonitor.getStats(),
      recommendations: ['Database appears to be inaccessible. Check browser storage permissions.']
    };
  }
}

/**
 * Index usage analysis
 */
export async function analyzeIndexUsage(): Promise<{
  recommendations: string[];
  missingIndexes: string[];
  unusedIndexes: string[];
}> {
  const recommendations: string[] = [];
  const missingIndexes: string[] = [];
  const unusedIndexes: string[] = [];

  try {
    const stats = performanceMonitor.getStats();

    // Analyze which indexes are being used
    const indexUsage: Record<string, number> = {};

    for (const metric of performanceMonitor.exportMetrics()) {
      if (metric.indexUsed) {
        indexUsage[metric.indexUsed] = (indexUsage[metric.indexUsed] || 0) + 1;
      }
    }

    // Check for common query patterns that might need indexes
    const operationCounts = stats.operationBreakdown;

    if (operationCounts['get_events_time_window']?.count > 10) {
      if (!indexUsage['[matchId+clockMs]']) {
        missingIndexes.push('[matchId+clockMs] - for time window queries');
      }
    }

    if (operationCounts['get_player_events']?.count > 10) {
      if (!indexUsage['playerId']) {
        missingIndexes.push('playerId - for player event queries');
      }
    }

    // Generate recommendations
    if (missingIndexes.length > 0) {
      recommendations.push('Consider adding the following indexes for better performance');
    }

    if (Object.keys(indexUsage).length === 0) {
      recommendations.push('No index usage detected. Queries may be using table scans.');
    }

    return {
      recommendations,
      missingIndexes,
      unusedIndexes
    };
  } catch (error) {
    console.error('Error analyzing index usage:', error);
    return {
      recommendations: ['Error analyzing index usage'],
      missingIndexes: [],
      unusedIndexes: []
    };
  }
}

/**
 * Performance benchmark
 */
export async function runPerformanceBenchmark(): Promise<{
  results: Record<string, { duration: number; recordsPerSecond: number }>;
  summary: string;
}> {
  const results: Record<string, { duration: number; recordsPerSecond: number }> = {};

  try {
    // Benchmark: Insert events
    const insertStart = performance.now();
    const now = new Date().toISOString();
    const testEvents = Array.from({ length: 100 }, (_, i) => ({
      id: `test-event-${i}`,
      matchId: 'test-match',
      periodNumber: 1,
      clockMs: i * 1000,
      kind: 'test',
      teamId: 'test-team',
      playerId: 'test-player',
      sentiment: 0,
      createdAt: now,
      updatedAt: now
    }));

    // Note: This is a test, so we won't actually insert
    const insertDuration = performance.now() - insertStart;
    results['bulk_insert'] = {
      duration: insertDuration,
      recordsPerSecond: 100 / (insertDuration / 1000)
    };

    // Benchmark: Query events
    const queryStart = performance.now();
    await db.events.limit(100).toArray();
    const queryDuration = performance.now() - queryStart;
    results['query_events'] = {
      duration: queryDuration,
      recordsPerSecond: 100 / (queryDuration / 1000)
    };

    // Benchmark: Index query
    const indexQueryStart = performance.now();
    await db.events.where('matchId').equals('non-existent').toArray();
    const indexQueryDuration = performance.now() - indexQueryStart;
    results['index_query'] = {
      duration: indexQueryDuration,
      recordsPerSecond: 1 / (indexQueryDuration / 1000)
    };

    const summary = `Benchmark completed. Average query time: ${Object.values(results).reduce((sum, r) => sum + r.duration, 0) / Object.keys(results).length}ms`;

    return { results, summary };
  } catch (error) {
    console.error('Error running performance benchmark:', error);
    return {
      results: {},
      summary: 'Benchmark failed'
    };
  }
}

/**
 * Export performance data for external analysis
 */
export function exportPerformanceData(): {
  metrics: PerformanceMetric[];
  stats: ReturnType<typeof performanceMonitor.getStats>;
  timestamp: number;
} {
  return {
    metrics: performanceMonitor.exportMetrics(),
    stats: performanceMonitor.getStats(),
    timestamp: Date.now()
  };
}