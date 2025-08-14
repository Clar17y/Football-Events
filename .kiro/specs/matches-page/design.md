# Design Document

## Overview

The Matches page is a comprehensive match management interface that combines calendar-based visualization with detailed list management. The design follows the established grassroots design system patterns while introducing new calendar functionality. The page consists of three main sections: a prominent calendar view, an upcoming matches list, and a completed matches section.

## Architecture

### Component Structure

```
MatchesPage
├── MatchesHeader (consistent with TeamsPage/PlayersPage pattern)
├── MatchesCalendar (new calendar component)
├── UpcomingMatchesList (collapsible match items)
├── CompletedMatchesList (result-focused display)
└── CreateMatchModal (extends existing modal pattern)
```

### Data Flow

The page follows the established API pattern using:
- `matchesApi.getMatches()` for paginated match lists
- `matchesApi.getUpcoming()` for upcoming matches
- `matchesApi.getRecent()` for completed matches
- Existing `matchesApi.quickStart()` for match creation

### State Management

```typescript
interface MatchesPageState {
  // Calendar state
  calendarDate: Date;
  selectedDate: Date | null;
  calendarMatches: Match[];
  
  // List state
  upcomingMatches: Match[];
  completedMatches: Match[];
  expandedMatches: Set<string>;
  
  // UI state
  loading: boolean;
  createModalOpen: boolean;
  selectedMatchId: string | null;
  
  // Filters
  teamFilter: string | null;
  searchTerm: string;
}
```

## Components and Interfaces

### MatchesCalendar Component

**Purpose:** Display a 14+ day calendar view with match indicators and click-to-create functionality.

**Technical Decision:** Custom implementation using dayjs and Ionic components. After evaluating react-calendar, react-big-calendar, react-datepicker, and MUI X Date Pickers, none provided adequate support for our specific 14+ day view requirement without major customization. A custom solution provides perfect integration with our design system and exact functionality needs.

**Key Features:**
- Shows current date + next 14 days minimum (spans months if needed)
- Visual match indicators using team colors (home/away)
- Click empty dates → open CreateMatchModal
- Click match indicators → scroll to match in lists
- Responsive grid layout using CSS Grid (7 columns)
- Built with dayjs for date calculations and Ionic components for styling

**Props Interface:**
```typescript
interface MatchesCalendarProps {
  matches: Match[];
  selectedDate: Date | null;
  onDateClick: (date: Date) => void;
  onMatchClick: (matchId: string) => void;
  loading?: boolean;
}
```

**Calendar Cell Structure:**
```typescript
interface CalendarCell {
  date: Date;
  isToday: boolean;
  matches: Match[];
  isEmpty: boolean;
  isCurrentMonth: boolean;
}
```

**Implementation Details:**
- Uses dayjs for date range calculations (current date + 14 days minimum)
- CSS Grid layout with responsive breakpoints
- Match indicators as small colored circles using team home/away colors
- Click event delegation to distinguish between date clicks and match clicks
- Accessibility features including keyboard navigation and screen reader support

### UpcomingMatchesList Component

**Purpose:** Display upcoming matches in chronological order with collapsible details.

**Key Features:**
- Full-width match items (not cards)
- Collapsible/expandable details
- Shows basic info collapsed, full details expanded
- Filtering and sorting options

**Props Interface:**
```typescript
interface UpcomingMatchesListProps {
  matches: Match[];
  expandedMatches: Set<string>;
  onToggleExpand: (matchId: string) => void;
  onMatchSelect: (matchId: string) => void;
  loading?: boolean;
}
```

### CompletedMatchesList Component

**Purpose:** Display completed matches with quick result indicators and expandable details.

**Key Features:**
- Win/loss color coding (green/red)
- Immediate score visibility
- Expandable for match details
- Stub link to match events (future feature)

**Props Interface:**
```typescript
interface CompletedMatchesListProps {
  matches: Match[];
  expandedMatches: Set<string>;
  onToggleExpand: (matchId: string) => void;
  onViewEvents: (matchId: string) => void; // stubbed
  loading?: boolean;
}
```

### CreateMatchModal Component

**Purpose:** Modal for creating new matches, extending the existing modal pattern from CreateTeamModal.

**Key Features:**
- Pre-populated date from calendar selection
- Team selection (home/away)
- Match details (time, duration, period format)
- Validation and error handling
- Consistent with existing modal design

**Props Interface:**
```typescript
interface CreateMatchModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  preselectedDate?: Date;
  onMatchCreated: (match: Match) => void;
}
```

## Data Models

### Calendar Match Indicator

```typescript
interface CalendarMatchIndicator {
  matchId: string;
  date: Date;
  homeTeam: Team;
  awayTeam: Team;
  isHome: boolean; // determines color scheme
  time: string;
  colors: {
    primary: string;
    secondary: string;
  };
}
```

### Match List Item

```typescript
interface MatchListItem extends Match {
  homeTeam: Team;
  awayTeam: Team;
  season: Season;
  isUpcoming: boolean;
  isCompleted: boolean;
  result?: {
    won: boolean;
    lost: boolean;
    drawn: boolean;
    ourScore: number;
    opponentScore: number;
  };
}
```

