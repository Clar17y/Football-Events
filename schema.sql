--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8 (Debian 16.8-1.pgdg120+1)
-- Dumped by pg_dump version 17.4

-- Started on 2025-07-04 15:32:04

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
-- TOC entry 6 (class 2615 OID 16388)
-- Name: grassroots; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA grassroots;


ALTER SCHEMA grassroots OWNER TO postgres;

--
-- TOC entry 854 (class 1247 OID 16390)
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
-- TOC entry 228 (class 1255 OID 16413)
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

--
-- TOC entry 229 (class 1255 OID 16616)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: grassroots; Owner: postgres
--

CREATE FUNCTION grassroots.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION grassroots.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 216 (class 1259 OID 16414)
-- Name: awards; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.awards (
    award_id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    player_id uuid NOT NULL,
    category text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.awards OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16421)
-- Name: event_edits; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.event_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    editor_uid text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE grassroots.event_edits OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16582)
-- Name: event_participants; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    player_id uuid NOT NULL,
    kind grassroots.event_kind NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.event_participants OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16586)
-- Name: events; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    season_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    period_number integer,
    clock_ms integer,
    kind grassroots.event_kind NOT NULL,
    team_id uuid,
    player_id uuid,
    notes text,
    sentiment integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT events_clock_ms_check CHECK ((clock_ms >= 0)),
    CONSTRAINT events_period_number_check CHECK ((period_number >= 0))
);


ALTER TABLE grassroots.events OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 16428)
-- Name: lineup; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.lineup (
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    start_min double precision DEFAULT 0 NOT NULL,
    end_min double precision,
    "position" text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT lineup_end_min_check CHECK ((end_min >= (0)::double precision)),
    CONSTRAINT lineup_start_min_check CHECK ((start_min >= (0)::double precision))
);


ALTER TABLE grassroots.lineup OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16436)
-- Name: match_awards; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.match_awards (
    match_award_id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    category text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.match_awards OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 16443)
-- Name: match_notes; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.match_notes (
    match_note_id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    notes text NOT NULL,
    period_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT match_notes_period_number_check CHECK ((period_number >= 0))
);


ALTER TABLE grassroots.match_notes OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16452)
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT matches_duration_mins_check CHECK ((duration_mins > 0)),
    CONSTRAINT matches_opponent_score_check CHECK ((opponent_score >= 0)),
    CONSTRAINT matches_our_score_check CHECK ((our_score >= 0)),
    CONSTRAINT matches_period_format_check CHECK ((period_format = ANY (ARRAY['half'::text, 'quarter'::text])))
);


ALTER TABLE grassroots.matches OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 16466)
-- Name: players; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    squad_number integer,
    preferred_pos text,
    dob date,
    notes text,
    current_team uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.players OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16472)
-- Name: positions; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.positions (
    pos_code text NOT NULL,
    long_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.positions OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16477)
-- Name: seasons; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.seasons (
    season_id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.seasons OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16483)
-- Name: teams; Type: TABLE; Schema: grassroots; Owner: postgres
--

CREATE TABLE grassroots.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    home_kit_primary character varying(7),
    home_kit_secondary character varying(7),
    away_kit_primary character varying(7),
    away_kit_secondary character varying(7),
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE grassroots.teams OWNER TO postgres;

--
-- TOC entry 3291 (class 2606 OID 16490)
-- Name: awards awards_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_pkey PRIMARY KEY (award_id);


--
-- TOC entry 3293 (class 2606 OID 16492)
-- Name: event_edits event_edits_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.event_edits
    ADD CONSTRAINT event_edits_pkey PRIMARY KEY (id);


--
-- TOC entry 3295 (class 2606 OID 16494)
-- Name: lineup lineup_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_pkey PRIMARY KEY (match_id, player_id, start_min);


--
-- TOC entry 3297 (class 2606 OID 16496)
-- Name: match_awards match_awards_match_id_category_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_match_id_category_key UNIQUE (match_id, category);


--
-- TOC entry 3299 (class 2606 OID 16498)
-- Name: match_awards match_awards_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_pkey PRIMARY KEY (match_award_id);


--
-- TOC entry 3301 (class 2606 OID 16500)
-- Name: match_notes match_notes_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_notes
    ADD CONSTRAINT match_notes_pkey PRIMARY KEY (match_note_id);


--
-- TOC entry 3303 (class 2606 OID 16502)
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (match_id);


--
-- TOC entry 3305 (class 2606 OID 16504)
-- Name: players players_fullname_team_unique; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_fullname_team_unique UNIQUE (full_name, current_team);


--
-- TOC entry 3307 (class 2606 OID 16506)
-- Name: players players_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- TOC entry 3309 (class 2606 OID 16508)
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (pos_code);


--
-- TOC entry 3311 (class 2606 OID 16510)
-- Name: seasons seasons_label_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.seasons
    ADD CONSTRAINT seasons_label_key UNIQUE (label);


--
-- TOC entry 3313 (class 2606 OID 16512)
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (season_id);


