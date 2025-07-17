# Soft Delete Restoration Test Cases

This document provides test case templates to be added to the existing vitest API test files in `backend/tests/api/`.

## Test Case Template

Add these test cases to each relevant API test file to verify soft delete restoration functionality.

### Generic Template

```typescript
describe('Soft Delete Restoration', () => {
  it('should restore soft-deleted record when creating with same unique constraints', async () => {
    // 1. Create initial record
    const createResponse = await request(app)
      .post('/api/v1/endpoint')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testData)
      .expect(201);

    const recordId = createResponse.body.data.id;

    // 2. Delete the record (soft delete)
    await request(app)
      .delete(`/api/v1/endpoint/${recordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Verify record is soft deleted
    const deletedRecord = await prisma.table.findFirst({
      where: { id: recordId }
    });
    expect(deletedRecord.is_deleted).toBe(true);
    expect(deletedRecord.deleted_at).toBeTruthy();

    // 4. Create record with same unique constraints (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/endpoint')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testData)
      .expect(201);

    // 5. Verify restoration (should be same ID)
    expect(restoreResponse.body.data.id).toBe(recordId);

    // 6. Verify restoration in database
    const restoredRecord = await prisma.table.findFirst({
      where: { id: recordId }
    });
    expect(restoredRecord.is_deleted).toBe(false);
    expect(restoredRecord.deleted_at).toBeNull();
    expect(restoredRecord.deleted_by_user_id).toBeNull();
  });

  it('should create new record when no soft-deleted record exists', async () => {
    // Normal creation should work as before
    const response = await request(app)
      .post('/api/v1/endpoint')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testData)
      .expect(201);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBeTruthy();
  });

  it('should handle multiple soft-deleted records correctly', async () => {
    // Create and delete multiple records with different constraints
    const records = [];
    
    for (let i = 0; i < 3; i++) {
      const data = { ...testData, uniqueField: `test-${i}` };
      const createResponse = await request(app)
        .post('/api/v1/endpoint')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(data)
        .expect(201);
      
      records.push({ id: createResponse.body.data.id, data });
      
      // Soft delete
      await request(app)
        .delete(`/api/v1/endpoint/${createResponse.body.data.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    }
    
    // Restore one specific record
    const targetRecord = records[1];
    const restoreResponse = await request(app)
      .post('/api/v1/endpoint')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(targetRecord.data)
      .expect(201);
    
    // Should restore the correct record
    expect(restoreResponse.body.data.id).toBe(targetRecord.id);
  });
});
```

## Service-Specific Test Cases

### 1. Auth Service (auth.api.test.ts)

```typescript
describe('Auth Soft Delete Restoration', () => {
  it('should restore soft-deleted user when registering with same email', async () => {
    const userData = {
      email: 'restore-test@example.com',
      password: 'TestPassword123!',
      first_name: 'Test',
      last_name: 'User'
    };

    // 1. Register user
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send(userData)
      .expect(201);

    const userId = registerResponse.body.data.user.id;

    // 2. Soft delete user directly in database (simulating admin deletion)
    await prisma.user.update({
      where: { id: userId },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        deleted_by_user_id: userId
      }
    });

    // 3. Register again with same email (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        ...userData,
        password: 'NewPassword123!' // Different password
      })
      .expect(201);

    // 4. Verify restoration
    expect(restoreResponse.body.data.user.id).toBe(userId);
    expect(restoreResponse.body.data.user.email).toBe(userData.email);

    // 5. Verify in database
    const restoredUser = await prisma.user.findFirst({
      where: { id: userId }
    });
    expect(restoredUser.is_deleted).toBe(false);
    expect(restoredUser.deleted_at).toBeNull();
    
    // 6. Verify login works with new password
    await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: userData.email,
        password: 'NewPassword123!'
      })
      .expect(200);
  });
});
```

### 2. Teams Service (teams.api.test.ts)

```typescript
describe('Teams Soft Delete Restoration', () => {
  it('should restore soft-deleted team when creating with same name', async () => {
    const teamData = {
      name: 'Restoration Test Team',
      description: 'Test team for restoration'
    };

    // 1. Create team
    const createResponse = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(teamData)
      .expect(201);

    const teamId = createResponse.body.data.id;

    // 2. Delete team
    await request(app)
      .delete(`/api/v1/teams/${teamId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Create team with same name (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...teamData,
        description: 'Updated description'
      })
      .expect(201);

    // 4. Verify restoration
    expect(restoreResponse.body.data.id).toBe(teamId);
    expect(restoreResponse.body.data.name).toBe(teamData.name);
    expect(restoreResponse.body.data.description).toBe('Updated description');
  });
});
```

### 3. Players Service (players.api.test.ts)

```typescript
describe('Players Soft Delete Restoration', () => {
  it('should restore soft-deleted player when creating with same name and squad number', async () => {
    const playerData = {
      name: 'Test Player Restore',
      squadNumber: 99,
      preferredPosition: 'FW'
    };

    // 1. Create player
    const createResponse = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(playerData)
      .expect(201);

    const playerId = createResponse.body.data.id;

    // 2. Delete player
    await request(app)
      .delete(`/api/v1/players/${playerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Create player with same constraints (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...playerData,
        preferredPosition: 'MF' // Different position
      })
      .expect(201);

    // 4. Verify restoration
    expect(restoreResponse.body.data.id).toBe(playerId);
    expect(restoreResponse.body.data.name).toBe(playerData.name);
    expect(restoreResponse.body.data.squadNumber).toBe(playerData.squadNumber);
    expect(restoreResponse.body.data.preferredPosition).toBe('MF');
  });
});
```

### 4. Seasons Service (seasons.api.test.ts)

```typescript
describe('Seasons Soft Delete Restoration', () => {
  it('should restore soft-deleted season when creating with same label', async () => {
    const seasonData = {
      label: '2024-25 Restoration Test',
      startDate: '2024-08-01',
      endDate: '2025-07-31',
      isCurrent: false
    };

    // 1. Create season
    const createResponse = await request(app)
      .post('/api/v1/seasons')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(seasonData)
      .expect(201);

    const seasonId = createResponse.body.data.id;

    // 2. Delete season
    await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Create season with same label (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/seasons')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...seasonData,
        isCurrent: true // Different value
      })
      .expect(201);

    // 4. Verify restoration
    expect(restoreResponse.body.data.id).toBe(seasonId);
    expect(restoreResponse.body.data.label).toBe(seasonData.label);
    expect(restoreResponse.body.data.isCurrent).toBe(true);
  });
});
```

### 5. Awards Service (awards.api.test.ts)

```typescript
describe('Awards Soft Delete Restoration', () => {
  it('should restore soft-deleted award when creating with same player/season/category', async () => {
    // Assuming we have test player and season
    const awardData = {
      playerId: testPlayer.id,
      seasonId: testSeason.id,
      category: 'Player of the Match',
      notes: 'Original award'
    };

    // 1. Create award
    const createResponse = await request(app)
      .post('/api/v1/awards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(awardData)
      .expect(201);

    const awardId = createResponse.body.data.id;

    // 2. Delete award
    await request(app)
      .delete(`/api/v1/awards/${awardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Create award with same constraints (should restore)
    const restoreResponse = await request(app)
      .post('/api/v1/awards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...awardData,
        notes: 'Restored award'
      })
      .expect(201);

    // 4. Verify restoration
    expect(restoreResponse.body.data.id).toBe(awardId);
    expect(restoreResponse.body.data.notes).toBe('Restored award');
  });
});
```

## Integration with Existing Tests

### Adding to Existing Test Files

1. **Import necessary modules** (if not already imported):
```typescript
import { prisma } from '../setup';
```

2. **Add restoration test suite** after existing test suites in each file

3. **Use existing test data factories** from `factories.ts` where possible

4. **Follow existing patterns** for authentication and setup

### Test Data Cleanup

Ensure proper cleanup in `afterEach` or `afterAll` hooks:

```typescript
afterEach(async () => {
  // Clean up test data including soft-deleted records
  await prisma.table.deleteMany({
    where: {
      // Test data identifiers
    }
  });
});
```

## Running the Tests

### Individual Service Tests
```bash
# Test specific service restoration
cd backend
npx vitest run tests/api/teams.api.test.ts -t "restoration"
```

### All Restoration Tests
```bash
# Test all restoration functionality
cd backend
npx vitest run tests/api/ -t "restoration"
```

### With Coverage
```bash
# Run with coverage to ensure restoration code paths are tested
cd backend
npx vitest run --coverage tests/api/
```

## Expected Behavior

1. **Restoration Success**: When creating a record with the same unique constraints as a soft-deleted record, the soft-deleted record should be restored with updated data.

2. **Normal Creation**: When no soft-deleted record exists, normal creation should work as before.

3. **Data Integrity**: Restored records should have:
   - `is_deleted: false`
   - `deleted_at: null`
   - `deleted_by_user_id: null`
   - Updated `updated_at` timestamp
   - New data from the create request

4. **Permission Checks**: Restoration should respect the same permission checks as normal creation.

5. **Error Handling**: Appropriate errors should be thrown for invalid data or permission issues.