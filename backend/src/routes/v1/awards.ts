import { Router } from 'express';
import { AwardsService } from '../../services/AwardsService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { awardCreateSchema, awardUpdateSchema, matchAwardCreateSchema, matchAwardUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
const awardsService = new AwardsService();

// Match Awards Routes - Use different path to avoid conflict with /:id

// POST /api/v1/awards/match-awards - Create new match award
router.post('/match-awards',
  validateRequest(matchAwardCreateSchema),
  asyncHandler(async (req, res) => {
    const matchAward = await awardsService.createMatchAward(req.body);
    return res.status(201).json(matchAward);
  })
);

// GET /api/v1/awards/match-awards - List match awards with pagination and filtering
router.get('/match-awards', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, playerId, category } = req.query;
  
  const result = await awardsService.getMatchAwards({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    playerId: playerId as string,
    category: category as string
  });
  
  return res.json(result);
}));

// GET /api/v1/awards/match-awards/:matchId/list - Get all awards for a specific match
router.get('/match-awards/:matchId/list', validateUUID('matchId'), asyncHandler(async (req, res) => {
  const matchAwards = await awardsService.getMatchAwardsByMatch(req.params['matchId']!);
  return res.json(matchAwards);
}));

// GET /api/v1/awards/match-awards/:id - Get match award by ID
router.get('/match-awards/:id', validateUUID(), asyncHandler(async (req, res) => {
  const matchAward = await awardsService.getMatchAwardById(req.params['id']!);
  
  if (!matchAward) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(matchAward);
}));

// PUT /api/v1/awards/match-awards/:id - Update match award
router.put('/match-awards/:id',
  validateRequest(matchAwardUpdateSchema),
  asyncHandler(async (req, res) => {
  const matchAward = await awardsService.updateMatchAward(req.params['id']!, req.body);
  
  if (!matchAward) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(matchAward);
}));

// DELETE /api/v1/awards/match-awards/:id - Delete match award
router.delete('/match-awards/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await awardsService.deleteMatchAward(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

// Season Awards Routes

// GET /api/v1/awards - List season awards with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, seasonId, playerId, category } = req.query;
  
  const result = await awardsService.getAwards({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    seasonId: seasonId as string,
    playerId: playerId as string,
    category: category as string
  });
  
  return res.json(result);
}));

// POST /api/v1/awards - Create new season award
router.post('/', 
  validateRequest(awardCreateSchema),
  asyncHandler(async (req, res) => {
    const award = await awardsService.createAward(req.body);
    return res.status(201).json(award);
  })
);

// GET /api/v1/awards/:id - Get season award by ID
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const award = await awardsService.getAwardById(req.params['id']!);
  
  if (!award) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(award);
}));

// PUT /api/v1/awards/:id - Update season award
router.put('/:id',
  validateRequest(awardUpdateSchema),
  asyncHandler(async (req, res) => {
  const award = await awardsService.updateAward(req.params['id']!, req.body);
  
  if (!award) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(award);
}));

// DELETE /api/v1/awards/:id - Delete season award
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await awardsService.deleteAward(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

// Helper Routes

// GET /api/v1/awards/player/:playerId - Get all awards for a specific player
router.get('/player/:playerId', validateUUID('playerId'), asyncHandler(async (req, res) => {
  const [seasonAwards, matchAwards] = await Promise.all([
    awardsService.getAwardsByPlayer(req.params['playerId']!),
    awardsService.getMatchAwardsByPlayer(req.params['playerId']!)
  ]);
  
  return res.json({
    seasonAwards,
    matchAwards
  });
}));

// GET /api/v1/awards/season/:seasonId - Get all awards for a specific season
router.get('/season/:seasonId', validateUUID('seasonId'), asyncHandler(async (req, res) => {
  const awards = await awardsService.getAwardsBySeason(req.params['seasonId']!);
  return res.json(awards);
}));

// This route has been moved above to fix route conflicts

export default router;