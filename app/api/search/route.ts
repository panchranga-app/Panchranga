import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get('q') || '').trim();

  if (!q) {
    return NextResponse.json(
      { query: '', hubs: [], items: [] },
      { headers: CACHE_HEADERS }
    );
  }

  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  // 1. Try Supabase
  if (supabase) {
    try {
      const isFactCheck = ['fact check', 'fact-check', 'factcheck'].includes(q.toLowerCase());

      const [hubsRes, itemsRes] = await Promise.all([
        supabase
          .from('topic_hubs')
          .select('*')
          .or(`title.ilike.%${q}%,ai_summary.ilike.%${q}%`)
          .order('last_updated_at', { ascending: false })
          .limit(limit),
        supabase
          .from('raw_items')
          .select(`
            id,
            title,
            url,
            published_at,
            og_image,
            og_description,
            cluster_id,
            sources:source_id (
              id,
              name,
              lane,
              region
            )
          `)
          .or(isFactCheck ? `title.ilike.%fact check%,title.ilike.%fact-check%` : `title.ilike.%${q}%`)
          .order('published_at', { ascending: false })
          .limit(limit),
      ]);

      return NextResponse.json(
        {
          query: q,
          hubs: hubsRes.data || [],
          items: itemsRes.data || [],
        },
        { headers: CACHE_HEADERS }
      );
    } catch (err: any) {
      console.error('Supabase search error:', err);
    }
  }

  // 2. Fallback to local JSON files
  try {
    const hubsPath = path.resolve(process.cwd(), 'data', 'topic-hubs.json');
    const itemsPath = path.resolve(process.cwd(), 'data', 'ingested-items.json');
    let localHubs: any[] = [];
    let localItems: any[] = [];

    if (fs.existsSync(hubsPath)) {
      localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
    }
    if (fs.existsSync(itemsPath)) {
      localItems = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
    }

    const lowerQ = q.toLowerCase();
    const matchingHubs = localHubs
      .filter((h) => h.title?.toLowerCase().includes(lowerQ) || h.ai_summary?.toLowerCase().includes(lowerQ))
      .slice(0, limit);

    const matchingItems = localItems
      .filter((i) => i.title?.toLowerCase().includes(lowerQ))
      .slice(0, limit);

    return NextResponse.json(
      {
        query: q,
        hubs: matchingHubs,
        items: matchingItems,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
