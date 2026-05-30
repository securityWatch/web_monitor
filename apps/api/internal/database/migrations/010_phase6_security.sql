-- Phase 6: security monitors (tamper / content integrity)
DO $$ BEGIN ALTER TYPE monitor_type ADD VALUE 'tamper'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
