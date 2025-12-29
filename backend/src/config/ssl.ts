/**
 * SSL/TLS Configuration for HTTPS support
 * Loads SSL certificates and provides HTTPS server options
 */

import fs from 'fs';
import type { ServerOptions } from 'https';

export interface SSLConfig {
  enabled: boolean;
  options?: ServerOptions;
}

export interface SSLEnvVars {
  SSL_ENABLED?: string;
  SSL_KEY_PATH?: string;
  SSL_CERT_PATH?: string;
  SSL_CA_PATH?: string;
  FORCE_HTTPS?: string;
}

/**
 * Load SSL configuration from environment variables
 * Returns enabled: false if SSL is disabled or certificates are missing
 */
export function loadSSLConfig(env: SSLEnvVars): SSLConfig {
  const enabled = env.SSL_ENABLED === 'true';

  if (!enabled) {
    return { enabled: false };
  }

  const keyPath = env.SSL_KEY_PATH;
  const certPath = env.SSL_CERT_PATH;

  if (!keyPath || !certPath) {
    console.warn('[SSL] SSL enabled but SSL_KEY_PATH or SSL_CERT_PATH not set - falling back to HTTP');
    return { enabled: false };
  }

  try {
    const options: ServerOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    // Optional CA bundle for certificate chain
    if (env.SSL_CA_PATH) {
      try {
        options.ca = fs.readFileSync(env.SSL_CA_PATH);
      } catch (caError) {
        console.warn('[SSL] Failed to load CA bundle, continuing without it:', caError);
      }
    }

    console.log('[SSL] SSL certificates loaded successfully');
    return { enabled: true, options };
  } catch (error) {
    console.error('[SSL] Failed to load SSL certificates:', error);
    console.warn('[SSL] Falling back to HTTP');
    return { enabled: false };
  }
}

/**
 * Check if HTTPS redirect should be enforced
 */
export function shouldForceHttps(env: SSLEnvVars): boolean {
  return env.FORCE_HTTPS === 'true';
}
