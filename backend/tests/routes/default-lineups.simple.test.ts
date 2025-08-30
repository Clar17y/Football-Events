import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/app';

describe('Default Lineups API - Simple Route Tests', () => {
  
  describe('Route Registration', () => {
    it('should respond to POST /api/v1/default-lineups with 401 (route exists)', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups')
        .send({
          teamId: '550e8400-e29b-41d4-a716-446655440000',
          formation: []
        });

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to GET /api/v1/default-lineups/:teamId with 401 (route exists)', async () => {
      const response = await request(app)
        .get('/api/v1/default-lineups/550e8400-e29b-41d4-a716-446655440000');

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to PUT /api/v1/default-lineups/:teamId with 401 (route exists)', async () => {
      const response = await request(app)
        .put('/api/v1/default-lineups/550e8400-e29b-41d4-a716-446655440000')
        .send({
          formation: []
        });

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to DELETE /api/v1/default-lineups/:teamId with 401 (route exists)', async () => {
      const response = await request(app)
        .delete('/api/v1/default-lineups/550e8400-e29b-41d4-a716-446655440000');

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to GET /api/v1/default-lineups with 401 (route exists)', async () => {
      const response = await request(app)
        .get('/api/v1/default-lineups');

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to POST /api/v1/default-lineups/validate with 401 (route exists)', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups/validate')
        .send({
          formation: []
        });

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });

    it('should respond to POST /api/v1/default-lineups/:teamId/apply-to-match with 401 (route exists)', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups/550e8400-e29b-41d4-a716-446655440000/apply-to-match')
        .send({
          matchId: '550e8400-e29b-41d4-a716-446655440001'
        });

      // Should get 401 Unauthorized, not 404 Not Found
      expect(response.status).toBe(401);
    });
  });

  describe('Validation', () => {
    it('should return 401 for invalid UUID in GET request (auth runs first)', async () => {
      const response = await request(app)
        .get('/api/v1/default-lineups/invalid-uuid');

      // Should get 401 Unauthorized (auth middleware runs before UUID validation)
      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid UUID in PUT request (auth runs first)', async () => {
      const response = await request(app)
        .put('/api/v1/default-lineups/invalid-uuid')
        .send({
          formation: []
        });

      // Should get 401 Unauthorized (auth middleware runs before UUID validation)
      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid UUID in DELETE request (auth runs first)', async () => {
      const response = await request(app)
        .delete('/api/v1/default-lineups/invalid-uuid');

      // Should get 401 Unauthorized (auth middleware runs before UUID validation)
      expect(response.status).toBe(401);
    });
  });
});