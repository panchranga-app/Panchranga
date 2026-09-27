import { NextRequest, NextResponse } from 'next/server';
import { getEnglishGloss, detectScriptLanguage } from '@/lib/translator';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  const lang = searchParams.get('lang') || undefined;

  if (!text) {
    return NextResponse.json({ error: 'Text query parameter is required' }, { status: 400 });
  }

  const result = await getEnglishGloss(text, lang);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body.text;
    const lang = body.lang;

    if (!text) {
      return NextResponse.json({ error: 'Text is required in body' }, { status: 400 });
    }

    const result = await getEnglishGloss(text, lang);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Invalid request' }, { status: 400 });
  }
}
