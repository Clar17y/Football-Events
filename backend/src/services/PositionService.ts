import { PrismaClient } from '@prisma/client';
import { 
  transformPosition, 
  transformPositionCreateRequest, 
  transformPositionUpdateRequest,
  transformPositions 
} from '@shared/types';
import type { 
  Position, 
  PositionCreateRequest, 
  PositionUpdateRequest 
} from '@shared/types';

export interface GetPositionsOptions {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedPositions {
  data: Position[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PositionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getPositions(options: GetPositionsOptions): Promise<PaginatedPositions> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where = search ? {
      OR: [
        {
          pos_code: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          long_name: {
            contains: search,
            mode: 'insensitive' as const
          }
        }
      ]
    } : {};

    // Get positions and total count
    const [positions, total] = await Promise.all([
      this.prisma.positions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { pos_code: 'asc' }
      }),
      this.prisma.positions.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformPositions(positions),
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

  async getPositionById(id: string): Promise<Position | null> {
    const position = await this.prisma.positions.findUnique({
      where: { pos_code: id }
    });

    return position ? transformPosition(position) : null;
  }

  async getPositionByCode(code: string): Promise<Position | null> {
    const position = await this.prisma.positions.findUnique({
      where: { pos_code: code.toUpperCase() }
    });

    return position ? transformPosition(position) : null;
  }

  async createPosition(data: PositionCreateRequest): Promise<Position> {
    const prismaInput = transformPositionCreateRequest(data);
    const position = await this.prisma.positions.create({
      data: prismaInput
    });

    return transformPosition(position);
  }

  async updatePosition(id: string, data: PositionUpdateRequest): Promise<Position | null> {
    try {
      const prismaInput = transformPositionUpdateRequest(data);
      const position = await this.prisma.positions.update({
        where: { pos_code: id },
        data: prismaInput
      });

      return transformPosition(position);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Position not found
      }
      throw error;
    }
  }

  async deletePosition(id: string): Promise<boolean> {
    try {
      await this.prisma.positions.delete({
        where: { pos_code: id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Position not found
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}