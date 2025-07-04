# iPhone Match Workflow - Manual Testing Checklist

## Overview
Critical user journey testing for iPhone Safari during live match scenarios.

## Pre-Test Setup
- [ ] iPhone with Safari browser
- [ ] Stable internet connection (for initial load)
- [ ] Test match data prepared
- [ ] Clear browser cache/storage

## Test Environment
- **Device**: iPhone (primary target)
- **Browser**: Safari
- **Network**: WiFi + Cellular (test offline scenarios)
- **Orientation**: Portrait (primary) + Landscape

---

## Core Match Workflow

### 1. Match Initialization
- [ ] **Load Application**
  - App loads within 3 seconds
  - No JavaScript errors in console
  - Database initializes successfully
  
- [ ] **Create/Select Match**
  - Match creation form works on mobile
  - Touch interactions responsive
  - Form validation clear and helpful

### 2. Event Logging (Critical Path)
- [ ] **Add Goal Event**
  - Touch "Add Event" button responsive
  - Event modal opens smoothly
  - Player selection works with touch
  - Time/period inputs functional
  - Save button works reliably
  
- [ ] **Add Multiple Events**
  - Can add events in quick succession
  - No UI lag or freezing
  - Events appear in correct order
  - Timestamps accurate

- [ ] **Event Editing**
  - Can tap to edit existing events
  - Modal pre-populates correctly
  - Changes save successfully
  - UI updates immediately

### 3. Real-Time Updates
- [ ] **Live Clock**
  - Match timer updates smoothly
  - No performance issues during long matches
  - Pause/resume functionality works
  
- [ ] **Score Updates**
  - Score reflects events immediately
  - No calculation errors
  - Visual feedback clear

### 4. Offline Functionality (Critical)
- [ ] **Go Offline During Match**
  - Turn off WiFi/cellular mid-match
  - Can continue logging events
  - No data loss
  - UI indicates offline status
  
- [ ] **Return Online**
  - Reconnect to internet
  - Data syncs automatically
  - No duplicate events
  - Sync status visible

### 5. Error Scenarios
- [ ] **Database Errors**
  - App recovers gracefully
  - User sees helpful error messages
  - Can retry failed operations
  - No data corruption

- [ ] **Network Errors**
  - Offline mode activates smoothly
  - User informed of connection issues
  - Can continue working offline

---

## Performance Benchmarks

### Load Times (iPhone Safari)
- [ ] **Initial Load**: < 3 seconds
- [ ] **Match Console**: < 1 second
- [ ] **Event Modal**: < 500ms
- [ ] **Database Operations**: < 200ms

### Responsiveness
- [ ] **Touch Response**: < 100ms
- [ ] **Scroll Performance**: Smooth 60fps
- [ ] **Animation**: No jank or stuttering

### Memory Usage
- [ ] **Extended Use**: No memory leaks during 90+ minute match
- [ ] **Background/Foreground**: App state preserved when switching apps

---

## Usability (iPhone Specific)

### Touch Interactions
- [ ] **Button Sizes**: Minimum 44px touch targets
- [ ] **Gestures**: Swipe, tap, long-press work as expected
- [ ] **Keyboard**: Virtual keyboard doesn't break layout
- [ ] **Zoom**: Pinch-to-zoom disabled where appropriate

### Visual Design
- [ ] **Text Readability**: Clear in bright sunlight
- [ ] **Color Contrast**: Accessible color combinations
- [ ] **Icon Clarity**: Icons recognizable at small sizes
- [ ] **Layout**: No horizontal scrolling required

### Orientation
- [ ] **Portrait Mode**: Primary interface works well
- [ ] **Landscape Mode**: Functional but not required to be perfect
- [ ] **Rotation**: Smooth transition between orientations

---

## Edge Cases

### Data Scenarios
- [ ] **Large Match**: 50+ events perform well
- [ ] **Multiple Matches**: Can switch between matches
- [ ] **Empty State**: New user experience clear
- [ ] **Data Recovery**: Can recover from corrupted state

### Network Scenarios
- [ ] **Slow Connection**: App remains usable on 3G
- [ ] **Intermittent Connection**: Handles connection drops
- [ ] **No Connection**: Full offline functionality

### Device Scenarios
- [ ] **Low Battery**: App doesn't drain battery excessively
- [ ] **Background**: Handles being backgrounded during match
- [ ] **Notifications**: Other app notifications don't break state

---

## Success Criteria
- ✅ **Zero Data Loss**: No events lost during any scenario
- ✅ **Smooth Performance**: No UI lag during critical operations
- ✅ **Offline Reliability**: Full functionality without internet
- ✅ **Error Recovery**: Graceful handling of all error scenarios
- ✅ **User Experience**: Intuitive and fast for match logging

## Test Results Template
```
Date: ___________
Device: iPhone _____ (iOS _____)
Tester: ___________

Core Workflow: PASS / FAIL
Offline Functionality: PASS / FAIL  
Performance: PASS / FAIL
Usability: PASS / FAIL

Critical Issues Found:
- 
- 

Minor Issues:
-
-

Overall Assessment: READY / NEEDS WORK
```