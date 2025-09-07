-- Update position_zones to match frontend formationCore.ts ZONES
-- Safe to run repeatedly. This truncates the table and re-inserts canonical zones.
-- Schema: grassroots.position_zones (position_code enum must include all codes used below)

BEGIN;

-- Clear existing zones (adjust if you prefer a softer update strategy)
TRUNCATE TABLE grassroots.position_zones RESTART IDENTITY;

-- GK
INSERT INTO grassroots.position_zones (position_code, zone_name, min_x, max_x, min_y, max_y, priority)
VALUES ('GK', 'Goalkeeper', 0, 12, 40, 60, 1);

-- Defenders
INSERT INTO grassroots.position_zones VALUES ('CB',  'Center Back',      12, 32, 28, 72, 2);
INSERT INTO grassroots.position_zones VALUES ('LB',  'Left Back',         8, 28,  0, 36, 2);
INSERT INTO grassroots.position_zones VALUES ('RB',  'Right Back',        8, 28, 64,100, 2);
INSERT INTO grassroots.position_zones VALUES ('LWB', 'Left Wing Back',   24, 42,  0, 32, 2);
INSERT INTO grassroots.position_zones VALUES ('RWB', 'Right Wing Back',  24, 42, 68,100, 2);
INSERT INTO grassroots.position_zones VALUES ('WB',  'Wing Back',        24, 42, 20, 80, 1);
INSERT INTO grassroots.position_zones VALUES ('FB',  'Full Back',        12, 32, 20, 80, 1);

-- Midfield (DM/CM/AM bands)
INSERT INTO grassroots.position_zones VALUES ('CDM', 'Defensive Midfielder', 34, 52, 30, 70, 3);
INSERT INTO grassroots.position_zones VALUES ('DM',  'Defensive Midfielder', 34, 52, 30, 70, 1);
INSERT INTO grassroots.position_zones VALUES ('CM',  'Central Midfielder',   54, 58, 24, 76, 3);
INSERT INTO grassroots.position_zones VALUES ('LCM', 'Left CM',              50, 56, 24, 50, 1);
INSERT INTO grassroots.position_zones VALUES ('RCM', 'Right CM',             50, 56, 50, 76, 1);
INSERT INTO grassroots.position_zones VALUES ('CAM', 'Attacking Midfielder', 60, 66, 30, 70, 3);
INSERT INTO grassroots.position_zones VALUES ('LAM', 'Left Attacking Mid',   60, 68,  8, 36, 2);
INSERT INTO grassroots.position_zones VALUES ('RAM', 'Right Attacking Mid',  60, 68, 64, 92, 2);
INSERT INTO grassroots.position_zones VALUES ('AM',  'Attacking Midfielder', 60, 68, 24, 76, 1);
INSERT INTO grassroots.position_zones VALUES ('LM',  'Left Midfielder',      40, 62,  0, 30, 3);
INSERT INTO grassroots.position_zones VALUES ('RM',  'Right Midfielder',     40, 62, 70,100, 3);
INSERT INTO grassroots.position_zones VALUES ('WM',  'Wide Midfielder',      40, 62, 20, 80, 1);

-- Forwards / Wingers
INSERT INTO grassroots.position_zones VALUES ('LW',  'Left Winger',         76, 98,  0, 36, 4);
INSERT INTO grassroots.position_zones VALUES ('RW',  'Right Winger',        76, 98, 64,100, 4);
INSERT INTO grassroots.position_zones VALUES ('CF',  'Centre Forward',      72, 96, 30, 70, 4);
INSERT INTO grassroots.position_zones VALUES ('ST',  'Striker',             82,100, 24, 76, 4);
INSERT INTO grassroots.position_zones VALUES ('SS',  'Second Striker',      70, 90, 30, 70, 2);
INSERT INTO grassroots.position_zones VALUES ('LF',  'Left Forward',        80, 98,  0, 40, 2);
INSERT INTO grassroots.position_zones VALUES ('RF',  'Right Forward',       80, 98, 60,100, 2);

COMMIT;

-- How to run (examples):
-- 1) psql:
--    psql "$DATABASE_URL" -f backend/scripts/sql/update_position_zones_from_frontend.sql
-- 2) Docker Postgres
--    docker exec -i <pg-container> psql -U <user> -d <db> -f /work/backend/scripts/sql/update_position_zones_from_frontend.sql
-- After running, restart backend or wait 5 minutes for cache expiry.

