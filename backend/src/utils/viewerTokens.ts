import * as jwt from 'jsonwebtoken';

// Separate viewer token config from user auth tokens
const VIEWER_JWT_SECRET = process.env['VIEWER_JWT_SECRET'] || process.env['JWT_SECRET'] || 'viewer-token-secret-change-me';
const VIEWER_ISSUER = 'grassroots-pwa';
const VIEWER_AUDIENCE = 'grassroots-viewers';

export interface ViewerTokenPayload {
  matchId: string;
  scope: 'viewer';
  type: 'viewer';
}

export interface VerifiedViewerToken extends ViewerTokenPayload {
  exp: number; // seconds since epoch
  iat: number; // seconds since epoch
}

export function signViewerToken(matchId: string, expiresInMinutes: number = 480): { token: string; expiresAt: string } {
  const payload: ViewerTokenPayload = { matchId, scope: 'viewer', type: 'viewer' };
  const expiresIn = `${Math.max(1, Math.floor(expiresInMinutes))}m` as jwt.SignOptions['expiresIn'];
  const token = jwt.sign(payload, VIEWER_JWT_SECRET, {
    expiresIn,
    issuer: VIEWER_ISSUER,
    audience: VIEWER_AUDIENCE,
  } as jwt.SignOptions);

  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now();
  return { token, expiresAt: new Date(expMs).toISOString() };
}

export function verifyViewerToken(token: string): VerifiedViewerToken {
  try {
    const decoded = jwt.verify(token, VIEWER_JWT_SECRET, {
      issuer: VIEWER_ISSUER,
      audience: VIEWER_AUDIENCE,
    } as jwt.VerifyOptions) as VerifiedViewerToken;

    if (decoded.scope !== 'viewer' || decoded.type !== 'viewer') {
      throw new Error('Invalid viewer token scope');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
}

