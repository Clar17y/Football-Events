/**
 * Runtime validation schemas using Zod
 * 
 * This file contains validation schemas for all data structures
 * to ensure type safety at runtime and provide user-friendly
 * error messages.
 */

import { z } from 'zod';

/**
 * Common validation schemas
 */
export const IdSchema = z.string().min(1, 'ID cannot be empty');
export const TimestampSchema = z.number().int().positive('Timestamp must be a positive integer');
export const OptionalStringSchema = z.string().optional();
export const OptionalNumberSchema = z.number().optional();

/**
 * Player position validation
 */
export const PlayerPositionSchema = z.enum([
  'goalkeeper',
  'defender',
  'midfielder',
  'forward',
  'substitute'
]);

/**
 * Player validation schema
 */
export const PlayerSchema = z.object({
  id: IdSchema,
  full_name: z.string().min(1, 'Player name is required').max(100, 'Player name too long'),
  jersey_number: z.number().int().min(1).max(99).optional(),
  position: PlayerPositionSchema.optional(),
  is_active: z.boolean(),
  team_id: IdSchema.optional(),
});

/**
 * Team validation schema
 */
export const TeamSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'Team name is required').max(50, 'Team name too long'),
  players: z.array(PlayerSchema),
  color_primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  color_secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  formation: z.string().regex(/^\d+-\d+(-\d+)*$/, 'Invalid formation format (e.g., 4-4-2)').optional(),
});

/**
 * Event kind validation
 */
export const EventKindSchema = z.enum([
  'goal',
  'assist',
  'key_pass',
  'save',
  'ball_won',
  'corner',
  'free_kick',
  'penalty',
  'foul',
  'ball_lost',
  'own_goal',
  'ball_out'
]);

/**
 * Sentiment validation (must be between -4 and 4)
 */
export const SentimentSchema = z.number().int().min(-4, 'Sentiment must be at least -4').max(4, 'Sentiment must be at most 4');

/**
 * Coordinates validation
 */
export const CoordinatesSchema = z.object({
  x: z.number().min(0, 'X coordinate must be at least 0').max(100, 'X coordinate must be at most 100'),
  y: z.number().min(0, 'Y coordinate must be at least 0').max(100, 'Y coordinate must be at most 100'),
});

/**
 * Event payload validation schema
 */
export const EventPayloadSchema = z.object({
  kind: EventKindSchema,
  match_id: IdSchema,
  season_id: IdSchema,
  team_id: IdSchema,
  player_id: IdSchema,
  period_number: z.number().int().positive('Period number must be positive'),
  clock_ms: z.number().int().min(0, 'Clock time cannot be negative'),
  sentiment: SentimentSchema,
  notes: z.string().max(500, 'Notes too long (max 500 characters)').optional(),
  created: TimestampSchema,
  coordinates: CoordinatesSchema.optional(),
});

/**
 * Match event validation schema
 */
export const MatchEventSchema = EventPayloadSchema.extend({
  id: IdSchema,
  metadata: z.object({
    auto_detected: z.boolean().optional(),
    confidence: z.number().min(0).max(1).optional(),
    related_events: z.array(IdSchema).optional(),
  }).optional(),
});

/**
 * Match status validation
 */
export const MatchStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'half_time',
  'extra_time',
  'penalty_shootout',
  'completed',
  'abandoned',
  'postponed'
]);

/**
 * Match settings validation schema
 */
export const MatchSettingsSchema = z.object({
  period_duration: z.number().int().min(1, 'Period duration must be at least 1 minute').max(120, 'Period duration too long'),
  total_periods: z.number().int().min(1, 'Must have at least 1 period').max(4, 'Too many periods'),
  half_time_duration: z.number().int().min(0, 'Half-time duration cannot be negative').max(30, 'Half-time too long'),
  allow_extra_time: z.boolean(),
  extra_time_duration: z.number().int().min(0).max(30),
  allow_penalty_shootout: z.boolean(),
  max_substitutions: z.number().int().min(0, 'Cannot have negative substitutions').max(11, 'Too many substitutions'),
  track_injury_time: z.boolean(),
});

