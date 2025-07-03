# Task 6.1: Match Creation & Scheduling ❌

**Status:** Not Started  
**Priority:** High  
**Estimated Time:** 4-5 hours  
**Actual Time:** -  
**Completion Date:** -

## Description
Implement a comprehensive match creation and scheduling system that allows users to create matches, set up fixtures, manage schedules, and handle match logistics.

## Current Issues
- Matches are created on-the-fly without proper setup
- No match scheduling or calendar system
- No pre-match configuration options
- No opponent team management
- No venue or logistics management
- No recurring fixture support
- No match templates or presets

## Implementation Steps

### 1. Create Match Scheduling Page
- **File:** `src/pages/MatchScheduling.tsx`
- **Purpose:** Main interface for match management
- **Features:**
  - Calendar view of scheduled matches
  - Create new match wizard
  - Edit existing matches
  - Match status management
  - Bulk operations for fixtures

### 2. Create Match Creation Wizard
- **File:** `src/components/MatchWizard.tsx`
- **Purpose:** Step-by-step match creation process
- **Features:**
  - Basic match details (teams, date, time)
  - Venue and logistics setup
  - Match settings and rules
  - Official assignments
  - Confirmation and scheduling

### 3. Create Match Calendar Component
- **File:** `src/components/MatchCalendar.tsx`
- **Purpose:** Visual calendar for match scheduling
- **Features:**
  - Monthly/weekly/daily views
  - Drag-and-drop rescheduling
  - Color-coded match types
  - Quick match details preview
  - Export to external calendars

### 4. Create Opponent Management System
- **File:** `src/components/OpponentManagement.tsx`
- **Purpose:** Manage opposing teams and contacts
- **Features:**
  - Opponent team database
  - Contact information management
  - Historical match records
  - Communication tools

### 5. Create Venue Management
- **File:** `src/components/VenueManagement.tsx`
- **Purpose:** Manage match venues and facilities
- **Features:**
  - Venue database with details
  - Availability checking
  - Directions and logistics
  - Facility requirements

### 6. Implement Match Templates
- **File:** `src/services/matchTemplateService.ts`
- **Purpose:** Reusable match configurations
- **Features:**
  - Template creation and management
  - Quick match setup from templates
  - League-specific templates
  - Custom rule sets

## Database Schema Enhancements

### New/Enhanced Tables
```sql
-- Enhanced matches table
matches {
  id: string (primary key)
  season_id: string (foreign key)
  home_team_id: string (foreign key)
  away_team_id: string (foreign key)
  opponent_id: string (foreign key, optional for external teams)
  venue_id: string (foreign key)
  match_type: string (enum: league, cup, friendly, training)
  competition_id: string (optional)
  scheduled_date: timestamp
  scheduled_time: string (HH:MM format)
  duration_minutes: number (default 90)
  status: string (enum: scheduled, confirmed, in_progress, completed, cancelled, postponed)
  weather_conditions: string (optional)
  attendance: number (optional)
  referee_id: string (optional)
  assistant_referees: string (JSON array, optional)
  match_officials: string (JSON array, optional)
  home_score: number (optional)
  away_score: number (optional)
  notes: string (optional, max 1000 chars)
  settings: string (JSON blob for match-specific settings)
  created_by: string (user_id)
  created_at: timestamp
  updated_at: timestamp
}

-- Opponents table (for external teams)
opponents {
  id: string (primary key)
  name: string (required, max 100 chars)
  short_name: string (optional, max 20 chars)
  contact_name: string (optional)
  contact_email: string (optional)
  contact_phone: string (optional)
  home_venue: string (optional)
  league: string (optional)
  division: string (optional)
  website: string (optional)
  notes: string (optional, max 500 chars)
  is_active: boolean (default true)
  created_at: timestamp
  updated_at: timestamp
}

-- Venues table
venues {
  id: string (primary key)
  name: string (required, max 100 chars)
  address: string (optional, max 200 chars)
  city: string (optional, max 50 chars)
  postcode: string (optional, max 20 chars)
  latitude: number (optional)
  longitude: number (optional)
  surface_type: string (enum: grass, artificial, indoor)
  capacity: number (optional)
  facilities: string (JSON array: parking, changing_rooms, etc.)
  contact_name: string (optional)
  contact_phone: string (optional)
  booking_required: boolean (default false)
  cost_per_hour: number (optional)
  notes: string (optional, max 500 chars)
  is_active: boolean (default true)
  created_at: timestamp
  updated_at: timestamp
}

-- Match templates table
match_templates {
  id: string (primary key)
  name: string (required, max 50 chars)
  description: string (optional, max 200 chars)
  match_type: string
  duration_minutes: number
  default_venue_id: string (optional)
  settings: string (JSON blob)
  is_public: boolean (default false)
  created_by: string (user_id)
  created_at: timestamp
  updated_at: timestamp
}

-- Match notifications table
match_notifications {
  id: number (auto-increment)
  match_id: string (foreign key)
  recipient_type: string (enum: team, player, official, all)
  recipient_id: string (optional)
  notification_type: string (enum: created, updated, reminder, cancelled)
  message: string
  sent_at: timestamp (optional)
  status: string (enum: pending, sent, failed)
  created_at: timestamp
}
```

