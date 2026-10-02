-- Panchranga Newsletter Migration: Provider Tracking & Budgeting
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 1. Add last_sent_at column to newsletter_subscribers
-- Enables prioritizing deferred subscribers (ORDER BY last_sent_at ASC NULLS FIRST)
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz DEFAULT NULL;

-- Index to optimize querying active subscribers ordered by last_sent_at
CREATE INDEX IF NOT EXISTS idx_subscribers_active_last_sent 
  ON newsletter_subscribers(is_active, last_sent_at NULLS FIRST);

-- 2. Add provider tracking and deferred count columns to newsletter_sends
ALTER TABLE newsletter_sends 
  ADD COLUMN IF NOT EXISTS deferred_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gmail_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brevo_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resend_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_counts jsonb DEFAULT '{}'::jsonb;

-- Index sent_at for fast lookups of sends during the current IST day
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_sent_at 
  ON newsletter_sends(sent_at);

-- 3. Row-Level Security (RLS) policies for newsletter_subscribers
-- Allows public visitors from the website to subscribe and unsubscribe
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon subscribe" ON newsletter_subscribers;
CREATE POLICY "Allow anon subscribe" 
  ON newsletter_subscribers FOR INSERT 
  TO anon, authenticated, service_role 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon check" ON newsletter_subscribers;
CREATE POLICY "Allow anon check" 
  ON newsletter_subscribers FOR SELECT 
  TO anon, authenticated, service_role 
  USING (true);

DROP POLICY IF EXISTS "Allow anon update" ON newsletter_subscribers;
CREATE POLICY "Allow anon update" 
  ON newsletter_subscribers FOR UPDATE 
  TO anon, authenticated, service_role 
  USING (true) 
  WITH CHECK (true);

