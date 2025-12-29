/**
 * Environment variable configuration with type safety
 * Validates required environment variables at startup
 */

interface RequiredEnv {
  DATABASE_URL: string;
  FRONTEND_URL: string;
  PORT: string;
}

interface OptionalEnv {
  NODE_ENV?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  // SSL/HTTPS configuration
  SSL_ENABLED?: string;
  SSL_KEY_PATH?: string;
  SSL_CERT_PATH?: string;
  SSL_CA_PATH?: string;
  FORCE_HTTPS?: string;
}

export type Env = RequiredEnv & OptionalEnv;

/**
 * Validates and returns typed environment variables
 * Throws error if required variables are missing
 */
export function validateEnv(): Env {
  const required: (keyof RequiredEnv)[] = ['DATABASE_URL', 'FRONTEND_URL', 'PORT'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  const result: Env = {
    DATABASE_URL: process.env['DATABASE_URL']!,
    FRONTEND_URL: process.env['FRONTEND_URL']!,
    PORT: process.env['PORT']!,
  };

  // Add optional properties only if they exist
  if (process.env['NODE_ENV']) {
    result.NODE_ENV = process.env['NODE_ENV'];
  }
  if (process.env['RATE_LIMIT_WINDOW_MS']) {
    result.RATE_LIMIT_WINDOW_MS = process.env['RATE_LIMIT_WINDOW_MS'];
  }
  if (process.env['RATE_LIMIT_MAX_REQUESTS']) {
    result.RATE_LIMIT_MAX_REQUESTS = process.env['RATE_LIMIT_MAX_REQUESTS'];
  }

  // SSL configuration
  if (process.env['SSL_ENABLED']) {
    result.SSL_ENABLED = process.env['SSL_ENABLED'];
  }
  if (process.env['SSL_KEY_PATH']) {
    result.SSL_KEY_PATH = process.env['SSL_KEY_PATH'];
  }
  if (process.env['SSL_CERT_PATH']) {
    result.SSL_CERT_PATH = process.env['SSL_CERT_PATH'];
  }
  if (process.env['SSL_CA_PATH']) {
    result.SSL_CA_PATH = process.env['SSL_CA_PATH'];
  }
  if (process.env['FORCE_HTTPS']) {
    result.FORCE_HTTPS = process.env['FORCE_HTTPS'];
  }

  return result;
}

/**
 * Helper function to get numeric environment variables with defaults
 */
export function getNumericEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Helper function to check if we're in development mode
 */
export function isDevelopment(env: Env): boolean {
  return env.NODE_ENV !== 'production';
}