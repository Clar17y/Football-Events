# Players Page Implementation Plan

## Overview

Implementation of a comprehensive players management page following established design patterns from Teams and Seasons pages, with focus on individual player management rather than team-centric views.

## Design Philosophy

### Player-Centric Approach
- **Primary Focus**: Individual player management and progress tracking
- **Secondary**: Team relationships and assignments
- **Rationale**: Aligns with app goal of "tracking individual player progress"

### Consistency with Existing Pages
- **Visual Design**: Follow Teams/Seasons page patterns
- **Color Theme**: Indigo (`--ion-color-indigo`) for players
- **Layout Structure**: Card-based grid with search/filter header
- **Interaction Patterns**: Ellipses menu for advanced actions

## User Experience Design

### Page Layout Structure
```
┌─────────────────────────────────────────┐
│ Page Header (Indigo theme)              │
├─────────────────────────────────────────┤
│ Search Bar + Filters                    │
├─────────────────────────────────────────┤
│ UNASSIGNED PLAYERS (if any)             │
│ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │Card │ │Card │ │Card │                │
│ └─────┘ └─────┘ └─────┘                │
├─────────────────────────────────────────┤
│ ASSIGNED PLAYERS                        │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │Card │ │Card │ │Card │ │Card │        │
│ └─────┘ └─────┘ └─────┘ └─────┘        │
└─────────────────────────────────────────┘
```

### Player Card Information
**Primary Information (Always Visible)**:
- Player name
- Preferred position (if set)
- Kit number (if set)
- Age (calculated from date of birth)
- Team assignment status

**Team Assignment Display Logic**:
- 0 teams: "Unassigned" (in Unassigned section)
- 1 team: "Manchester United FC"
- 2 teams: "Man United FC, City Academy"
- 3+ teams: "3 active teams"

### Age Calculation & UK Grassroots Integration
**Current Implementation**: Basic age calculation
**Future Enhancement**: UK grassroots age groups
- Cutoff date: September 1st annually
- Examples:
  - Born 30th August 2016 → U10 in 2025/26 season
  - Born 1st September 2015 → U10 in 2025/26 season
  - Born 1st September 2016 → U9 in 2025/26 season

## Technical Implementation

### Component Structure
```
PlayersPage.tsx
├── PlayerCard component (inline or separate)
├── CreatePlayerModal.tsx
├── PlayerContextMenu.tsx
└── PlayerTeamAssignmentModal.tsx (future)
```

### Database Fields Used
- `name` (required)
- `date_of_birth` (required for age calculation)
- `squad_number` (optional, preferred kit number)
- `position_code` (optional, enum for preferred position)
- `notes` (optional)

### API Integration
- **playersApi.getPlayers()** - with search/filter support
- **playersApi.createPlayer()** - with optional team assignment
- **playersApi.updatePlayer()** - standard CRUD
- **playersApi.deletePlayer()** - with cascade soft-delete
- **matchesApi.getMatchesByPlayer()** - for stats (future)

### Theme Integration
```css
/* Add to theme-tokens.css */
.page[data-theme='player'],
.modal[data-theme='player'] {
  --theme-primary: var(--ion-color-indigo);
  --theme-primary-shade: var(--ion-color-indigo-shade);
  --theme-primary-tint: var(--ion-color-indigo-tint);
  --theme-primary-rgb: var(--ion-color-indigo-rgb);
}
```

## Feature Specifications

### Search & Filtering
- **Search**: Player name (fuzzy search)
- **Position Filter**: Dropdown with position options
- **Team Filter**: Dropdown with user's teams
- **Assignment Filter**: "All", "Assigned", "Unassigned"
- **Age Range Filter**: Slider or dropdown (future enhancement)

### Create Player Modal
**Required Fields**:
- Player name
- Date of birth

