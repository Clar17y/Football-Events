--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8 (Debian 16.8-1.pgdg120+1)
-- Dumped by pg_dump version 17.4

-- Started on 2025-06-30 17:38:54

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 24614)
-- Name: grassroots; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA grassroots;


ALTER SCHEMA grassroots OWNER TO postgres;

--
-- TOC entry 969 (class 1247 OID 24837)
-- Name: event_kind; Type: TYPE; Schema: grassroots; Owner: postgres
--

CREATE TYPE grassroots.event_kind AS ENUM (
    'goal',
    'assist',
    'key_pass',
    'save',
    'interception',
    'tackle',
    'foul',
    'penalty',
    'free_kick',
    'ball_out',
    'own_goal'
);


ALTER TYPE grassroots.event_kind OWNER TO postgres;

--
-- TOC entry 281 (class 1255 OID 24723)
-- Name: trg_set_event_season(); Type: FUNCTION; Schema: grassroots; Owner: postgres
--

CREATE FUNCTION grassroots.trg_set_event_season() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Assumes trg_set_event_season() body exists elsewhere; placeholder here.
  RETURN NEW;
END;
$$;


ALTER FUNCTION grassroots.trg_set_event_season() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 242 (class 1259 OID 24780)
-- Name: awards; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.awards (
    award_id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    player_id uuid NOT NULL,
    category text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE grassroots.awards OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 24725)
-- Name: event_edits; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.event_edits (
    edit_id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    editor_uid text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE grassroots.event_edits OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 24739)
-- Name: event_participants; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    player_id uuid NOT NULL,
    kind public.event_kind NOT NULL
);


ALTER TABLE grassroots.event_participants OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 24691)
-- Name: events; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    season_id uuid NOT NULL,
    ts_server timestamp with time zone DEFAULT now() NOT NULL,
    period_number integer,
    clock_ms integer,
    kind public.event_kind NOT NULL,
    team_id uuid,
    player_id uuid,
    notes text,
    sentiment integer DEFAULT 0 NOT NULL,
    CONSTRAINT events_clock_ms_check CHECK ((clock_ms >= 0)),
    CONSTRAINT events_period_number_check CHECK ((period_number >= 0))
);


ALTER TABLE grassroots.events OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 24755)
-- Name: lineup; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.lineup (
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    start_min double precision DEFAULT 0 NOT NULL,
    end_min double precision,
    "position" text NOT NULL,
    CONSTRAINT lineup_end_min_check CHECK ((end_min >= (0)::double precision)),
    CONSTRAINT lineup_start_min_check CHECK ((start_min >= (0)::double precision))
);


ALTER TABLE grassroots.lineup OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 24799)
-- Name: match_awards; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.match_awards (
    match_award_id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    category text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE grassroots.match_awards OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 24820)
-- Name: match_notes; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.match_notes (
    match_note_id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    notes text NOT NULL,
    period_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_notes_period_number_check CHECK ((period_number >= 0))
);


ALTER TABLE grassroots.match_notes OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 24660)
-- Name: matches; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.matches (
    match_id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    kickoff_ts timestamp with time zone NOT NULL,
    competition text,
    home_team_id uuid NOT NULL,
    away_team_id uuid NOT NULL,
    venue text,
    duration_mins integer DEFAULT 50 NOT NULL,
    period_format text DEFAULT 'quarter'::text NOT NULL,
    our_score integer DEFAULT 0 NOT NULL,
    opponent_score integer DEFAULT 0 NOT NULL,
    notes text,
    CONSTRAINT matches_duration_mins_check CHECK ((duration_mins > 0)),
    CONSTRAINT matches_opponent_score_check CHECK ((opponent_score >= 0)),
    CONSTRAINT matches_our_score_check CHECK ((our_score >= 0)),
    CONSTRAINT matches_period_format_check CHECK ((period_format = ANY (ARRAY['half'::text, 'quarter'::text])))
);


ALTER TABLE grassroots.matches OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 24642)
-- Name: players; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    squad_number integer,
    preferred_pos text,
    dob date,
    notes text,
    current_team uuid
);


ALTER TABLE grassroots.players OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 24615)
-- Name: positions; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.positions (
    pos_code text NOT NULL,
    long_name text NOT NULL
);


ALTER TABLE grassroots.positions OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 24622)
-- Name: seasons; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.seasons (
    season_id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL
);


ALTER TABLE grassroots.seasons OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 24632)
-- Name: teams; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.teams (
    team_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL
);


ALTER TABLE grassroots.teams OWNER TO postgres;

--
-- TOC entry 3387 (class 2606 OID 24788)
-- Name: awards awards_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_pkey PRIMARY KEY (award_id);


--
-- TOC entry 3381 (class 2606 OID 24733)
-- Name: event_edits event_edits_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_edits
    ADD CONSTRAINT event_edits_pkey PRIMARY KEY (edit_id);


--
-- TOC entry 3383 (class 2606 OID 24744)
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- TOC entry 3379 (class 2606 OID 24702)
-- Name: events events_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- TOC entry 3385 (class 2606 OID 24764)
-- Name: lineup lineup_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_pkey PRIMARY KEY (match_id, player_id, start_min);


