import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { generateNeutralSummary, cleanHeadline } from '@/lib/summarizer';
import { TopicHub, RawItem } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface RouteProps {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const hubId = decodeURIComponent(params.id || '').trim();

  if (!hubId) {
    return NextResponse.json({ error: 'Hub ID is required' }, { status: 400 });
  }

  try {
    let hub: TopicHub | null = null;
    let items: RawItem[] = [];

    // 1. Try fetching from Supabase
    if (supabase) {
      try {
        const [{ data: dbHub }, { data: dbItems }] = await Promise.all([
          supabase.from('topic_hubs').select('*').eq('id', hubId).maybeSingle(),
          supabase
            .from('raw_items')
            .select(`
              id,
              title,
              url,
              published_at,
              og_image,
              og_description,
              raw_summary,
              cluster_id
            `)
            .eq('cluster_id', hubId)
            .order('published_at', { ascending: false })
            .limit(10),
        ]);

        if (dbHub) {
          hub = dbHub as TopicHub;
          items = (dbItems || []) as RawItem[];
        }
      } catch (err) {
        console.warn('⚠️ Supabase error in /api/hub/[id]/summary:', err);
      }
    }

    // 2. Fallback to local topic-hubs.json if not found in Supabase
    const dataDir = path.resolve(process.cwd(), 'data');
    const hubsPath = path.resolve(dataDir, 'topic-hubs.json');
    let localHubs: TopicHub[] = [];

    if (!hub && fs.existsSync(hubsPath)) {
      try {
        localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
        const found = localHubs.find((h) => h.id === hubId || encodeURIComponent(h.id) === hubId);
        if (found) {
          hub = found;
          items = found.items || [];
        }
      } catch (e) {
        console.warn('⚠️ Local file read error in /api/hub/[id]/summary:', e);
      }
    }

    if (!hub) {
      return NextResponse.json({ error: 'Topic hub not found' }, { status: 404 });
    }

    // 3. Cache Hit: Return existing AI summary immediately if already present
    if (hub.ai_summary && hub.ai_summary.trim().length > 10) {
      return NextResponse.json({
        summary: hub.ai_summary,
        isFlagged: false,
        cached: true,
      });
    }

    // 4. Cache Miss: Generate AI summary on-demand using the multi-provider cascade
    hub.items = items;
    const { summary, isFlagged, flagReason } = await generateNeutralSummary(hub);

    if (summary && !isFlagged) {
      // 5. Persist the generated summary to Supabase so it's cached permanently
      if (supabase) {
        try {
          await supabase
            .from('topic_hubs')
            .update({ ai_summary: summary })
            .eq('id', hubId);
        } catch (updateErr) {
          console.warn('⚠️ Failed to update ai_summary in Supabase:', updateErr);
        }
      }

      // Also update local cache file if available
      if (fs.existsSync(hubsPath)) {
        try {
          if (localHubs.length === 0) {
            localHubs = JSON.parse(fs.readFileSync(hubsPath, 'utf-8'));
          }
          const target = localHubs.find((h) => h.id === hubId || encodeURIComponent(h.id) === hubId);
          if (target) {
            target.ai_summary = summary;
            fs.writeFileSync(hubsPath, JSON.stringify(localHubs, null, 2));
          }
        } catch {}
      }
    }

    return NextResponse.json({
      summary: summary || cleanHeadline(hub.title),
      isFlagged,
      flagReason,
      cached: false,
    });
  } catch (error: any) {
    console.error('Fatal error generating on-demand summary:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: RouteProps) {
  return GET(request, props);
}
