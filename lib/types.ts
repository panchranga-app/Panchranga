export type LaneType = 'mainstream' | 'grassroots' | 'discourse' | 'aggregator';
export type SourceType = 'rss' | 'youtube' | 'reddit' | 'api';

export interface Source {
  id: string;
  name: string;
  lane: LaneType;
  type: SourceType;
  feed_url: string;
  language: string;
  region?: string;
  is_active: boolean;
  last_status?: string;
  last_error?: string;
  last_attempted_at?: string;
  created_at: string;
}

export interface RawItem {
  id: string;
  source_id: string;
  source_name?: string;
  lane?: LaneType;
  title: string;
  url: string;
  published_at: string;
  raw_summary?: string;
  og_image?: string;
  og_description?: string;
  category?: string;
  embedding?: number[];
  cluster_id?: string;
  via_google_news?: boolean;
  english_gloss?: string;
  fetched_at: string;
  // Joined fields
  source?: Source;
  sources?: Source;
}

export interface TopicHub {
  id: string;
  title: string;
  english_gloss?: string;
  ai_summary?: string;
  first_seen_at: string;
  last_updated_at: string;
  item_count: number;
  mainstream_count?: number;
  grassroots_count?: number;
  discourse_count?: number;
  via_google_news?: boolean;
  items?: RawItem[];
}