## Files to Create
- `src/pages/MatchScheduling.tsx`
- `src/components/MatchWizard.tsx`
- `src/components/MatchCalendar.tsx`
- `src/components/OpponentManagement.tsx`
- `src/components/VenueManagement.tsx`
- `src/components/MatchCard.tsx`
- `src/components/MatchDetails.tsx`
- `src/services/matchService.ts`
- `src/services/matchTemplateService.ts`
- `src/services/notificationService.ts`
- `src/hooks/useMatches.ts`
- `src/hooks/useCalendar.ts`
- `src/types/match.ts` (enhanced)
- `src/types/venue.ts`
- `src/types/opponent.ts`

## Files to Modify
- `src/App.tsx` (add match scheduling routes)
- `src/db/indexedDB.ts` (add new table operations)
- `src/pages/MatchConsole.tsx` (integrate with scheduled matches)
- `src/types/index.ts` (update match interfaces)

## User Stories

### As a Coach/Manager, I want to:
1. **Create new matches** with complete details and settings
2. **Schedule fixtures** for the entire season
3. **View matches in a calendar** to avoid conflicts
4. **Set up recurring fixtures** for league play
5. **Manage opponent information** and contacts
6. **Book venues** and track availability
7. **Send match notifications** to players and officials
8. **Reschedule matches** when necessary
9. **Use match templates** for quick setup
10. **Export schedules** to external calendars

### As a Player, I want to:
1. **View upcoming matches** in my calendar
2. **Receive match notifications** and reminders
3. **See match details** including venue and time
4. **Confirm my availability** for matches

### As an Administrator, I want to:
1. **Manage venues** and their availability
2. **Create match templates** for different competitions
3. **Oversee all scheduled matches** across teams
4. **Generate fixture lists** for leagues

## Acceptance Criteria
- [ ] Users can create matches with all necessary details
- [ ] Calendar view displays matches clearly with different views
- [ ] Match wizard guides users through setup process
- [ ] Opponent and venue databases are fully functional
- [ ] Match templates can be created and reused
- [ ] Notifications are sent for match events
- [ ] Matches can be rescheduled with conflict detection
- [ ] Recurring fixtures can be set up automatically
- [ ] External calendar integration works properly
- [ ] All forms include comprehensive validation
- [ ] Responsive design works on all devices
- [ ] Proper error handling for all operations
- [ ] Loading states during data operations

## UI/UX Considerations

### Match Scheduling Page Layout
```
┌─────────────────────────────────────────────────────┐
│ Match Scheduling                                    │
│ [+ New Match] [Templates] [Import] [Export] [⚙️]    │
├─────────────────────────────────────────────────────┤
│ [Calendar] [List] [Upcoming]    [Dec 2024] [< >]    │
├─────────────────────────────────────────────────────┤
│ Sun  Mon  Tue  Wed  Thu  Fri  Sat                   │
│  1    2    3    4    5    6    7                    │
│  8    9   10   11   12   13   14                    │
│ 15   16   17   18   19   20   21                    │
│      📅       📅              📅                    │
│   Match    Match           Match                    │
│ 22   23   24   25   26   27   28                    │
│ 29   30   31                                        │
└─────────────────────────────────────────────────────┘
```

### Match Creation Wizard
```
┌─────────────────────────────────────────────────────┐
│ Create New Match - Step 1 of 4                  [×]│
├─────────────────────────────────────────────────────┤
│ ● Basic Details  ○ Teams  ○ Venue  ○ Confirm       │
├─────────────────────────────────────────────────────┤
│ Match Type: [League ▼]                              │
│ Competition: [Premier Division ▼]                   │
│ Date: [📅 2024-12-25]  Time: [15:00]               │
│ Duration: [90] minutes                              │
│                                                     │
│ ☐ Use match template: [Select template ▼]          │
│                                                     │
│ [Cancel] [< Back] [Next >]                          │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation Notes

### Calendar Integration
- Support for iCal/ICS export
- Google Calendar integration
- Outlook calendar sync
- Mobile calendar app compatibility

### Conflict Detection
- Venue double-booking prevention
- Player availability checking
- Official assignment conflicts
- Travel time considerations

### Notification System
- Email notifications
- SMS alerts (future)
- In-app notifications
- Push notifications for mobile

### Performance Considerations
- Efficient calendar rendering
- Lazy loading of match details
- Optimized database queries
- Caching for frequently accessed data

## Dependencies
- **Requires:** Task 5.1 (Team Management) - Teams needed for match setup
- **Requires:** Task 1.1 (Type Safety) - ✅ Completed
- **Requires:** Task 1.2 (Error Handling) - ✅ Completed
- **Enhances:** Task 1.3 (Database Schema) - Database changes needed
- **Blocks:** Task 6.3 (Pre-Match Setup) - Scheduled matches needed
- **Blocks:** Task 7.1 (Analytics) - Match data needed for analysis

## Future Enhancements
- Weather integration for outdoor matches
- Travel time calculation and routing
- Automatic referee assignment
- Live score updates during matches
- Post-match report generation
- Social media integration for match promotion
- Ticket sales integration
- Live streaming setup

## Testing Strategy
- Unit tests for match service functions
- Integration tests for calendar operations
- UI tests for wizard workflow
- Performance tests with large datasets
- Accessibility tests for all components
- Cross-browser testing for calendar features

---
**Status:** ❌ **NOT STARTED**