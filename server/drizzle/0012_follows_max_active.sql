-- The cap of 2 active follows per user (ADR 0014, MAX_ACTIVE_FOLLOWS in src/limits.ts) enforced inside the database,
-- like the favorites cap in 0009: the advisory lock serializes one user's follows, so two that arrive together cannot
-- both pass. A follow is active until its match is over: an ended status, or kickoff more than 4 hours ago
-- (MAX_MATCH_HOURS in src/poller/status.ts) for a match whose status was never updated. If the cap or the definition
-- of "over" changes, change this and src/follows.ts too.
CREATE FUNCTION enforce_max_active_follows() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));
  IF (
    SELECT count(*) FROM follows f JOIN fixtures x ON x.id = f.fixture_id
    WHERE f.user_id = NEW.user_id
      AND x.status NOT IN ('FT', 'AET', 'PEN', 'AWD', 'WO', 'CANC')
      AND x.kickoff > now() - interval '4 hours'
  ) >= 2 THEN
    RAISE EXCEPTION 'follows_full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER follows_max_active BEFORE INSERT ON follows FOR EACH ROW EXECUTE FUNCTION enforce_max_active_follows();
