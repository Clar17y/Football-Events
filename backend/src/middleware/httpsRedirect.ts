/**
 * HTTPS Redirect Middleware
 * Redirects HTTP requests to HTTPS when enabled
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Create middleware that redirects HTTP to HTTPS
 * Checks both direct HTTPS and proxy headers (x-forwarded-proto)
 */
export function createHttpsRedirect(forceHttps: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!forceHttps) {
      return next();
    }

    // Check if request is already secure
    const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';

    if (!isSecure) {
      const host = req.get('host') || req.hostname;
      const redirectUrl = `https://${host}${req.url}`;
      return res.redirect(301, redirectUrl);
    }

    next();
  };
}

/**
 * HSTS (HTTP Strict Transport Security) middleware
 * Tells browsers to always use HTTPS for this domain
 */
export function createHstsMiddleware(enabled: boolean, maxAge: number = 31536000) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (enabled) {
      res.setHeader(
        'Strict-Transport-Security',
        `max-age=${maxAge}; includeSubDomains; preload`
      );
    }
    next();
  };
}
