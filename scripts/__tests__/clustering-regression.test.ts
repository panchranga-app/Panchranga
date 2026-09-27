import { generateEmbedding } from '../../lib/embeddings';
import { clusterRawItems } from '../../lib/clustering';
import { RawItem } from '../../lib/types';

async function runRegressionTest() {
  console.log('🧪 Starting Panchranga Clustering Regression Test...');

  const BOILERPLATE = 'Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News';

  // Batch of real items that historically caused the mega-hub bug
  const testItemsRaw = [
    // 1. Unrelated Sakshi Telugu stories with boilerplate summary
    {
      id: 'item-1',
      title: 'పాక్‌లో ఆత్మాహుతి దాడి.. 11 మంది మృతి - Sakshi',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_1',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Sakshi',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-2',
      title: 'కూల్‌ డ్రింక్‌లో మత్తుమందు కలిపి లైంగిక దాడి - Sakshi',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_2',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Sakshi',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-3',
      title: 'మిసెస్ మామ్ సీజన్ 10 - Sakshi',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_3',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Sakshi',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-4',
      title: 'వరదల్లో కొట్టుకుపోయిన నిండు గర్భిణీ - Sakshi',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_4',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Sakshi',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-5',
      title: 'చిరుధాన్యాలతో పౌష్టికాహారం - Sakshi',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_5',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Sakshi',
      lane: 'mainstream' as const,
    },

    // 2. Unrelated Hindi stories with boilerplate summary
    {
      id: 'item-6',
      title: 'पितृपक्ष मेला 2026 में सुरक्षा के लिए क्यूआर कोड व्यवस्था - navbharattimes.indiatimes.com',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_6',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Navbharat Times',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-7',
      title: 'अंतरराष्ट्रीय कराटे चैंपियनशिप में भारत का प्रतिनिधित्व - jagran.com',
      url: 'https://news.google.com/rss/articles/CBMi_unrelated_7',
      published_at: new Date().toISOString(),
      raw_summary: BOILERPLATE,
      source_name: 'Dainik Jagran',
      lane: 'mainstream' as const,
    },

    // 3. Two genuinely related stories from different sources about the SAME event
    {
      id: 'item-8',
      title: 'Election Commission holds all-party meeting on voter roll revision in New Delhi',
      url: 'https://indianexpress.com/article/india/eci-all-party-meeting-delhi-101',
      published_at: new Date().toISOString(),
      raw_summary: 'Chief Election Commissioner addressed representatives from all registered national parties.',
      source_name: 'Indian Express',
      lane: 'mainstream' as const,
    },
    {
      id: 'item-9',
      title: 'ECI all-party meeting in Delhi discusses voter roll revision and electoral reforms',
      url: 'https://www.thehindu.com/news/national/eci-all-party-meeting-delhi-102',
      published_at: new Date().toISOString(),
      raw_summary: 'Political parties met with the Election Commission of India in Delhi to review electoral roll updates.',
      source_name: 'The Hindu',
      lane: 'mainstream' as const,
    },

    // 4. Duplicate within-hub story (same title, different Google tracking URL)
    {
      id: 'item-10',
      title: 'Election Commission holds all-party meeting on voter roll revision in New Delhi',
      url: 'https://news.google.com/rss/articles/CBMi_tracking_redirect_duplicate_url',
      published_at: new Date().toISOString(),
      raw_summary: 'Different redirect tracking URL for the exact same Indian Express headline.',
      source_name: 'Indian Express',
      lane: 'mainstream' as const,
    },
  ];

  // Compute embeddings for all items
  const testItems: RawItem[] = [];
  for (const it of testItemsRaw) {
    const embedding = await generateEmbedding(it.title, it.raw_summary);
    testItems.push({
      ...it,
      fetched_at: new Date().toISOString(),
      embedding,
    } as RawItem);
  }

  // Run clustering
  const result = clusterRawItems([], testItems);

  console.log(`\n📊 Clustered ${testItems.length} items into ${result.hubs.length} Topic Hubs:`);
  result.hubs.forEach((h, idx) => {
    console.log(`\n[Hub ${idx + 1}] "${h.title}" (Items: ${h.items?.length})`);
    h.items?.forEach((i) => {
      console.log(`   └─ [${i.source_name}] ${i.title}`);
    });
  });

  // Assertions:
  // 1. Unrelated Sakshi stories must NOT all merge into 1 mega-hub
  const sakshiItemsInResult = result.hubs.map((h) => ({
    title: h.title,
    count: (h.items || []).filter((i) => i.source_name === 'Sakshi').length,
  }));
  const maxSakshiInSingleHub = Math.max(...sakshiItemsInResult.map((x) => x.count));

  if (maxSakshiInSingleHub > 1) {
    console.error(`❌ REGRESSION FAILED: Unrelated Sakshi stories merged! Max Sakshi in 1 hub = ${maxSakshiInSingleHub}`);
    process.exit(1);
  } else {
    console.log(`\n✅ TEST PASSED: Unrelated Sakshi stories remained in independent hubs (Max in 1 hub = ${maxSakshiInSingleHub}).`);
  }

  // 2. Genuinely related ECI meeting stories MUST cluster together
  const eciHub = result.hubs.find((h) => h.title.toLowerCase().includes('election commission') || h.title.toLowerCase().includes('eci'));
  if (!eciHub) {
    console.error('❌ REGRESSION FAILED: Genuinely related ECI stories failed to cluster!');
    process.exit(1);
  }

  const eciItemCount = eciHub.items?.length || 0;
  console.log(`✅ TEST PASSED: Genuinely related ECI stories clustered together (${eciItemCount} items in hub).`);

  // 3. Duplicate headline check: item-8 and item-10 have identical titles.
  // Within-hub duplicate detection must ensure only 1 copy of that identical headline exists in the hub!
  const duplicateTitles = eciHub.items?.filter(
    (i) => i.title === 'Election Commission holds all-party meeting on voter roll revision in New Delhi'
  );
  if (duplicateTitles && duplicateTitles.length > 1) {
    console.error(`❌ REGRESSION FAILED: Duplicate headline was not merged/rejected within hub! Found ${duplicateTitles.length} copies.`);
    process.exit(1);
  } else {
    console.log('✅ TEST PASSED: Within-hub duplicate headline was successfully merged and deduplicated!');
  }

  console.log('\n🎉 ALL REGRESSION TESTS PASSED!');
}

runRegressionTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
