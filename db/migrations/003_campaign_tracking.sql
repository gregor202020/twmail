-- Add tracking, tags, and send-time optimization columns to campaigns
ALTER TABLE campaigns ADD COLUMN tags TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN utm_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN utm_source TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN utm_medium TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN utm_campaign TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN utm_content TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN ga_tracking BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN tracking_domain TEXT DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN send_time_optimization BOOLEAN NOT NULL DEFAULT FALSE;
