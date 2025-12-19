# Requirements Document

## Introduction

This feature unifies the type system across the codebase by establishing `shared/types/frontend.ts` as the single source of truth for all entity types. Currently, there are duplicate type definitions in `frontend/src/db/schema.ts` and inconsistent field naming (mixed snake_case and camelCase) in the shared types. This creates confusion, type mismatches, and unnecessary transform complexity.

The goal is:
1. **Shared types are the source of truth** - All entity types (Player, Team, Match, etc.) are defined once in `shared/types/`
2. **camelCase everywhere** - All fields use camelCase in TypeScript code
3. **ISO strings everywhere** - All date/time fields use ISO strings (JSON-native); formatting happens in the UI layer
4. **snake_case only at boundaries** - Only when interacting with PostgreSQL (via Prisma) do we use snake_case

## Glossary

- **Shared Types**: Type definitions in `shared/types/` that are used by both frontend and backend
- **Frontend Schema**: Type definitions in `frontend/src/db/schema.ts` for IndexedDB (currently duplicates shared types)
- **Transform Layer**: Code that converts between different data representations (Prisma ↔ API, IndexedDB ↔ Frontend)
- **Source of Truth**: The single authoritative location where a type is defined
- **Boundary**: The point where data crosses between systems (e.g., TypeScript ↔ PostgreSQL)
- **ISO Date-Time String**: UTC timestamp string like `2025-12-17T12:34:56.789Z`
- **ISO Date String**: Date-only string like `2025-12-17`

## Requirements

### Requirement 1

**User Story:** As a developer, I want all shared type interfaces to use consistent camelCase field names, so that there is no confusion about field naming conventions.

#### Acceptance Criteria

1. WHEN defining entity interfaces in shared types THEN the System SHALL use camelCase for all field names including authentication fields (`createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted`)
2. WHEN defining entity interfaces in shared types THEN the System SHALL NOT use snake_case for any field names
3. WHEN defining date/time fields in shared types THEN the System SHALL use ISO strings (no `Date` fields in shared API/domain types)
4. WHEN the shared types are updated THEN the System SHALL cause TypeScript compilation errors for any code using old snake_case field names or legacy timestamp representations

### Requirement 2

**User Story:** As a developer, I want shared types to be the single source of truth for entity definitions, so that I don't have to maintain duplicate type definitions.

#### Acceptance Criteria

1. WHEN the frontend needs entity types THEN the System SHALL import them from `shared/types/` rather than defining local duplicates
2. WHEN the frontend schema defines IndexedDB-specific types THEN the System SHALL extend or compose shared types rather than redefine all fields
3. WHEN a new entity field is added THEN the System SHALL require updating only the shared types definition

### Requirement 3

**User Story:** As a developer, I want the frontend IndexedDB schema to reuse shared types, so that the transform layer is simplified.

#### Acceptance Criteria

1. WHEN defining IndexedDB table types THEN the System SHALL use shared types as the base with IndexedDB-specific extensions (e.g., `synced`, `syncedAt`)
2. WHEN caching or reading entities from IndexedDB THEN the System SHALL NOT rename fields (shared types and IndexedDB types use the same shape)
3. WHEN the schema types are aligned THEN the System SHALL eliminate duplicate interface definitions from `frontend/src/db/schema.ts`

### Requirement 4

**User Story:** As a developer, I want the backend transform layer to handle snake_case conversion only at the Prisma boundary, so that all other code uses camelCase.

#### Acceptance Criteria

1. WHEN transforming Prisma records to API responses THEN the System SHALL convert snake_case fields to camelCase
2. WHEN transforming API requests to Prisma inputs THEN the System SHALL convert camelCase fields to snake_case
3. WHEN the backend returns API responses THEN the System SHALL use camelCase field names matching the shared types
4. WHEN transforming across the Prisma boundary THEN the System SHALL serialize/parse date fields as ISO strings

### Requirement 5

**User Story:** As a developer, I want the frontend transform layer to be simplified, so that server-to-IndexedDB transforms are near pass-through operations.

#### Acceptance Criteria

1. WHEN caching server responses to IndexedDB THEN the System SHALL store data with minimal transformation since both use camelCase
2. WHEN reading from IndexedDB for UI display THEN the System SHALL return data with minimal transformation
3. WHEN the types are unified THEN the System SHALL reduce the number of transform functions needed, leaving UI-only formatting helpers for ISO strings

### Requirement 6

**User Story:** As a developer, I want the migration to be type-safe, so that TypeScript catches any inconsistencies.

#### Acceptance Criteria

1. WHEN shared types are updated THEN the System SHALL cause compilation errors for any code using old field names
2. WHEN all code is updated THEN the System SHALL pass TypeScript compilation with zero type errors
3. WHEN the application builds THEN the System SHALL produce a successful production build

### Requirement 7

**User Story:** As a user, I want the application to work correctly after the type unification, so that all features continue to function.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL initialize without errors
2. WHEN performing CRUD operations THEN the System SHALL persist and retrieve data correctly
3. WHEN syncing data between frontend and backend THEN the System SHALL maintain data integrity
4. WHEN operating offline THEN the System SHALL cache and retrieve data correctly

### Requirement 8

**User Story:** As a developer, I want this unification to cover every persistent table/store, so that no mixed casing or legacy type system remains.

#### Acceptance Criteria

1. WHEN enumerating backend Prisma models THEN the System SHALL have an explicit type/transform strategy for each model used by the app
2. WHEN enumerating frontend IndexedDB/Dexie stores THEN the System SHALL have an explicit Db* type for each store and consistent store/index definitions
3. WHEN auditing the repo THEN the System SHALL have zero snake_case field usage outside the Prisma boundary (excluding Prisma schema and Prisma query objects)

