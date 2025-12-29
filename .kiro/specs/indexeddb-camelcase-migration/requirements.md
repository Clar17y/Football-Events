# Requirements Document

## Introduction

This feature migrates the IndexedDB schema from snake_case to camelCase field naming to align with API responses and frontend TypeScript types. This simplifies the transform layer by eliminating the need for case conversion between the database and application layers. Since there are no active users, a clean slate approach is used where bumping the database version auto-clears old data.

## Glossary

- **IndexedDB**: Browser-based NoSQL database used for offline data storage
- **Dexie**: TypeScript wrapper library for IndexedDB used in the frontend
- **Transform Layer**: Code that converts data between IndexedDB schema, frontend types, and server API formats
- **snake_case**: Naming convention using underscores (e.g., `match_id`, `created_at`)
- **camelCase**: Naming convention using capital letters (e.g., `matchId`, `createdAt`)
- **Schema**: The structure definition for database tables including field names and indexes
- **Clean Slate Approach**: Migration strategy that clears old database and starts fresh

## Requirements

### Requirement 1

**User Story:** As a developer, I want the IndexedDB schema to use camelCase field names, so that field names align with API responses and frontend types without transformation.

#### Acceptance Criteria

1. WHEN the database schema is defined THEN the System SHALL use camelCase for all field names in interface definitions
2. WHEN the database indexes are defined THEN the System SHALL use camelCase field names in all index specifications
3. WHEN the database version is incremented THEN the System SHALL trigger automatic clearing of old snake_case data

### Requirement 2

**User Story:** As a developer, I want the database layer methods to use camelCase field access, so that code is consistent with the new schema.

#### Acceptance Criteria

1. WHEN database methods access record fields THEN the System SHALL use camelCase property names
2. WHEN database queries filter by field THEN the System SHALL use camelCase field names in query conditions
3. WHEN database methods construct new records THEN the System SHALL use camelCase field names

### Requirement 3

**User Story:** As a developer, I want the transform layer to be simplified, so that server-to-database transforms become near pass-through operations.

#### Acceptance Criteria

1. WHEN transforming server responses to database records THEN the System SHALL perform minimal field renaming since both use camelCase
2. WHEN transforming database records to frontend types THEN the System SHALL handle only semantic differences (e.g., `durationMins` to `durationMinutes`)
3. WHEN transforming frontend writes to database records THEN the System SHALL use camelCase field names

### Requirement 4

**User Story:** As a developer, I want all service layer code to use camelCase field access, so that the codebase is consistent.

#### Acceptance Criteria

1. WHEN the cache service accesses database fields THEN the System SHALL use camelCase property names
2. WHEN the sync service processes records THEN the System SHALL use camelCase field names for soft delete and sync tracking fields
3. WHEN API services construct queries or filters THEN the System SHALL use camelCase field names

### Requirement 5

**User Story:** As a developer, I want components and hooks to use camelCase field access, so that the entire frontend codebase is consistent.

#### Acceptance Criteria

1. WHEN React components access database record fields THEN the System SHALL use camelCase property names
2. WHEN hooks process database records THEN the System SHALL use camelCase field names
3. WHEN utility functions access record fields THEN the System SHALL use camelCase property names

### Requirement 6

**User Story:** As a developer, I want the migration to be type-safe, so that TypeScript catches any missed field name updates.

#### Acceptance Criteria

1. WHEN the schema interfaces are updated THEN the System SHALL cause TypeScript compilation errors for any code using old snake_case field names
2. WHEN all code is updated THEN the System SHALL pass TypeScript compilation with zero errors
3. WHEN the application builds THEN the System SHALL produce a successful production build

### Requirement 7

**User Story:** As a user, I want the application to work correctly after the migration, so that all features continue to function.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL initialize the database without errors
2. WHEN performing CRUD operations on teams, players, seasons, and matches THEN the System SHALL persist and retrieve data correctly
3. WHEN creating events during a match THEN the System SHALL store and display events correctly
4. WHEN managing lineups THEN the System SHALL save and load lineup data correctly
5. WHEN operating offline THEN the System SHALL cache data locally and sync when reconnected
6. WHEN using guest mode THEN the System SHALL function without authentication
