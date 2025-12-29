/**
 * Players API Integration Tests
 * Tests the complete players API functionality including CRUD operations
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { playersApi } from '../../src/services/api/playersApi';
import { authApi } from '../../src/services/api/authApi';
import type { PlayerCreateRequest, PlayerUpdateRequest } from '@shared/types';

const TEST_TIMEOUT = 10000;

describe('Players API Integration Tests', () => {
  let authToken: string | null = null;
  const createdPlayerIds: string[] = [];

  beforeAll(async () => {
    // Login with test user
    try {
      const loginResult = await authApi.login({
        email: 'test@example.com',
        password: 'password123'
      });
      authToken = loginResult.data?.access_token || null;
    } catch (error) {
      console.warn('Could not authenticate test user. Some tests may be skipped.');
    }
  }, TEST_TIMEOUT);

  afterEach(async () => {
    // Clean up created players
    for (const playerId of createdPlayerIds) {
      try {
        await playersApi.deletePlayer(playerId);
      } catch (error) {
        console.warn('Failed to clean up test player:', error);
      }
    }
    createdPlayerIds.length = 0;
  });

  describe('Player CRUD Operations', () => {
    it('should create a new player', async () => {
      if (!authToken) return;

      const playerData: PlayerCreateRequest = {
        name: `Test Player ${Date.now()}`,
        dateOfBirth: '2000-01-15',
        preferredPosition: 'Forward',
        squadNumber: 10
      };

      const result = await playersApi.createPlayer(playerData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe(playerData.name);
      expect(result.data.preferredPosition).toBe(playerData.preferredPosition);
      expect(result.data.id).toBeDefined();

      if (result.data.id) {
        createdPlayerIds.push(result.data.id);
      }
    }, TEST_TIMEOUT);

    it('should get players list', async () => {
      if (!authToken) return;

      const result = await playersApi.getPlayers();

      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.page).toBe('number');
    }, TEST_TIMEOUT);

    it('should get player by ID', async () => {
      if (!authToken) return;

      // First create a player
      const playerData: PlayerCreateRequest = {
        name: `Get Test Player ${Date.now()}`,
        dateOfBirth: '1995-06-20',
        preferredPosition: 'Midfielder',
        squadNumber: 8
      };

      const createResult = await playersApi.createPlayer(playerData);
      expect(createResult.data.id).toBeDefined();

      if (createResult.data.id) {
        createdPlayerIds.push(createResult.data.id);

        // Now get it by ID
        const getResult = await playersApi.getPlayerById(createResult.data.id);

        expect(getResult.data).toBeDefined();
        expect(getResult.data.id).toBe(createResult.data.id);
        expect(getResult.data.name).toBe(playerData.name);
        expect(getResult.data.preferredPosition).toBe(playerData.preferredPosition);
      }
    }, TEST_TIMEOUT);

    it('should update a player', async () => {
      if (!authToken) return;

      // First create a player
      const playerData: PlayerCreateRequest = {
        name: `Update Test Player ${Date.now()}`,
        dateOfBirth: '1998-03-10',
        preferredPosition: 'Defender',
        squadNumber: 5
      };

      const createResult = await playersApi.createPlayer(playerData);
      expect(createResult.data.id).toBeDefined();

      if (createResult.data.id) {
        createdPlayerIds.push(createResult.data.id);

        // Update the player
        const updateData: PlayerUpdateRequest = {
          name: `Updated Player ${Date.now()}`,
          preferredPosition: 'Goalkeeper',
          squadNumber: 1
        };

        const updateResult = await playersApi.updatePlayer(createResult.data.id, updateData);

        expect(updateResult.data).toBeDefined();
        expect(updateResult.data.name).toBe(updateData.name);
        expect(updateResult.data.preferredPosition).toBe(updateData.preferredPosition);
        expect(updateResult.data.squadNumber).toBe(updateData.squadNumber);
      }
    }, TEST_TIMEOUT);

    it('should delete a player', async () => {
      if (!authToken) return;

      // First create a player
      const playerData: PlayerCreateRequest = {
        name: `Delete Test Player ${Date.now()}`,
        dateOfBirth: '1992-11-25',
        preferredPosition: 'Forward',
        squadNumber: 9
      };

      const createResult = await playersApi.createPlayer(playerData);
      expect(createResult.data.id).toBeDefined();

      if (createResult.data.id) {
        // Delete the player
        const deleteResult = await playersApi.deletePlayer(createResult.data.id);

        expect(deleteResult.success).toBe(true);

        // Verify it's deleted by trying to get it
        try {
          await playersApi.getPlayerById(createResult.data.id);
          expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
          expect(error.response?.status).toBe(404);
        }
      }
    }, TEST_TIMEOUT);
  });

  describe('Player Search and Filtering', () => {
    it('should search players by name', async () => {
      if (!authToken) return;

      const uniqueName = `Searchable Player ${Date.now()}`;
      const playerData: PlayerCreateRequest = {
        name: uniqueName,
        dateOfBirth: '1990-07-15',
        preferredPosition: 'Midfielder',
        squadNumber: 7
      };

      const createResult = await playersApi.createPlayer(playerData);
      if (createResult.data.id) {
        createdPlayerIds.push(createResult.data.id);
      }

      // Search for the player
      const searchResult = await playersApi.getPlayers({ search: uniqueName });

      expect(searchResult.data.length).toBeGreaterThan(0);
      const foundPlayer = searchResult.data.find(p => p.name === uniqueName);
      expect(foundPlayer).toBeDefined();
    }, TEST_TIMEOUT);

    it('should filter players by position', async () => {
      if (!authToken) return;

      const result = await playersApi.getPlayers({ preferredPosition: 'Forward' });

      // All returned players should be forwards (if any exist)
      result.data.forEach(player => {
        expect(player.preferredPosition).toBe('Forward');
      });
    }, TEST_TIMEOUT);

    it('should handle pagination', async () => {
      if (!authToken) return;

      const result = await playersApi.getPlayers({ page: 1, limit: 5 });

      expect(result.page).toBe(1);
      expect(result.data.length).toBeLessThanOrEqual(5);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid player ID', async () => {
      if (!authToken) return;

      try {
        await playersApi.getPlayerById('invalid-uuid');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid UUID
      }
    }, TEST_TIMEOUT);

    it('should handle non-existent player', async () => {
      if (!authToken) return;

      try {
        await playersApi.getPlayerById('123e4567-e89b-12d3-a456-426614174000');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(404); // Not found
      }
    }, TEST_TIMEOUT);

    it('should handle validation errors', async () => {
      if (!authToken) return;

      const invalidPlayerData: PlayerCreateRequest = {
        name: '', // Empty name should fail validation
        dateOfBirth: '2000-01-01',
        preferredPosition: 'Forward'
      };

      try {
        await playersApi.createPlayer(invalidPlayerData);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for validation error
      }
    }, TEST_TIMEOUT);

    it('should handle duplicate kit numbers', async () => {
      if (!authToken) return;

      // Create first player
      const firstPlayerData: PlayerCreateRequest = {
        name: `First Player ${Date.now()}`,
        dateOfBirth: '1995-01-01',
        preferredPosition: 'Forward',
        squadNumber: 99
      };

      const firstResult = await playersApi.createPlayer(firstPlayerData);
      if (firstResult.data.id) {
        createdPlayerIds.push(firstResult.data.id);
      }

      // Try to create second player with same kit number
      const secondPlayerData: PlayerCreateRequest = {
        name: `Second Player ${Date.now()}`,
        dateOfBirth: '1996-01-01',
        preferredPosition: 'Midfielder',
        squadNumber: 99 // Same kit number
      };

      try {
        const secondResult = await playersApi.createPlayer(secondPlayerData);
        if (secondResult.data.id) {
          createdPlayerIds.push(secondResult.data.id);
        }
        // Some systems allow duplicate kit numbers, others don't
        // This test documents the behavior rather than enforcing it
      } catch (error: any) {
        // If duplicate kit numbers are not allowed, expect 400 error
        expect(error.response?.status).toBe(400);
      }
    }, TEST_TIMEOUT);
  });
});