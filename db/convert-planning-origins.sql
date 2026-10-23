-- One-off conversion of existing planning records that have no standard-planning origin.
-- Run in the Supabase SQL Editor. This script is intentionally separate from schema.sql
-- so the conversion can be skipped by not running this file.
-- Supabase may show a generic RLS warning for the CREATE TABLE statements below.
-- They create temporary tables that are dropped at commit and are not exposed through the API.
-- Choose "Run without RLS" for this script; enabling RLS is not needed for these temporary tables.
--
-- 1. Add one explicit mapping row per planning UUID below.
-- 2. Run with apply_changes = false and inspect the preview.
-- 3. Set apply_changes = true only after confirming every mapping, then run again.
-- Existing origins are never overwritten.
--
-- Mapping columns: planning UUID, template name, original standard plan name, level.
-- Example:
-- INSERT INTO planning_origin_mapping (planning_id, template_name, plan_name, level)
-- VALUES ('<planning-uuid>', 'Gullbrandstorps Scoutkår', 'Läsår 1 VT', 'Spårare');

BEGIN;

CREATE TEMP TABLE planning_origin_mapping (
    planning_id uuid PRIMARY KEY,
    template_name text NOT NULL CHECK (length(trim(template_name)) > 0),
    plan_name text NOT NULL CHECK (length(trim(plan_name)) > 0),
    level text NOT NULL CHECK (length(trim(level)) > 0)
) ON COMMIT DROP;

-- Add explicit planning UUID → origin mappings here before running the script.
 INSERT INTO planning_origin_mapping (planning_id, template_name, plan_name, level)
 VALUES ('b8097873-5bc9-496e-9375-de27aceeb78e', 'Gullbrandstorps Scoutkår', 'Läsår 1 HT', 'Spårare');

CREATE TEMP TABLE planning_origin_conversion_settings (
    apply_changes boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO planning_origin_conversion_settings (apply_changes) VALUES (false);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM planning_origin_mapping) THEN
        RAISE EXCEPTION 'Add explicit mappings to planning_origin_mapping before running this conversion.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM planning_origin_mapping m
        LEFT JOIN public.planeringar p ON p.id = m.planning_id
        WHERE p.id IS NULL
    ) THEN
        RAISE EXCEPTION 'At least one mapped planning UUID was not found in public.planeringar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM planning_origin_mapping m
        JOIN public.planeringar p ON p.id = m.planning_id
        WHERE p.level IS DISTINCT FROM m.level
    ) THEN
        RAISE EXCEPTION 'At least one mapped level does not match the planning record.';
    END IF;
END;
$$;

SELECT
    p.id AS planning_id,
    p.name AS current_name,
    p.level,
    p.year,
    p.term,
    m.template_name,
    m.plan_name AS standard_plan_name,
    CASE
        WHEN COALESCE(p.data->'standard_planning_source', 'null'::jsonb) <> 'null'::jsonb
            THEN 'Already has origin — unchanged'
        ELSE 'Ready to convert'
    END AS conversion_status
FROM planning_origin_mapping m
JOIN public.planeringar p ON p.id = m.planning_id
ORDER BY p.level, p.year, p.term, p.name;

DO $$
DECLARE
    apply_conversion boolean;
    updated_count integer;
BEGIN
    SELECT apply_changes
    INTO apply_conversion
    FROM planning_origin_conversion_settings;

    IF NOT apply_conversion THEN
        RAISE NOTICE 'Dry run only: no planning records were changed. Set apply_changes to true after reviewing the preview.';
        RETURN;
    END IF;

    UPDATE public.planeringar p
    SET data = jsonb_set(
        p.data,
        '{standard_planning_source}',
        jsonb_build_object(
            'templateName', m.template_name,
            'planName', m.plan_name,
            'level', m.level
        ),
        true
    )
    FROM planning_origin_mapping m
    WHERE p.id = m.planning_id
      AND COALESCE(p.data->'standard_planning_source', 'null'::jsonb) = 'null'::jsonb;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % planning record(s). Records that already had an origin were left unchanged.', updated_count;
END;
$$;

COMMIT;
