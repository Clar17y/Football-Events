# Task 5.2: Player Management & Profiles ❌

**Status:** Not Started  
**Priority:** High  
**Estimated Time:** 5-6 hours  
**Actual Time:** -  
**Completion Date:** -

## Description
Implement comprehensive player management with detailed profiles, statistics tracking, and roster management capabilities for teams.

## Current Issues
- Players are hardcoded with minimal information
- No player profiles or detailed information
- No player statistics tracking
- No player photo/avatar support
- No player position management
- No player availability tracking
- No player performance history

## Implementation Steps

### 1. Create Player Management Pages
- **File:** `src/pages/PlayerManagement.tsx`
- **Purpose:** Main player management interface
- **Features:**
  - Player roster view with filtering
  - Add/edit/remove players
  - Player search and sorting
  - Bulk operations (import/export)

### 2. Create Player Profile Component
- **File:** `src/components/PlayerProfile.tsx`
- **Purpose:** Detailed player information display
- **Features:**
  - Personal information and photo
  - Position and role details
  - Performance statistics
  - Match history and availability

### 3. Create Player Form Component
- **File:** `src/components/PlayerForm.tsx`
- **Purpose:** Form for creating/editing players
- **Features:**
  - Personal details (name, DOB, contact)
  - Position and jersey number
  - Photo upload capability
  - Emergency contact information
  - Medical/dietary notes

### 4. Create Player Card Component
- **File:** `src/components/PlayerCard.tsx`
- **Purpose:** Compact player display for lists
- **Features:**
  - Player photo and basic info
  - Position and jersey number
  - Quick stats and availability
  - Action buttons (edit, view, select)

### 5. Implement Player Statistics System
- **File:** `src/services/playerStatsService.ts`
- **Purpose:** Calculate and manage player statistics
- **Features:**
  - Real-time stats calculation
  - Historical performance tracking
  - Comparative analytics
  - Export capabilities

### 6. Create Player Availability System
- **File:** `src/components/PlayerAvailability.tsx`
- **Purpose:** Track player availability for matches
- **Features:**
  - Availability calendar
  - Injury/suspension tracking
  - Notification system
  - Automatic lineup suggestions

## Database Schema Enhancements

### Enhanced Players Table
```sql
players {
  id: string (primary key)
  team_id: string (foreign key)
  full_name: string (required, max 100 chars)
  first_name: string (required, max 50 chars)
  last_name: string (required, max 50 chars)
  jersey_number: number (1-99, unique per team)
  position_primary: string (enum: GK, DEF, MID, FWD)
  position_secondary: string (optional)
  date_of_birth: timestamp (optional)
  email: string (optional)
  phone: string (optional)
  photo_url: string (optional)
  height: number (cm, optional)
  weight: number (kg, optional)
  preferred_foot: string (enum: left, right, both)
  emergency_contact_name: string (optional)
  emergency_contact_phone: string (optional)
  medical_notes: string (optional, max 1000 chars)
  dietary_requirements: string (optional, max 500 chars)
  is_active: boolean (default true)
  is_captain: boolean (default false)
  is_vice_captain: boolean (default false)
  joined_date: timestamp
  contract_end_date: timestamp (optional)
  settings: string (JSON blob)
  created_at: timestamp
  updated_at: timestamp
}

-- Player statistics table
player_statistics {
  id: number (auto-increment)
  player_id: string (foreign key)
  season_id: string (optional)
  matches_played: number
  matches_started: number
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  saves: number (for goalkeepers)
  clean_sheets: number (for goalkeepers)
  pass_accuracy: number (percentage)
  shots_on_target: number
  tackles_won: number
  last_calculated: timestamp
}

-- Player availability table
player_availability {
  id: number (auto-increment)
  player_id: string (foreign key)
  date: timestamp
  status: string (enum: available, unavailable, injured, suspended, unknown)
  reason: string (optional, max 200 chars)
  notes: string (optional, max 500 chars)
  created_at: timestamp
  updated_at: timestamp
}
```

## Files to Create
- `src/pages/PlayerManagement.tsx`
- `src/components/PlayerProfile.tsx`
- `src/components/PlayerForm.tsx`
- `src/components/PlayerCard.tsx`
- `src/components/PlayerAvailability.tsx`
- `src/components/PlayerStats.tsx`
- `src/services/playerService.ts`
- `src/services/playerStatsService.ts`
- `src/hooks/usePlayers.ts`
- `src/hooks/usePlayerStats.ts`
- `src/types/player.ts` (enhanced)

## Files to Modify
- `src/db/indexedDB.ts` (add player CRUD operations)
- `src/types/index.ts` (update player interfaces)
- `src/components/EventModal.tsx` (use enhanced player data)
- `src/pages/MatchConsole.tsx` (display player details)