--
-- TOC entry 3389 (class 2606 OID 24809)
-- Name: match_awards match_awards_match_id_category_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_match_id_category_key UNIQUE (match_id, category);


--
-- TOC entry 3391 (class 2606 OID 24807)
-- Name: match_awards match_awards_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_pkey PRIMARY KEY (match_award_id);


--
-- TOC entry 3393 (class 2606 OID 24830)
-- Name: match_notes match_notes_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_notes
    ADD CONSTRAINT match_notes_pkey PRIMARY KEY (match_note_id);


--
-- TOC entry 3377 (class 2606 OID 24675)
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (match_id);


--
-- TOC entry 3373 (class 2606 OID 24860)
-- Name: players players_fullname_team_unique; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_fullname_team_unique UNIQUE (full_name, current_team);


--
-- TOC entry 3375 (class 2606 OID 24649)
-- Name: players players_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- TOC entry 3363 (class 2606 OID 24621)
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (pos_code);


--
-- TOC entry 3365 (class 2606 OID 24631)
-- Name: seasons seasons_label_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.seasons
    ADD CONSTRAINT seasons_label_key UNIQUE (label);


--
-- TOC entry 3367 (class 2606 OID 24629)
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (season_id);


--
-- TOC entry 3369 (class 2606 OID 24641)
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- TOC entry 3371 (class 2606 OID 24639)
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (team_id);


--
-- TOC entry 3414 (class 2620 OID 24724)
-- Name: events set_event_season; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER set_event_season BEFORE INSERT OR UPDATE ON grassroots.events FOR EACH ROW EXECUTE FUNCTION grassroots.trg_set_event_season();


--
-- TOC entry 3409 (class 2606 OID 24794)
-- Name: awards awards_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3410 (class 2606 OID 24789)
-- Name: awards awards_season_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_season_id_fkey FOREIGN KEY (season_id) REFERENCES grassroots.seasons(season_id) ON DELETE CASCADE;


--
-- TOC entry 3403 (class 2606 OID 24734)
-- Name: event_edits event_edits_event_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_edits
    ADD CONSTRAINT event_edits_event_id_fkey FOREIGN KEY (event_id) REFERENCES grassroots.events(id) ON DELETE CASCADE;


--
-- TOC entry 3404 (class 2606 OID 24745)
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES grassroots.events(id) ON DELETE CASCADE;


--
-- TOC entry 3405 (class 2606 OID 24750)
-- Name: event_participants event_participants_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_participants
    ADD CONSTRAINT event_participants_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3399 (class 2606 OID 24703)
-- Name: events events_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3400 (class 2606 OID 24718)
-- Name: events events_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE SET NULL;


--
-- TOC entry 3401 (class 2606 OID 24708)
-- Name: events events_season_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_season_id_fkey FOREIGN KEY (season_id) REFERENCES grassroots.seasons(season_id) ON DELETE CASCADE;


--
-- TOC entry 3402 (class 2606 OID 24713)
-- Name: events events_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_team_id_fkey FOREIGN KEY (team_id) REFERENCES grassroots.teams(team_id) ON DELETE SET NULL;


--
-- TOC entry 3406 (class 2606 OID 24765)
-- Name: lineup lineup_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3407 (class 2606 OID 24770)
-- Name: lineup lineup_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3408 (class 2606 OID 24775)
-- Name: lineup lineup_position_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_position_fkey FOREIGN KEY ("position") REFERENCES grassroots.positions(pos_code) ON DELETE RESTRICT;


--
-- TOC entry 3411 (class 2606 OID 24810)
-- Name: match_awards match_awards_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3412 (class 2606 OID 24815)
-- Name: match_awards match_awards_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3413 (class 2606 OID 24831)
-- Name: match_notes match_notes_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_notes
    ADD CONSTRAINT match_notes_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3396 (class 2606 OID 24686)
-- Name: matches matches_away_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES grassroots.teams(team_id) ON DELETE CASCADE;


--
-- TOC entry 3397 (class 2606 OID 24681)
-- Name: matches matches_home_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES grassroots.teams(team_id) ON DELETE CASCADE;


--
-- TOC entry 3398 (class 2606 OID 24676)
-- Name: matches matches_season_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_season_id_fkey FOREIGN KEY (season_id) REFERENCES grassroots.seasons(season_id) ON DELETE CASCADE;


--
-- TOC entry 3394 (class 2606 OID 24655)
-- Name: players players_current_team_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_current_team_fkey FOREIGN KEY (current_team) REFERENCES grassroots.teams(team_id) ON DELETE SET NULL;


--
-- TOC entry 3395 (class 2606 OID 24650)
-- Name: players players_preferred_pos_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_preferred_pos_fkey FOREIGN KEY (preferred_pos) REFERENCES grassroots.positions(pos_code);


-- Completed on 2025-06-30 17:38:54

--
-- PostgreSQL database dump complete
--

