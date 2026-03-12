-- Migration 005: CAN-SPAM / CASL compliance
-- COMP-01: Unique index for SNS bounce/complaint dedup
-- COMP-06: Physical mailing address required for sends

-- Add physical_address column to settings singleton
ALTER TABLE settings ADD COLUMN physical_address TEXT NOT NULL DEFAULT '';

-- Partial unique index on (message_id, event_type) for bounce + complaint events.
-- Ensures at-least-once SNS delivery cannot produce duplicate suppression records.
-- Includes soft bounces (6) — a single delivery cannot soft-bounce twice.
CREATE UNIQUE INDEX idx_events_dedup_bounce_complaint
  ON events (message_id, event_type)
  WHERE event_type IN (5, 6, 7) AND message_id IS NOT NULL;
