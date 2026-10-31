-- The cap of 3 favorites per user (ADR 0014, MAX_FAVORITES in src/limits.ts) enforced inside the database, so
-- two adds that arrive together cannot both pass it. The advisory lock serializes one user's adds; the count
-- inside a trigger runs after the lock, so it sees the add that went first. If the cap changes, change this too.
CREATE FUNCTION enforce_max_favorites() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));
  IF (SELECT count(*) FROM favorite_teams WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'favorites_full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER favorite_teams_max BEFORE INSERT ON favorite_teams FOR EACH ROW EXECUTE FUNCTION enforce_max_favorites();
