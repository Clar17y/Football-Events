import { Router } from 'express';
import teamsRouter from './teams';
import playersRouter from './players';
import playerTeamsRouter from './player-teams';
import playersWithTeamRouter from './players-with-team';
import playersWithTeamsRouter from './players-with-teams';
import seasonsRouter from './seasons';
import matchesRouter from './matches';
import eventsRouter from './events';
import lineupsRouter from './lineups';
import awardsRouter from './awards';
import statsRouter from './stats';
import authRouter from './auth';
import activityRouter from './activity';
import defaultLineupsRouter from './default-lineups';
import positionsRouter from './positions';
import meRouter from './me';
import devRouter from './dev';

const v1Router = Router();

// API v1 info endpoint
v1Router.get('/', (_req, res) => {
  res.json({
    version: '1.0.0',
    name: 'Grassroots Football API v1',
    description: 'RESTful API for grassroots football team management',
    endpoints: {
      teams: '/api/v1/teams',
      players: '/api/v1/players',
      playerTeams: '/api/v1/player-teams',
      playersWithTeam: '/api/v1/players-with-team',
      playersWithTeams: '/api/v1/players-with-teams',
      seasons: '/api/v1/seasons',
      matches: '/api/v1/matches',
      events: '/api/v1/events',
      lineups: '/api/v1/lineups',
      defaultLineups: '/api/v1/default-lineups',
      positions: '/api/v1/positions',
      awards: '/api/v1/awards',
      stats: '/api/v1/stats',
      auth: '/api/v1/auth',
      activity: '/api/v1/activity',
      me: '/api/v1/me'
    },
    documentation: 'https://api-docs.grassroots-football.com/v1' // TODO: Add actual docs URL
  });
});

// Mount entity routers
v1Router.use('/teams', teamsRouter);
v1Router.use('/players', playersRouter);
v1Router.use('/player-teams', playerTeamsRouter);
v1Router.use('/players-with-team', playersWithTeamRouter);
v1Router.use('/players-with-teams', playersWithTeamsRouter);
v1Router.use('/seasons', seasonsRouter);
v1Router.use('/matches', matchesRouter);
v1Router.use('/events', eventsRouter);
v1Router.use('/lineups', lineupsRouter);
v1Router.use('/default-lineups', defaultLineupsRouter);
v1Router.use('/positions', positionsRouter);
v1Router.use('/awards', awardsRouter);
v1Router.use('/stats', statsRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/activity', activityRouter);
v1Router.use('/me', meRouter);
v1Router.use('/dev', devRouter);

export default v1Router;
