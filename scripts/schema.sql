-- Enable pgvector extension for embedding similarity search
create extension if not exists vector;

-- 1. Sources table: every RSS/YouTube/Reddit feed ingested
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lane text not null check (lane in ('mainstream', 'grassroots', 'discourse', 'aggregator')),
  type text not null check (type in ('rss', 'youtube', 'reddit', 'api')),
  feed_url text not null unique,
  language text not null default 'en',
  region text, -- e.g. 'national', 'tamil-nadu', 'west-bengal'
  is_active boolean default true,
  last_status text default 'pending',
  last_error text,
  last_attempted_at timestamptz,
  created_at timestamptz default now()
);

-- 2. Raw items table: raw items pulled from sources, before clustering
create table if not exists raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  title text not null,
  url text not null unique,
  published_at timestamptz default now(),
  raw_summary text, -- RSS description/snippet
  og_image text, -- Open Graph preview image URL
  og_description text, -- Publisher's meta description
  category text default 'General', -- Beat: Politics, Courts, Economy, etc.
  embedding vector(384), -- pgvector matching all-MiniLM-L6-v2 dimension
  cluster_id uuid, -- nullable until clustered
  fetched_at timestamptz default now()
);

-- 3. Topic hubs: the clustered "same event" groups
create table if not exists topic_hubs (
  id uuid primary key default gen_random_uuid(),
  title text not null, -- AI-generated or main item title
  ai_summary text, -- short neutral summary (with strict guardrails)
  first_seen_at timestamptz default now(),
  last_updated_at timestamptz default now(),
  item_count int default 0
);

-- Migrations for existing tables
alter table raw_items add column if not exists category text default 'General';
alter table sources add column if not exists last_status text default 'pending';
alter table sources add column if not exists last_error text;
alter table sources add column if not exists last_attempted_at timestamptz;
alter table sources drop constraint if exists sources_lane_check;
alter table sources add constraint sources_lane_check check (lane in ('mainstream', 'grassroots', 'discourse', 'aggregator'));
alter table sources drop constraint if exists sources_type_check;
alter table sources add constraint sources_type_check check (type in ('rss', 'youtube', 'reddit', 'api'));

-- Add foreign key constraint for cluster_id
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'fk_cluster'
  ) then
    alter table raw_items
    add constraint fk_cluster foreign key (cluster_id) references topic_hubs(id) on delete set null;
  end if;
end $$;

-- Indexes for efficient querying & retention pruning
drop index if exists idx_raw_items_url; -- redundant with raw_items_url_key unique constraint
create index if not exists idx_raw_items_published on raw_items(published_at desc);
create index if not exists idx_raw_items_category on raw_items(category);
create index if not exists idx_raw_items_cluster on raw_items(cluster_id);
create index if not exists idx_sources_lane on sources(lane);
create index if not exists idx_sources_active on sources(is_active);
create index if not exists idx_topic_hubs_updated on topic_hubs(last_updated_at desc);

-- Function for pgvector cosine distance similarity lookup
create or replace function match_topic_hubs(
  query_embedding vector(384),
  match_threshold float,
  time_window_hours int default 72
)
returns table (
  id uuid,
  title text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    topic_hubs.id,
    topic_hubs.title,
    1 - (raw_items.embedding <=> query_embedding) as similarity
  from raw_items
  join topic_hubs on raw_items.cluster_id = topic_hubs.id
  where raw_items.embedding is not null
    and raw_items.published_at >= now() - (time_window_hours || ' hours')::interval
    and 1 - (raw_items.embedding <=> query_embedding) >= match_threshold
  order by similarity desc
  limit 5;
end;
$$;