## User Stories

### As a Coach/Manager, I want to:
1. **Add new players** to my team roster with complete profiles
2. **Edit player information** to keep records current
3. **Track player statistics** across matches and seasons
4. **Manage player availability** for match planning
5. **Assign jersey numbers** and positions to players
6. **View player performance trends** over time
7. **Export player data** for league registration
8. **Set captain and vice-captain** roles
9. **Track player injuries** and recovery status
10. **Manage emergency contacts** for safety

### As a Player, I want to:
1. **View my own statistics** and performance history
2. **Update my availability** for upcoming matches
3. **See my position** and role in the team
4. **Access my profile information** easily

## Acceptance Criteria
- [ ] Players can be added with comprehensive profile information
- [ ] Player profiles include photo upload capability
- [ ] Jersey numbers are unique within each team
- [ ] Player positions are properly categorized and validated
- [ ] Player statistics are automatically calculated from match events
- [ ] Availability system allows easy status updates
- [ ] Player search and filtering works across all fields
- [ ] Emergency contact information is securely stored
- [ ] Medical and dietary notes are properly managed
- [ ] Player data can be exported in multiple formats
- [ ] All forms include real-time validation
- [ ] Responsive design works on all devices
- [ ] Proper error handling for all operations
- [ ] Loading states during data operations

## UI/UX Considerations

### Player Management Page Layout
```
┌─────────────────────────────────────────────────────┐
│ Team: [Old Wilsonians ▼] Players (23)              │
│ [+ Add Player] [Import] [Export] [Search...] [⚙️]   │
├─────────────────────────────────────────────────────┤
│ Filters: [All Positions ▼] [Available ▼] [Sort ▼]  │
├─────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │ [Photo] │ │ [Photo] │ │ [Photo] │ │ [Photo] │    │
│ │ John    │ │ Mike    │ │ Sarah   │ │ Alex    │    │
│ │ Smith   │ │ Jones   │ │ Wilson  │ │ Brown   │    │
│ │ #10 MID │ │ #7 FWD  │ │ #1 GK   │ │ #5 DEF  │    │
│ │ ⚽ 5 📊  │ │ ⚽ 8 📊  │ │ 🥅 3 📊  │ │ ⚽ 2 📊  │    │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
└─────────────────────────────────────────────────────┘
```

### Player Profile Modal
```
┌─────────────────────────────────────────────────────┐
│ Player Profile: John Smith                       [×]│
├─────────────────────────────────────────────────────┤
│ ┌─────────┐ Name: John Smith                        │
│ │ [Photo] │ Position: Midfielder (#10)              │
│ │         │ Age: 25 | Height: 180cm | Weight: 75kg  │
│ │ Upload  │ Joined: Jan 2023 | Captain: Yes         │
│ └─────────┘                                         │
│                                                     │
│ 📊 Season Stats:                                    │
│ Matches: 15 | Goals: 5 | Assists: 8 | Cards: 2     │
│                                                     │
│ 📅 Availability: Available                          │
│ 📞 Emergency: Jane Smith (555-0123)                 │
│                                                     │
│ [Edit] [View Stats] [Availability] [Delete]         │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation Notes

### Photo Management
- Support multiple image formats (JPEG, PNG, WebP)
- Automatic image resizing and optimization
- Fallback to default avatar if no photo
- Local storage with optional cloud sync

### Statistics Calculation
- Real-time updates from match events
- Historical data preservation
- Efficient aggregation queries
- Caching for performance

### Data Validation
- Jersey number uniqueness per team
- Age validation for youth leagues
- Contact information format validation
- Position assignment rules

### Performance Considerations
- Lazy loading of player photos
- Pagination for large rosters
- Efficient search indexing
- Optimized database queries

## Dependencies
- **Requires:** Task 5.1 (Team Management) - Teams needed for player assignment
- **Requires:** Task 1.1 (Type Safety) - ✅ Completed
- **Requires:** Task 1.2 (Error Handling) - ✅ Completed
- **Enhances:** Task 1.3 (Database Schema) - Database changes needed
- **Blocks:** Task 6.1 (Match Creation) - Player data needed for lineups
- **Blocks:** Task 7.1 (Player Analytics) - Player data needed for analysis

## Future Enhancements
- Player comparison tools
- Performance prediction models
- Social media integration
- Player development tracking
- Skill assessment tools
- Training attendance tracking
- Player marketplace/transfer system

## Testing Strategy
- Unit tests for player service functions
- Integration tests for statistics calculation
- UI tests for form validation and photo upload
- Performance tests with large player datasets
- Accessibility tests for all components
- Data migration tests for existing players

---
**Status:** ❌ **NOT STARTED**