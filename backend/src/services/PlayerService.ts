import { PrismaClient } from '@prisma/client';
import { 
  transformPlayer, 
  transformPlayerCreateRequest, 
  transformPlayerUpdateRequest,
  transformPlayers 
} from '@shared/types';
import type { 
  Player, 
  PlayerCreateRequest, 
  PlayerUpdateRequest 
} from '@shared/types';

export interface GetPlayersOptions {
  page: number;
  limit: number;
  search?: string;
  teamId?: string;
  position?: string;
}

export interface PaginatedPlayers {
  data: Player[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PlayerService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getPlayers(options: GetPlayersOptions): Promise<PaginatedPlayers> {
    const { page, limit, search, teamId, position } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive' as const
      };
    }
    
    if (teamId) {
      where.current_team = teamId;
    }
    
    if (position) {
      where.preferred_position = position;
    }

    // Get players and total count
    const [players, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { squad_number: 'asc' },
          { name: 'asc' }
        ]
      }),
      this.prisma.player.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformPlayers(players),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  async getPlayerById(id: string): Promise<Player | null> {
    const player = await this.prisma.player.findUnique({
      where: { id }
    });

    return player ? transformPlayer(player) : null;
  }

  async createPlayer(data: PlayerCreateRequest): Promise<Player> {
    const prismaInput = transformPlayerCreateRequest(data);
    const player = await this.prisma.player.create({
      data: prismaInput
    });

    return transformPlayer(player);
  }

  async updatePlayer(id: string, data: PlayerUpdateRequest): Promise<Player | null> {
    try {
      const prismaInput = transformPlayerUpdateRequest(data);
      const player = await this.prisma.player.update({
        where: { id },
        data: prismaInput
      });

      return transformPlayer(player);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Player not found
      }
      throw error;
    }
  }

  async deletePlayer(id: string): Promise<boolean> {
    try {
      await this.prisma.player.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Player not found
      }
      throw error;
    }
  }

  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    const players = await this.prisma.player.findMany({
      where: { current_team: teamId },
      orderBy: [
        { squad_number: 'asc' },
        { name: 'asc' }
      ]
    });

    return transformPlayers(players);
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}