/**
 * Match clock validation schema
 */
export const MatchClockSchema = z.object({
  running: z.boolean(),
  start_ts: TimestampSchema.nullable(),
  offset_ms: z.number().int().min(0, 'Offset cannot be negative'),
  current_period: z.number().int().positive('Current period must be positive'),
  period_starts: z.record(z.string(), TimestampSchema),
});

/**
 * Match result validation schema
 */
export const MatchResultSchema = z.object({
  home_score: z.number().int().min(0, 'Score cannot be negative'),
  away_score: z.number().int().min(0, 'Score cannot be negative'),
  went_to_extra_time: z.boolean(),
  went_to_penalty_shootout: z.boolean(),
  penalty_result: z.object({
    home_penalties: z.number().int().min(0),
    away_penalties: z.number().int().min(0),
    sequence: z.array(z.object({
      team_id: IdSchema,
      player_id: IdSchema,
      scored: z.boolean(),
      order: z.number().int().positive(),
    })),
  }).optional(),
  winner: z.enum(['home', 'away']).optional(),
  final_status: MatchStatusSchema,
});

/**
 * Complete match validation schema
 */
export const MatchSchema = z.object({
  id: IdSchema,
  season_id: IdSchema,
  home_team: TeamSchema,
  away_team: TeamSchema,
  date: TimestampSchema,
  status: MatchStatusSchema,
  settings: MatchSettingsSchema,
  current_period: z.number().int().positive(),
  clock: MatchClockSchema,
  result: MatchResultSchema.optional(),
  metadata: z.object({
    venue: OptionalStringSchema,
    weather: OptionalStringSchema,
    referee: OptionalStringSchema,
    competition: OptionalStringSchema,
    match_type: z.enum(['league', 'cup', 'friendly', 'playoff']).optional(),
    notes: OptionalStringSchema,
  }).optional(),
});

/**
 * Outbox event validation schema
 */
export const OutboxEventSchema = z.object({
  id: z.number().int().positive().optional(),
  payload: EventPayloadSchema,
  synced: z.boolean(),
  created_at: TimestampSchema,
  retry_count: z.number().int().min(0).optional(),
  last_sync_attempt: TimestampSchema.optional(),
  sync_error: OptionalStringSchema,
  failed_at: TimestampSchema.optional(),
});

/**
 * Validation helper functions
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate data against a schema and return typed result
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => {
        const path = err.path.join('.');
        const contextStr = context ? `${context}.` : '';
        return `${contextStr}${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: [`Validation failed: ${error}`] };
  }
}

/**
 * Validate and throw on error (for use in functions that should fail fast)
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = validateData(schema, data, context);
  if (!result.success) {
    // Type assertion to help TypeScript understand the discriminated union
    const failureResult = result as { success: false; errors: string[] };
    throw new ValidationError(
      failureResult.errors.join(', '),
      context || 'unknown',
      data
    );
  }
  return result.data;
}

/**
 * Partial validation for updates (makes all fields optional)
 */
export function createUpdateSchema<T extends z.ZodRawShape>(
  baseSchema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  return baseSchema.partial();
}

/**
 * Common validation schemas for forms
 */
export const FormValidation = {
  playerName: z.string().min(1, 'Player name is required').max(100, 'Name too long'),
  teamName: z.string().min(1, 'Team name is required').max(50, 'Name too long'),
  jerseyNumber: z.number().int().min(1, 'Jersey number must be at least 1').max(99, 'Jersey number must be at most 99'),
  notes: z.string().max(500, 'Notes too long (max 500 characters)'),
  sentiment: SentimentSchema,
  eventKind: EventKindSchema,
} as const;