**Optional Fields**:
- Preferred position
- Kit number
- Notes
- Team assignment (dropdown of user's teams)

**Validation**:
- Name: 2-100 characters
- Date of birth: Valid date, not in future
- Kit number: 1-99 if provided
- Position: Valid enum value if provided

### Player Context Menu (Ellipses)
1. **Edit Player** - Opens CreatePlayerModal in edit mode
2. **Team Assignment** - Opens PlayerTeamAssignmentModal
3. **Player Awards** - Links to awards page (future)
4. **Player Statistics** - Links to statistics page (future)
5. **Delete Player** - Confirmation dialog with cascade delete

### Integration Points

#### Teams Page Integration
**Current**: Teams page has "View Players" action
**Implementation**: Navigate to players page with team filter applied
```typescript
// From teams page
navigate('/players', { state: { teamFilter: teamId } });
```

#### Navigation Integration
- **Icon**: `person` (consistent with homepage)
- **Route**: `/players`
- **Theme**: `data-theme="player"`

## Backend Requirements

### Cascade Delete API
When deleting a player, soft-delete related records:
```typescript
// New API endpoint needed
DELETE /api/v1/players/:id/cascade
```

**Affected Tables**:
- `player_teams` - Remove team assignments
- `lineups` - Remove from match lineups
- `events` - Soft delete player events
- `awards` - Soft delete player awards
- `stats` - Soft delete player statistics

### Enhanced Player Queries
```sql
-- Players with team count
SELECT p.*, COUNT(pt.team_id) as active_team_count
FROM players p
LEFT JOIN player_teams pt ON p.id = pt.player_id 
  AND pt.is_deleted = false
WHERE p.is_deleted = false
GROUP BY p.id;

-- Players with team names (for display)
SELECT p.*, STRING_AGG(t.name, ', ') as team_names
FROM players p
LEFT JOIN player_teams pt ON p.id = pt.player_id 
LEFT JOIN teams t ON pt.team_id = t.id
WHERE p.is_deleted = false 
  AND (pt.is_deleted = false OR pt.is_deleted IS NULL)
  AND (t.is_deleted = false OR t.is_deleted IS NULL)
GROUP BY p.id;
```

## Implementation Phases

### Phase 1: Core Players Page
- [ ] Create PlayersPage.tsx with basic layout
- [ ] Implement player cards with core information
- [ ] Add search functionality
- [ ] Implement Unassigned/Assigned sections
- [ ] Add indigo theme support

### Phase 2: Player Management
- [ ] Create CreatePlayerModal.tsx
- [ ] Implement player CRUD operations
- [ ] Add basic validation
- [ ] Integrate with existing playersApi

### Phase 3: Advanced Features
- [ ] Add PlayerContextMenu.tsx
- [ ] Implement filtering options
- [ ] Add team assignment in create modal
- [ ] Teams page integration (filter link)

### Phase 4: Future Enhancements
- [ ] UK grassroots age group calculation
- [ ] Player statistics integration
- [ ] Player awards integration
- [ ] PlayerTeamAssignmentModal
- [ ] Advanced filtering (age range, etc.)
- [ ] Player photo/avatar support

## Testing Strategy

### Unit Tests
- Age calculation utility
- Player data transformation
- Search/filter logic

### Integration Tests
- Player CRUD operations
- Team assignment workflows
- Search and filtering
- Navigation integration

### Manual Testing
- Responsive design on mobile
- Theme consistency
- User workflow validation
- Performance with large player lists

## Success Criteria

1. **Functional**: All CRUD operations work correctly
2. **Visual**: Consistent with Teams/Seasons design
3. **Performance**: Fast loading and smooth interactions
4. **Usability**: Intuitive player management workflow
5. **Integration**: Seamless connection with teams page
6. **Scalability**: Handles large numbers of players efficiently

## Risk Mitigation

### Potential Issues
1. **Performance**: Large player lists
   - Solution: Implement pagination and virtual scrolling
2. **Complex Team Relationships**: Multi-team assignments
   - Solution: Clear UI patterns for team display
3. **Data Consistency**: Player-team relationship integrity
   - Solution: Proper cascade delete implementation

### Fallback Plans
- If UK age groups are complex: Implement basic age display first
- If team assignment is complex: Start with simple team display
- If performance issues: Add pagination and search optimization