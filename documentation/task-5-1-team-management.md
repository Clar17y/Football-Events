# Task 5.1: Team Management System ❌

**Status:** Not Started  
**Priority:** High  
**Estimated Time:** 4-5 hours  
**Actual Time:** -  
**Completion Date:** -

## Description
Implement a comprehensive team management system that allows users to create, edit, and manage teams with full CRUD operations, team settings, and organizational features.

## Current Issues
- Teams are currently hardcoded in components
- No way to create new teams
- No team editing capabilities
- No team deletion or archiving
- No team-specific settings or configurations
- No team branding (colors, logos)

## Implementation Steps

### 1. Create Team Management Pages
- **File:** `src/pages/TeamManagement.tsx`
- **Purpose:** Main team management interface
- **Features:**
  - List all teams with search and filtering
  - Create new team button
  - Edit/delete actions for each team
  - Team statistics overview

### 2. Create Team Form Component
- **File:** `src/components/TeamForm.tsx`
- **Purpose:** Reusable form for creating/editing teams
- **Features:**
  - Team name and description
  - Team colors (primary/secondary)
  - Logo upload capability
  - Formation preferences
  - Contact information

### 3. Create Team Card Component
- **File:** `src/components/TeamCard.tsx`
- **Purpose:** Display team information in lists
- **Features:**
  - Team branding display
  - Quick stats (player count, recent matches)
  - Action buttons (edit, view, delete)
  - Responsive design

### 4. Implement Team Service Layer
- **File:** `src/services/teamService.ts`
- **Purpose:** Business logic for team operations
- **Features:**
  - CRUD operations with validation
  - Team statistics calculation
  - Team search and filtering
  - Data transformation utilities

### 5. Create Team Settings Component
- **File:** `src/components/TeamSettings.tsx`
- **Purpose:** Advanced team configuration
- **Features:**
  - Default formation settings
  - Match preferences
  - Notification settings
  - Data export options

### 6. Add Team Navigation
- **File:** `src/components/TeamNavigation.tsx`
- **Purpose:** Navigation between team-related features
- **Features:**
  - Team selector dropdown
  - Quick access to team features
  - Breadcrumb navigation

## Database Schema Enhancements

### New/Enhanced Tables
```sql
-- Enhanced teams table
teams {
  id: string (primary key)
  name: string (required, max 50 chars)
  short_name: string (optional, max 10 chars)
  description: string (optional, max 500 chars)
  color_primary: string (hex color)
  color_secondary: string (hex color)
  logo_url: string (optional)
  formation_default: string (e.g., "4-4-2")
  contact_email: string (optional)
  contact_phone: string (optional)
  home_venue: string (optional)
  founded_date: timestamp (optional)
  is_active: boolean (default true)
  settings: string (JSON blob)
  created_at: timestamp
  updated_at: timestamp
}

-- Team statistics table
team_statistics {
  id: number (auto-increment)
  team_id: string (foreign key)
  season_id: string (optional)
  matches_played: number
  matches_won: number
  matches_drawn: number
  matches_lost: number
  goals_for: number
  goals_against: number
  last_calculated: timestamp
}
```

## Files to Create
- `src/pages/TeamManagement.tsx`
- `src/components/TeamForm.tsx`
- `src/components/TeamCard.tsx`
- `src/components/TeamSettings.tsx`
- `src/components/TeamNavigation.tsx`
- `src/services/teamService.ts`
- `src/hooks/useTeams.ts`
- `src/types/team.ts` (enhanced)

## Files to Modify
- `src/App.tsx` (add team management routes)
- `src/db/indexedDB.ts` (add team CRUD operations)
- `src/types/index.ts` (update team interfaces)
- `src/pages/MatchConsole.tsx` (use dynamic teams)
- `src/components/EventModal.tsx` (use dynamic teams)

## User Stories

### As a Coach/Manager, I want to:
1. **Create a new team** so I can start managing my squad
2. **Edit team information** to keep details current
3. **Set team colors and branding** for visual identity
4. **Configure default formations** for quick match setup
5. **View team statistics** to track performance
6. **Archive old teams** without losing historical data
7. **Search and filter teams** when managing multiple squads

### As a User, I want to:
1. **Switch between teams** easily in the interface
2. **See team branding** reflected throughout the app
3. **Access team-specific settings** and preferences
4. **Export team data** for external use

## Acceptance Criteria
- [ ] Users can create new teams with all required information
- [ ] Teams can be edited with real-time validation
- [ ] Team colors are applied throughout the application
- [ ] Teams can be soft-deleted (archived) with confirmation
- [ ] Team list supports search and filtering
- [ ] Team statistics are calculated and displayed
- [ ] Form validation prevents duplicate team names
- [ ] Team settings are persisted and applied
- [ ] Responsive design works on all device sizes
- [ ] All operations include proper error handling
- [ ] Loading states are shown during operations
- [ ] Changes are synced to the database immediately

## UI/UX Considerations

### Team Management Page Layout
```
┌─────────────────────────────────────┐
│ Header: "Team Management"           │
│ [+ Create Team] [Search...] [Filter]│
├─────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │Team │ │Team │ │Team │ │Team │    │
│ │Card │ │Card │ │Card │ │Card │    │
│ │  1  │ │  2  │ │  3  │ │  4  │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
│                                     │
│ [Load More Teams...]                │
└─────────────────────────────────────┘
```

### Team Form Modal
```
┌─────────────────────────────────────┐
│ Create/Edit Team                 [×]│
├─────────────────────────────────────┤
│ Team Name: [________________]       │
│ Short Name: [_____]                 │
│ Description: [________________]     │
│              [________________]     │
│ Primary Color: [🎨] Secondary: [🎨] │
│ Default Formation: [4-4-2 ▼]       │
│ Home Venue: [________________]      │
│                                     │
│ [Cancel] [Save Team]                │
└─────────────────────────────────────┘
```

## Technical Implementation Notes

### State Management
- Use React Context for current team selection
- Implement optimistic updates for better UX
- Cache team data to reduce database queries

### Validation Rules
- Team names must be unique within the system
- Colors must be valid hex codes
- Formation strings must match valid patterns
- Required fields enforced at both UI and database level

### Performance Considerations
- Implement pagination for large team lists
- Use virtual scrolling for better performance
- Lazy load team statistics
- Optimize database queries with proper indexing

## Dependencies
- **Requires:** Task 1.1 (Type Safety) - ✅ Completed
- **Requires:** Task 1.2 (Error Handling) - ✅ Completed
- **Enhances:** Task 1.3 (Database Schema) - Database changes needed
- **Blocks:** Task 5.2 (Player Management) - Teams needed for player assignment
- **Blocks:** Task 6.1 (Match Creation) - Teams needed for match setup

## Future Enhancements
- Team logo upload and management
- Team social media integration
- Team performance analytics
- Multi-season team history
- Team comparison features
- Import teams from external sources

## Testing Strategy
- Unit tests for team service functions
- Integration tests for CRUD operations
- UI tests for form validation
- Performance tests with large datasets
- Accessibility tests for all components

---
**Status:** ❌ **NOT STARTED**