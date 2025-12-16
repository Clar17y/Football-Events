import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import 'express-async-errors';
import { validateEnv, getNumericEnv, isDevelopment } from './config/env';

// Load environment variables
dotenv.config();

// Validate environment variables at startup
const env = validateEnv();

const app = express();
const server = createServer(app);
const prisma = new PrismaClient();

// Socket.io setup - Allow both localhost and network access
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://192.168.1.58:5173',
      env.FRONTEND_URL
    ],
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration - Allow both localhost and network access
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.1.58:5173',
    env.FRONTEND_URL
  ],
  credentials: true
}));

// Rate limiting - disabled in test environment, generous for real-time sports
if (env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: getNumericEnv(env.RATE_LIMIT_WINDOW_MS, 60000), // 1 minute window
    max: getNumericEnv(env.RATE_LIMIT_MAX_REQUESTS, 1000), // 1000 requests per minute
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV || 'development',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV || 'development',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API routes
import v1Routes from './routes/v1';
app.use('/api/v1', v1Routes);

// Import error handling middleware
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Join match room for live updates
  socket.on('join-match', (matchId: string) => {
    socket.join(`match-${matchId}`);
    console.log(`Client ${socket.id} joined match ${matchId}`);
  });
  
  // Leave match room
  socket.on('leave-match', (matchId: string) => {
    socket.leave(`match-${matchId}`);
    console.log(`Client ${socket.id} left match ${matchId}`);
  });
  
  // Handle real-time match events
  socket.on('match_event', async (event, callback) => {
    try {
      console.log('📡 Received real-time event:', event.id);
      
      // Broadcast to all clients in the match room (except sender)
      socket.to(`match-${event.match_id}`).emit('live_event', event);
      
      // Acknowledge successful receipt
      if (callback) {
        callback({ success: true });
      }
      
      // Confirm event was processed
      socket.emit('match_event_confirmed', event.id);
      
      console.log(`✅ Event ${event.id} broadcasted to match-${event.match_id}`);
    } catch (error) {
      console.error('❌ Error handling real-time event:', error);
      
      if (callback) {
        callback({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = getNumericEnv(env.PORT, 3001);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${env.FRONTEND_URL}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Network access: http://192.168.1.58:${PORT}/api/health`);
});

// Export io for use in route handlers
export { app, io };