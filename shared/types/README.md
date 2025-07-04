# Shared Types - Type Transformation Layer

This directory implements a type transformation layer between Prisma database types and frontend-friendly interfaces.

## Architecture

```
Database (PostgreSQL) 
    ↓ 
Prisma Schema 
    ↓ 
Prisma Generated Types (prisma.ts)
    ↓ 
Transformation Layer (transformers.ts)
    ↓ 
Frontend Types (frontend.ts)
    ↓ 
React Components
```

## Files

- **`prisma.ts`** - Re-exports Prisma-generated types with consistent naming
- **`frontend.ts`** - Frontend-friendly interfaces with camelCase naming
- **`transformers.ts`** - Transformation functions between Prisma and frontend types
- **`index.ts`** - Main export file for convenient imports

## Usage Examples

### In Backend API Routes

```typescript
import { PrismaPlayer, transformPlayer } from '@shared/types';

// Get from database
const prismaPlayer: PrismaPlayer = await prisma.player.findUnique({
  where: { id: playerId }
});

// Transform for API response
const frontendPlayer = transformPlayer(prismaPlayer);
res.json(frontendPlayer);
```

### In Frontend Components

```typescript
import { Player, PlayerCreateRequest } from '@shared/types';

const PlayerCard: React.FC<{ player: Player }> = ({ player }) => (
  <div>
    <h3>{player.name}</h3> {/* camelCase, user-friendly */}
    <p>Squad #{player.squadNumber}</p>
  </div>
);
```

### In API Calls

```typescript
import { 
  PlayerCreateRequest, 
  transformPlayerCreateRequest 
} from '@shared/types';

const createPlayer = async (request: PlayerCreateRequest) => {
  // Transform to Prisma format for API
  const prismaInput = transformPlayerCreateRequest(request);
  
  const response = await fetch('/api/players', {
    method: 'POST',
    body: JSON.stringify(prismaInput)
  });
  
  return response.json();
};
```

## Benefits

1. **Type Safety** - Guaranteed alignment between database and frontend
2. **Single Source of Truth** - Database schema drives all types
3. **Frontend Friendly** - Clean camelCase interfaces for React components
4. **Automatic Updates** - Types update when database schema changes
5. **Transformation Layer** - Clean separation between database and UI concerns

## Field Mapping Examples

| Database Field | Frontend Field | Notes |
|---------------|----------------|-------|
| `full_name` | `name` | More UI-friendly |
| `squad_number` | `squadNumber` | camelCase |
| `preferred_pos` | `preferredPosition` | Descriptive |
| `created_at` | `createdAt` | camelCase |
| `home_kit_primary` | `homeKitPrimary` | camelCase |

## Adding New Entities

1. Update Prisma schema
2. Run `npx prisma generate`
3. Add new types to `prisma.ts`
4. Create frontend interface in `frontend.ts`
5. Add transformers in `transformers.ts`
6. Export from `index.ts`