## Error Handling

### Calendar Error States
- **No matches found:** Show empty calendar with create prompts
- **API failure:** Show cached data with offline indicator
- **Date calculation errors:** Fallback to current date + 14 days

### List Error States
- **Loading failures:** Show skeleton loaders with retry option
- **Empty states:** Contextual empty state messages
- **Network errors:** Graceful degradation with cached data

### Modal Error States
- **Validation errors:** Inline field validation
- **Save failures:** Error toast with retry option
- **Network issues:** Prevent modal close, show error state

## Testing Strategy

### Unit Tests
- **MatchesCalendar:** Date calculations, match positioning, click handlers
- **Match Lists:** Sorting, filtering, expand/collapse logic
- **CreateMatchModal:** Form validation, data transformation
- **Utility functions:** Date helpers, color calculations

### Integration Tests
- **Calendar-to-list navigation:** Click match → scroll to item
- **Modal workflow:** Create match → refresh calendar → update lists
- **API integration:** Match CRUD operations, error handling
- **Responsive behavior:** Mobile/desktop layout adaptations

### E2E Tests
- **Complete match creation flow:** Calendar click → modal → save → verify
- **Navigation flow:** Calendar → list → details → back
- **Filter and search:** Apply filters → verify results
- **Error scenarios:** Network failures, validation errors

## Styling and Theme Integration

### CSS Structure
Following the established pattern from TeamsPage and PlayersPage:

```css
/* MatchesPage.css */
.matches-header { /* Consistent header styling */ }
.matches-content { /* Main content area */ }
.matches-calendar { /* Calendar-specific styles */ }
.matches-lists { /* List sections styling */ }
```

### Calendar Styling
```css
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--grassroots-space-xs);
}

.calendar-cell {
  aspect-ratio: 1;
  border-radius: var(--grassroots-radius-md);
  position: relative;
}

.match-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid var(--grassroots-surface);
}
```

### Match List Styling
```css
.match-list-item {
  border-radius: var(--grassroots-radius-lg);
  border: 1px solid var(--grassroots-surface-variant);
  margin-bottom: var(--grassroots-space-sm);
  transition: all 0.3s ease;
}

.match-result-indicator {
  width: 4px;
  height: 100%;
  border-radius: var(--grassroots-radius-xs);
}

.match-result-win { background: var(--grassroots-success); }
.match-result-loss { background: var(--grassroots-danger); }
.match-result-draw { background: var(--grassroots-warning); }
```

### Color System Integration
- **Team colors:** Use existing team color properties for match indicators
- **Result colors:** Leverage grassroots success/danger/warning colors
- **Theme support:** Full light/dark theme compatibility
- **Accessibility:** Ensure sufficient contrast ratios

## Responsive Design

### Mobile (< 768px)
- **Calendar:** 7-column grid with smaller cells
- **Match lists:** Single column, full-width items
- **Modal:** Full-screen overlay
- **Typography:** Smaller font sizes, adjusted spacing

### Tablet (768px - 1024px)
- **Calendar:** Larger cells with better touch targets
- **Match lists:** Maintain full-width with better spacing
- **Modal:** Centered with max-width constraint

### Desktop (> 1024px)
- **Calendar:** Optimal cell size with hover states
- **Match lists:** Full-width with enhanced typography
- **Modal:** Centered modal with form sections

## Performance Considerations

### Calendar Optimization
- **Date calculations:** Memoize date range calculations
- **Match positioning:** Efficient match-to-date mapping
- **Re-renders:** Optimize with React.memo and useMemo

### List Virtualization
- **Large datasets:** Consider virtual scrolling for 100+ matches
- **Lazy loading:** Load match details on expand
- **Image optimization:** Lazy load team logos

### API Efficiency
- **Caching:** Cache match data with appropriate TTL
- **Pagination:** Implement for large match lists
- **Debouncing:** Debounce search and filter operations

## Accessibility

### Keyboard Navigation
- **Calendar:** Arrow key navigation between dates
- **Lists:** Tab navigation through match items
- **Modal:** Proper focus management and tab trapping

### Screen Reader Support
- **Calendar:** Descriptive date and match announcements
- **Match indicators:** Alt text for visual indicators
- **Lists:** Semantic heading structure and ARIA labels

### Visual Accessibility
- **Color contrast:** Meet WCAG AA standards
- **Focus indicators:** Clear focus outlines
- **Text alternatives:** Icons paired with text labels

## Future Enhancements

### Phase 2 Features
- **Match events integration:** Link to detailed match events page
- **Advanced filtering:** Date ranges, competitions, venues
- **Bulk operations:** Multi-select for batch actions
- **Export functionality:** Calendar export, match reports

### Performance Optimizations
- **Service worker:** Offline calendar functionality
- **Background sync:** Sync match updates when online
- **Progressive loading:** Skeleton screens and lazy loading

### Enhanced UX
- **Drag and drop:** Reschedule matches via drag
- **Quick actions:** Inline edit for basic match details
- **Notifications:** Upcoming match reminders