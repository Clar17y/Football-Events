import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Team,
  TeamCreateRequest,
  TeamUpdateRequest,
  transformTeam,
  transformTeamCreateRequest,
  transformTeamUpdateRequest,
  PrismaTeam
} from '@shared/types';

describe('Team Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let createdTeamIds: string[] = [];

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    // Clean up created teams after each test
    if (createdTeamIds.length > 0) {
      await prisma.team.deleteMany({
        where: {
          id: {
            in: createdTeamIds
          }
        }
      });
      createdTeamIds = [];
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Team Creation', () => {
    it('should create a team using frontend interface and transform correctly', async () => {
      // 1. Create team data using frontend interface
      const frontendTeamData: TeamCreateRequest = {
        name: 'Manchester United FC',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#000000',
        awayKitSecondary: '#FFD700',
        logoUrl: 'https://example.com/logos/manchester-united.png'
      };

      // 2. Transform to Prisma format
      const prismaInput = transformTeamCreateRequest(frontendTeamData);

      // 3. Verify transformation structure
      expect(prismaInput).toEqual({
        name: 'Manchester United FC',
        home_kit_primary: '#FF0000',
        home_kit_secondary: '#FFFFFF',
        away_kit_primary: '#000000',
        away_kit_secondary: '#FFD700',
        logo_url: 'https://example.com/logos/manchester-united.png'
      });

      // 4. Create in database
      const createdTeam: PrismaTeam = await prisma.team.create({
        data: prismaInput
      });

      // Track for cleanup
      createdTeamIds.push(createdTeam.id);

      // 5. Verify database record
      expect(createdTeam.id).toBeDefined();
      expect(createdTeam.name).toBe('Manchester United FC');
      expect(createdTeam.home_kit_primary).toBe('#FF0000');
      expect(createdTeam.home_kit_secondary).toBe('#FFFFFF');
      expect(createdTeam.away_kit_primary).toBe('#000000');
      expect(createdTeam.away_kit_secondary).toBe('#FFD700');
      expect(createdTeam.logo_url).toBe('https://example.com/logos/manchester-united.png');
      expect(createdTeam.created_at).toBeInstanceOf(Date);
      expect(createdTeam.updated_at).toBeNull();

      // 6. Transform back to frontend format
      const transformedTeam: Team = transformTeam(createdTeam);

      // 7. Verify round-trip transformation
      expect(transformedTeam).toEqual({
        id: createdTeam.id,
        name: 'Manchester United FC',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#000000',
        awayKitSecondary: '#FFD700',
        logoUrl: 'https://example.com/logos/manchester-united.png',
        createdAt: createdTeam.created_at,
        updatedAt: undefined
      });
    });

    it('should handle minimal team data correctly', async () => {
      // Test with only required fields
      const minimalTeamData: TeamCreateRequest = {
        name: 'Simple FC'
      };

      const prismaInput = transformTeamCreateRequest(minimalTeamData);
      
      expect(prismaInput).toEqual({
        name: 'Simple FC',
        home_kit_primary: null,
        home_kit_secondary: null,
        away_kit_primary: null,
        away_kit_secondary: null,
        logo_url: null
      });

      const createdTeam = await prisma.team.create({
        data: prismaInput
      });

      createdTeamIds.push(createdTeam.id);

      const transformedTeam = transformTeam(createdTeam);
      
      expect(transformedTeam.name).toBe('Simple FC');
      expect(transformedTeam.homeKitPrimary).toBeUndefined();
      expect(transformedTeam.homeKitSecondary).toBeUndefined();
      expect(transformedTeam.awayKitPrimary).toBeUndefined();
      expect(transformedTeam.awayKitSecondary).toBeUndefined();
      expect(transformedTeam.logoUrl).toBeUndefined();
    });

    it('should handle partial team data correctly', async () => {
      // Test with some optional fields
      const partialTeamData: TeamCreateRequest = {
        name: 'Arsenal FC',
        homeKitPrimary: '#FF0000',
        logoUrl: 'https://example.com/arsenal.png'
        // homeKitSecondary, awayKitPrimary, awayKitSecondary intentionally omitted
      };

      const prismaInput = transformTeamCreateRequest(partialTeamData);
      const createdTeam = await prisma.team.create({ data: prismaInput });
      createdTeamIds.push(createdTeam.id);

      const transformedTeam = transformTeam(createdTeam);
      
      expect(transformedTeam.name).toBe('Arsenal FC');
      expect(transformedTeam.homeKitPrimary).toBe('#FF0000');
      expect(transformedTeam.homeKitSecondary).toBeUndefined();
      expect(transformedTeam.awayKitPrimary).toBeUndefined();
      expect(transformedTeam.awayKitSecondary).toBeUndefined();
      expect(transformedTeam.logoUrl).toBe('https://example.com/arsenal.png');
    });
  });

  describe('Team Updates', () => {
    it('should update team using frontend interface', async () => {
      // Create initial team
      const initialData = transformTeamCreateRequest({
        name: 'Update Test FC',
        homeKitPrimary: '#0000FF'
      });

      const createdTeam = await prisma.team.create({
        data: initialData
      });
      createdTeamIds.push(createdTeam.id);

      // Update using frontend interface
      const updateData: TeamUpdateRequest = {
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#FF0000',
        logoUrl: 'https://example.com/updated-logo.png'
      };

      const prismaUpdateInput = transformTeamUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        home_kit_secondary: '#FFFFFF',
        away_kit_primary: '#FF0000',
        logo_url: 'https://example.com/updated-logo.png'
      });

      // Apply update
      const updatedTeam = await prisma.team.update({
        where: { id: createdTeam.id },
        data: prismaUpdateInput
      });

      // Transform back and verify
      const transformedUpdated = transformTeam(updatedTeam);

      expect(transformedUpdated.name).toBe('Update Test FC'); // Unchanged
      expect(transformedUpdated.homeKitPrimary).toBe('#0000FF'); // Unchanged
      expect(transformedUpdated.homeKitSecondary).toBe('#FFFFFF'); // Updated
      expect(transformedUpdated.awayKitPrimary).toBe('#FF0000'); // Updated
      expect(transformedUpdated.logoUrl).toBe('https://example.com/updated-logo.png'); // Updated
      expect(transformedUpdated.updatedAt).toBeInstanceOf(Date); // Should be set
    });

    it('should handle partial updates correctly', async () => {
      // Create initial team with full data
      const initialData = transformTeamCreateRequest({
        name: 'Partial Update FC',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#000000',
        awayKitSecondary: '#FFD700',
        logoUrl: 'https://example.com/original.png'
      });

      const createdTeam = await prisma.team.create({ data: initialData });
      createdTeamIds.push(createdTeam.id);

      // Update only name and logo
      const updateData: TeamUpdateRequest = {
        name: 'Updated Partial FC',
        logoUrl: 'https://example.com/new-logo.png'
      };

      const prismaUpdateInput = transformTeamUpdateRequest(updateData);
      const updatedTeam = await prisma.team.update({
        where: { id: createdTeam.id },
        data: prismaUpdateInput
      });

      const transformedUpdated = transformTeam(updatedTeam);

      // Verify only specified fields were updated
      expect(transformedUpdated.name).toBe('Updated Partial FC'); // Updated
      expect(transformedUpdated.logoUrl).toBe('https://example.com/new-logo.png'); // Updated
      expect(transformedUpdated.homeKitPrimary).toBe('#FF0000'); // Unchanged
      expect(transformedUpdated.homeKitSecondary).toBe('#FFFFFF'); // Unchanged
      expect(transformedUpdated.awayKitPrimary).toBe('#000000'); // Unchanged
      expect(transformedUpdated.awayKitSecondary).toBe('#FFD700'); // Unchanged
    });
  });

  describe('Team Retrieval', () => {
    it('should retrieve and transform team correctly', async () => {
      // Create test team
      const testData = transformTeamCreateRequest({
        name: 'Retrieval Test FC',
        homeKitPrimary: '#00FF00',
        awayKitPrimary: '#FF00FF'
      });

      const createdTeam = await prisma.team.create({
        data: testData
      });
      createdTeamIds.push(createdTeam.id);

      // Retrieve team
      const retrievedTeam = await prisma.team.findUnique({
        where: { id: createdTeam.id }
      });

      expect(retrievedTeam).not.toBeNull();

      // Transform and verify
      const transformedTeam = transformTeam(retrievedTeam!);

      expect(transformedTeam.id).toBe(createdTeam.id);
      expect(transformedTeam.name).toBe('Retrieval Test FC');
      expect(transformedTeam.homeKitPrimary).toBe('#00FF00');
      expect(transformedTeam.awayKitPrimary).toBe('#FF00FF');
    });

    it('should handle team not found scenario', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      
      const retrievedTeam = await prisma.team.findUnique({
        where: { id: nonExistentId }
      });

      expect(retrievedTeam).toBeNull();
    });
  });

  describe('Data Validation', () => {
    it('should handle color code validation', async () => {
      // Test with valid hex color codes
      const teamData: TeamCreateRequest = {
        name: 'Color Test FC',
        homeKitPrimary: '#FF5733',
        homeKitSecondary: '#33FF57',
        awayKitPrimary: '#3357FF',
        awayKitSecondary: '#F333FF'
      };

      const prismaInput = transformTeamCreateRequest(teamData);
      const createdTeam = await prisma.team.create({ data: prismaInput });
      createdTeamIds.push(createdTeam.id);

      const transformedTeam = transformTeam(createdTeam);

      // Verify color codes are preserved correctly
      expect(transformedTeam.homeKitPrimary).toBe('#FF5733');
      expect(transformedTeam.homeKitSecondary).toBe('#33FF57');
      expect(transformedTeam.awayKitPrimary).toBe('#3357FF');
      expect(transformedTeam.awayKitSecondary).toBe('#F333FF');
    });

    it('should handle null values correctly', async () => {
      const teamData: TeamCreateRequest = {
        name: 'Null Test FC',
        homeKitPrimary: null,
        homeKitSecondary: null,
        awayKitPrimary: null,
        awayKitSecondary: null,
        logoUrl: null
      };

      const prismaInput = transformTeamCreateRequest(teamData);
      const createdTeam = await prisma.team.create({ data: prismaInput });
      createdTeamIds.push(createdTeam.id);

      const transformedTeam = transformTeam(createdTeam);

      expect(transformedTeam.homeKitPrimary).toBeUndefined();
      expect(transformedTeam.homeKitSecondary).toBeUndefined();
      expect(transformedTeam.awayKitPrimary).toBeUndefined();
      expect(transformedTeam.awayKitSecondary).toBeUndefined();
      expect(transformedTeam.logoUrl).toBeUndefined();
    });

    it('should enforce unique team name constraint', async () => {
      // Create first team
      const teamData1 = transformTeamCreateRequest({
        name: 'Unique Name FC'
      });

      const createdTeam1 = await prisma.team.create({ data: teamData1 });
      createdTeamIds.push(createdTeam1.id);

      // Try to create second team with same name
      const teamData2 = transformTeamCreateRequest({
        name: 'Unique Name FC'
      });

      // Should throw unique constraint violation
      await expect(
        prisma.team.create({ data: teamData2 })
      ).rejects.toThrow();
    });
  });

  describe('Field Mapping Validation', () => {
    it('should correctly map all camelCase to snake_case fields', async () => {
      const frontendData: TeamCreateRequest = {
        name: 'Field Mapping FC',
        homeKitPrimary: '#111111',
        homeKitSecondary: '#222222',
        awayKitPrimary: '#333333',
        awayKitSecondary: '#444444',
        logoUrl: 'https://example.com/mapping.png'
      };

      const prismaInput = transformTeamCreateRequest(frontendData);

      // Verify exact field mapping
      expect(prismaInput.name).toBe(frontendData.name);
      expect(prismaInput.home_kit_primary).toBe(frontendData.homeKitPrimary);
      expect(prismaInput.home_kit_secondary).toBe(frontendData.homeKitSecondary);
      expect(prismaInput.away_kit_primary).toBe(frontendData.awayKitPrimary);
      expect(prismaInput.away_kit_secondary).toBe(frontendData.awayKitSecondary);
      expect(prismaInput.logo_url).toBe(frontendData.logoUrl);
    });

    it('should correctly map all snake_case to camelCase fields', async () => {
      // Create team in database
      const prismaInput = {
        name: 'Reverse Mapping FC',
        home_kit_primary: '#AAAAAA',
        home_kit_secondary: '#BBBBBB',
        away_kit_primary: '#CCCCCC',
        away_kit_secondary: '#DDDDDD',
        logo_url: 'https://example.com/reverse.png'
      };

      const createdTeam = await prisma.team.create({ data: prismaInput });
      createdTeamIds.push(createdTeam.id);

      const transformedTeam = transformTeam(createdTeam);

      // Verify exact reverse field mapping
      expect(transformedTeam.name).toBe(createdTeam.name);
      expect(transformedTeam.homeKitPrimary).toBe(createdTeam.home_kit_primary);
      expect(transformedTeam.homeKitSecondary).toBe(createdTeam.home_kit_secondary);
      expect(transformedTeam.awayKitPrimary).toBe(createdTeam.away_kit_primary);
      expect(transformedTeam.awayKitSecondary).toBe(createdTeam.away_kit_secondary);
      expect(transformedTeam.logoUrl).toBe(createdTeam.logo_url);
    });
  });
});