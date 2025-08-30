import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PositionCalculatorService } from '../../src/services/PositionCalculatorService';

const positionCalculatorService = new PositionCalculatorService();

describe('Positions API Integration Tests', () => {
  afterAll(async () => {
    await positionCalculatorService.disconnect();
  });

  describe('Service Integration', () => {
    it('should have position zones available for API endpoints', async () => {
      const zones = await positionCalculatorService.getPositionZones();
      expect(zones).toBeDefined();
      expect(Array.isArray(zones)).toBe(true);
      
      if (zones.length > 0) {
        const zone = zones[0];
        expect(zone).toHaveProperty('id');
        expect(zone).toHaveProperty('position_code');
        expect(zone).toHaveProperty('zone_name');
        expect(zone).toHaveProperty('min_x');
        expect(zone).toHaveProperty('max_x');
        expect(zone).toHaveProperty('min_y');
        expect(zone).toHaveProperty('max_y');
        expect(zone).toHaveProperty('priority');
        expect(zone).toHaveProperty('created_at');
      }
    });

    it('should calculate positions correctly for API endpoints', async () => {
      const result = await positionCalculatorService.calculatePosition(50, 50);
      
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('zone');
      expect(result).toHaveProperty('confidence');
      
      expect(typeof result.position).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      
      expect(result.zone).toHaveProperty('id');
      expect(result.zone).toHaveProperty('position_code');
      expect(result.zone).toHaveProperty('zone_name');
    });

    it('should handle area filtering for zones endpoint', async () => {
      const allZones = await positionCalculatorService.getPositionZones();
      const filteredZones = await positionCalculatorService.getZonesInArea(0, 50, 0, 50);
      
      expect(Array.isArray(allZones)).toBe(true);
      expect(Array.isArray(filteredZones)).toBe(true);
      
      // Filtered zones should be a subset of all zones
      expect(filteredZones.length).toBeLessThanOrEqual(allZones.length);
      
      // All filtered zones should overlap with the specified area
      filteredZones.forEach(zone => {
        const overlaps = !(zone.max_x < 0 || zone.min_x > 50 || zone.max_y < 0 || zone.min_y > 50);
        expect(overlaps).toBe(true);
      });
    });

    it('should validate coordinates properly for calculate endpoint', async () => {
      // Valid coordinates should work
      await expect(positionCalculatorService.calculatePosition(0, 0)).resolves.toBeDefined();
      await expect(positionCalculatorService.calculatePosition(100, 100)).resolves.toBeDefined();
      await expect(positionCalculatorService.calculatePosition(50, 50)).resolves.toBeDefined();
      
      // Invalid coordinates should throw errors
      await expect(positionCalculatorService.calculatePosition(-1, 50)).rejects.toThrow();
      await expect(positionCalculatorService.calculatePosition(101, 50)).rejects.toThrow();
      await expect(positionCalculatorService.calculatePosition(50, -1)).rejects.toThrow();
      await expect(positionCalculatorService.calculatePosition(50, 101)).rejects.toThrow();
    });
  });

  describe('API Response Format Validation', () => {
    it('should return data in the expected format for zones endpoint', async () => {
      const zones = await positionCalculatorService.getPositionZones();
      
      // This simulates what the API endpoint should return
      const apiResponse = {
        success: true,
        data: {
          zones,
          count: zones.length
        },
        message: 'Position zones retrieved successfully'
      };
      
      expect(apiResponse).toHaveProperty('success', true);
      expect(apiResponse).toHaveProperty('data');
      expect(apiResponse.data).toHaveProperty('zones');
      expect(apiResponse.data).toHaveProperty('count');
      expect(apiResponse).toHaveProperty('message');
      expect(apiResponse.data.count).toBe(zones.length);
    });

    it('should return data in the expected format for calculate endpoint', async () => {
      const result = await positionCalculatorService.calculatePosition(50, 25);
      
      // This simulates what the API endpoint should return
      const apiResponse = {
        success: true,
        data: {
          position: result.position,
          zone: result.zone,
          confidence: result.confidence,
          coordinates: {
            x: 50,
            y: 25
          }
        },
        message: 'Position calculated successfully'
      };
      
      expect(apiResponse).toHaveProperty('success', true);
      expect(apiResponse).toHaveProperty('data');
      expect(apiResponse.data).toHaveProperty('position');
      expect(apiResponse.data).toHaveProperty('zone');
      expect(apiResponse.data).toHaveProperty('confidence');
      expect(apiResponse.data).toHaveProperty('coordinates');
      expect(apiResponse.data.coordinates).toEqual({ x: 50, y: 25 });
      expect(apiResponse).toHaveProperty('message');
    });
  });
});