--
-- TOC entry 3315 (class 2606 OID 16514)
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- TOC entry 3317 (class 2606 OID 16516)
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- TOC entry 3332 (class 2620 OID 16636)
-- Name: awards update_awards_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_awards_updated_at BEFORE UPDATE ON grassroots.awards FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3333 (class 2620 OID 16637)
-- Name: event_edits update_event_edits_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_event_edits_updated_at BEFORE UPDATE ON grassroots.event_edits FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3342 (class 2620 OID 16638)
-- Name: event_participants update_event_participants_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_event_participants_updated_at BEFORE UPDATE ON grassroots.event_participants FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3343 (class 2620 OID 16639)
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON grassroots.events FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3334 (class 2620 OID 16640)
-- Name: lineup update_lineup_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_lineup_updated_at BEFORE UPDATE ON grassroots.lineup FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3335 (class 2620 OID 16641)
-- Name: match_awards update_match_awards_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_match_awards_updated_at BEFORE UPDATE ON grassroots.match_awards FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3336 (class 2620 OID 16642)
-- Name: match_notes update_match_notes_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_match_notes_updated_at BEFORE UPDATE ON grassroots.match_notes FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3337 (class 2620 OID 16643)
-- Name: matches update_matches_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON grassroots.matches FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3338 (class 2620 OID 16644)
-- Name: players update_players_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON grassroots.players FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3339 (class 2620 OID 16645)
-- Name: positions update_positions_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON grassroots.positions FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3340 (class 2620 OID 16646)
-- Name: seasons update_seasons_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON grassroots.seasons FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3341 (class 2620 OID 16647)
-- Name: teams update_teams_updated_at; Type: TRIGGER; Schema: grassroots; Owner: postgres
--

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON grassroots.teams FOR EACH ROW EXECUTE FUNCTION grassroots.update_updated_at_column();


--
-- TOC entry 3318 (class 2606 OID 16517)
-- Name: awards awards_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3319 (class 2606 OID 16522)
-- Name: awards awards_season_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.awards
    ADD CONSTRAINT awards_season_id_fkey FOREIGN KEY (season_id) REFERENCES grassroots.seasons(season_id) ON DELETE CASCADE;


--
-- TOC entry 3331 (class 2606 OID 16611)
-- Name: events events_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.events
    ADD CONSTRAINT events_team_id_fkey FOREIGN KEY (team_id) REFERENCES grassroots.teams(id);


--
-- TOC entry 3320 (class 2606 OID 16527)
-- Name: lineup lineup_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3321 (class 2606 OID 16532)
-- Name: lineup lineup_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3322 (class 2606 OID 16537)
-- Name: lineup lineup_position_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.lineup
    ADD CONSTRAINT lineup_position_fkey FOREIGN KEY ("position") REFERENCES grassroots.positions(pos_code) ON DELETE RESTRICT;


--
-- TOC entry 3323 (class 2606 OID 16542)
-- Name: match_awards match_awards_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3324 (class 2606 OID 16547)
-- Name: match_awards match_awards_player_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_awards
    ADD CONSTRAINT match_awards_player_id_fkey FOREIGN KEY (player_id) REFERENCES grassroots.players(id) ON DELETE CASCADE;


--
-- TOC entry 3325 (class 2606 OID 16552)
-- Name: match_notes match_notes_match_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.match_notes
    ADD CONSTRAINT match_notes_match_id_fkey FOREIGN KEY (match_id) REFERENCES grassroots.matches(match_id) ON DELETE CASCADE;


--
-- TOC entry 3326 (class 2606 OID 16596)
-- Name: matches matches_away_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_away_team_id_fkey FOREIGN KEY (away_team_id) REFERENCES grassroots.teams(id) ON DELETE CASCADE;


--
-- TOC entry 3327 (class 2606 OID 16601)
-- Name: matches matches_home_team_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_home_team_id_fkey FOREIGN KEY (home_team_id) REFERENCES grassroots.teams(id) ON DELETE CASCADE;


--
-- TOC entry 3328 (class 2606 OID 16567)
-- Name: matches matches_season_id_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.matches
    ADD CONSTRAINT matches_season_id_fkey FOREIGN KEY (season_id) REFERENCES grassroots.seasons(season_id) ON DELETE CASCADE;


--
-- TOC entry 3329 (class 2606 OID 16606)
-- Name: players players_current_team_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_current_team_fkey FOREIGN KEY (current_team) REFERENCES grassroots.teams(id);


--
-- TOC entry 3330 (class 2606 OID 16577)
-- Name: players players_preferred_pos_fkey; Type: FK CONSTRAINT; Schema: grassroots; Owner: postgres
--

ALTER TABLE ONLY grassroots.players
    ADD CONSTRAINT players_preferred_pos_fkey FOREIGN KEY (preferred_pos) REFERENCES grassroots.positions(pos_code);


-- Completed on 2025-07-04 15:32:04

--
-- PostgreSQL database dump complete
--

