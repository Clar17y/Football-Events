import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(userId: string, email: string, role: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    role,
    type: 'access'
  };
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'grassroots-pwa',
    audience: 'grassroots-users'
  } as jwt.SignOptions);
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId: string, email: string, role: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    role,
    type: 'refresh'
  };
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: 'grassroots-pwa',
    audience: 'grassroots-users'
  } as jwt.SignOptions);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'grassroots-pwa',
      audience: 'grassroots-users'
    } as jwt.VerifyOptions) as JWTPayload;
    
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

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}