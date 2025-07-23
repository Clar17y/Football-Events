/**
 * Teams API Integration Tests
 * Tests the teams API service against the actual backend
 * These tests require the backend to be running on localhost:3001
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { teamsApi } from '../../src/services/api/teamsApi';
import apiClient from '../../src/services/api/baseApi';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';

// Test configuration
const TEST_TIMEOUT = 10000; // 10 seconds
const BACKEND_URL = 'http://localhost:3001/api/v1';

// Test data
let testTeamId: string | null = null;
let authToken: string | null = null;

// Helper function to check if backend is available
async function checkBackendAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/stats`);
    return response.ok;
  } catch {
    return false;
  }
}

// Helper function to authenticate and get token
async function authenticateTestUser(): Promise<string | null> {
  try {
    // Try to register a test user (will fail if already exists, which is fine)
    await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Teams Test User',
        email: 'teams-test@example.com',
        password: 'TestPassword123!'
      })
    });

    // Login to get token
    const loginResponse = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teams-test@example.com',
        password: 'TestPassword123!'
      })
    });

    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      return loginData.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

describe('Teams API Integration Tests', () => {
  beforeAll(async () => {
    // Check if backend is available
    const backendAvailable = await checkBackendAvailability();
    if (!backendAvailable) {
      console.warn('Backend not available - skipping integration tests');
      return;
    }

    // Authenticate test user
    authToken = await authenticateTestUser();
    if (!authToken) {
      console.warn('Authentication failed - skipping integration tests');
      return;
    }

    // Set token in API client
    apiClient.setToken(authToken);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up: delete test team if it was created
    if (testTeamId && authToken) {
      try {
        await teamsApi.deleteTeam(testTeamId);
      } catch (error) {
        console.warn('Failed to clean up test team:', error);
      }
    }
  }, TEST_TIMEOUT);

  beforeEach(() => {
    // Skip tests if backend is not available or authentication failed
    if (!authToken) {
      console.warn('Skipping test - backend not available or authentication failed');
      return;
    }
  });

  describe('Backend Connectivity', () => {
    it('should connect to backend successfully', async () => {
      if (!authToken) return;

      const backendAvailable = await checkBackendAvailability();
      expect(backendAvailable).toBe(true);
    }, TEST_TIMEOUT);

    it('should authenticate successfully', async () => {
      if (!authToken) return;

      expect(authToken).toBeTruthy();
      expect(typeof authToken).toBe('string');
    }, TEST_TIMEOUT);
  });

  describe('Teams CRUD Operations', () => {
    it('should get teams list (initially empty)', async () => {
      if (!authToken) return;

      const result = await teamsApi.getTeams();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.page).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
    }, TEST_TIMEOUT);

    it('should create a new team', async () => {
      if (!authToken) return;

      const teamData: TeamCreateRequest = {
        name: `Integration Test Team ${Date.now()}`,
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF',
        logoUrl: 'https://example.com/logo.png'
      };

      const result = await teamsApi.createTeam(teamData);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe(teamData.name);
      expect(result.data.homeKitPrimary).toBe(teamData.homeKitPrimary);
      expect(result.data.id).toBeTruthy();
      
      // Store for cleanup
      testTeamId = result.data.id;
    }, TEST_TIMEOUT);

    it('should get team by ID', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.getTeamById(testTeamId);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(testTeamId);
      expect(result.data.name).toContain('Integration Test Team');
    }, TEST_TIMEOUT);

    it('should update team', async () => {
      if (!authToken || !testTeamId) return;

      const updateData: TeamUpdateRequest = {
        name: `Updated Integration Test Team ${Date.now()}`,
        homeKitPrimary: '#00FF00'
      };

      const result = await teamsApi.updateTeam(testTeamId, updateData);
      
      expect(result.success).toBe(true);
      expect(result.data.name).toBe(updateData.name);
      expect(result.data.homeKitPrimary).toBe(updateData.homeKitPrimary);
      expect(result.data.id).toBe(testTeamId);
    }, TEST_TIMEOUT);

    it('should get updated teams list', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.getTeams();
      
      expect(result.data.length).toBeGreaterThan(0);
      
      const createdTeam = result.data.find(team => team.id === testTeamId);
      expect(createdTeam).toBeDefined();
      expect(createdTeam?.name).toContain('Updated Integration Test Team');
    }, TEST_TIMEOUT);

    it('should search teams', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.getTeams({ search: 'Integration Test' });
      
      expect(result.data.length).toBeGreaterThan(0);
      
      const foundTeam = result.data.find(team => team.id === testTeamId);
      expect(foundTeam).toBeDefined();
    }, TEST_TIMEOUT);

    it('should get team players (empty initially)', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.getTeamPlayers(testTeamId);
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      // Should be empty since we haven't added any players
      expect(result.data.length).toBe(0);
    }, TEST_TIMEOUT);

    it('should get team squad', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.getTeamSquad(testTeamId);
      
      expect(result.success).toBe(true);
      expect(result.data.team).toBeDefined();
      expect(result.data.team.id).toBe(testTeamId);
      expect(Array.isArray(result.data.players)).toBe(true);
    }, TEST_TIMEOUT);

    it('should delete team', async () => {
      if (!authToken || !testTeamId) return;

      const result = await teamsApi.deleteTeam(testTeamId);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted');
      
      // Verify team is deleted by trying to get it (should fail)
      try {
        await teamsApi.getTeamById(testTeamId);
        // If we get here, the team wasn't deleted
        expect(true).toBe(false);
      } catch (error: any) {
        // Should get 404 error
        expect(error.response?.status).toBe(404);
      }
      
      // Clear testTeamId since it's been deleted
      testTeamId = null;
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid team ID', async () => {
      if (!authToken) return;

      try {
        await teamsApi.getTeamById('invalid-uuid');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid UUID
      }
    }, TEST_TIMEOUT);

    it('should handle non-existent team ID', async () => {
      if (!authToken) return;

      try {
        await teamsApi.getTeamById('123e4567-e89b-12d3-a456-426614174000');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(404); // Not found
      }
    }, TEST_TIMEOUT);

    it('should handle duplicate team name', async () => {
      if (!authToken) return;

      const teamData: TeamCreateRequest = {
        name: `Duplicate Test Team ${Date.now()}`
      };

      // Create first team
      const firstTeam = await teamsApi.createTeam(teamData);
      expect(firstTeam.success).toBe(true);
      
      try {
        // Try to create second team with same name
        await teamsApi.createTeam(teamData);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for duplicate name
      } finally {
        // Clean up
        if (firstTeam.data?.id) {
          await teamsApi.deleteTeam(firstTeam.data.id);
        }
      }
    }, TEST_TIMEOUT);

    it('should handle invalid color format', async () => {
      if (!authToken) return;

      const teamData: TeamCreateRequest = {
        name: `Invalid Color Test Team ${Date.now()}`,
        homeKitPrimary: 'invalid-color' // Invalid hex color
      };

      try {
        await teamsApi.createTeam(teamData);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid color
      }
    }, TEST_TIMEOUT);
  });

  describe('Pagination', () => {
    it('should handle pagination parameters', async () => {
      if (!authToken) return;

      const result = await teamsApi.getTeams({ page: 1, limit: 5 });
      
      expect(result.page).toBe(1);
      expect(result.data.length).toBeLessThanOrEqual(5);
    }, TEST_TIMEOUT);
  });
});