import { getCategoryAndRegion } from '../../lib/topics';

export interface EvalHeadline {
  title: string;
  expectedCategory: string;
  expectedRegion?: string;
  sourceName?: string;
}

export const EVAL_HEADLINES: EvalHeadline[] = [
  // 1. Entertainment / Cinema edge cases (previously tagged Health or General)
  { title: "Karan Johar reveals casting for upcoming romantic drama starring Kartik Aaryan", expectedCategory: "Entertainment" },
  { title: "Pushpa 2 box office collection crosses 1000 crore worldwide after teaser release", expectedCategory: "Entertainment" },
  { title: "Shah Rukh Khan and Deepika Padukone spotted at Mumbai private airport for movie shoot", expectedCategory: "Entertainment" },
  { title: "Celebrity real estate: Bollywood superstar buys luxury sea-facing duplex in Bandra", expectedCategory: "Entertainment" },
  { title: "Commercial real estate investments surge 25 percent in Q3 amid robust corporate demand", expectedCategory: "Economy" },
  { title: "Director clarifies rumors about character death in climax of pan-India action movie", expectedCategory: "Entertainment" },

  // 2. Health & Medical (should NOT match violent crimes or movie deaths)
  { title: "AIIMS doctors perform rare robotic heart surgery on 60-year-old patient", expectedCategory: "Health" },
  { title: "New vaccine shows 90 percent efficacy against tropical dengue virus, ICMR says", expectedCategory: "Health" },
  { title: "Union Health Ministry issues alert over seasonal viral infections in southern states", expectedCategory: "Health" },

  // 3. Sports (should NOT match 'UP & Bihar' just because 'cup' has 'up' inside it!)
  { title: "India lifts T20 World Cup trophy after thrilling final over against South Africa", expectedCategory: "Sports" },
  { title: "Virat Kohli smashes 50th century as BCCI announces squad for Australia test series", expectedCategory: "Sports" },
  { title: "Asian Games: Indian badminton stars clinch historic gold medal in singles final", expectedCategory: "Sports" },
  { title: "Super League playoffs: Mumbai City FC qualify for semifinals with last-minute goal", expectedCategory: "Sports" },

  // 4. Politics
  { title: "Prime Minister Modi addresses Lok Sabha as Parliament passes landmark legislation", expectedCategory: "Politics" },
  { title: "BJP and Congress clash ahead of assembly election voting in Maharashtra", expectedCategory: "Politics" },
  { title: "Chief Minister Stalin meets cabinet ministers to finalize welfare scheme rollout", expectedCategory: "Politics" },

  // 5. Courts & Law
  { title: "Supreme Court grants interim bail to opposition leader, orders ED to file response", expectedCategory: "Courts & Law" },
  { title: "High Court CJI bench delivers historic verdict on reservation policy and judicial reforms", expectedCategory: "Courts & Law" },
  { title: "Police arrest three suspects in financial fraud case following CBI raids across Delhi", expectedCategory: "Courts & Law" },

  // 6. Economy
  { title: "RBI keeps repo rate unchanged at 6.5 percent amid inflation and GDP growth projections", expectedCategory: "Economy" },
  { title: "Sensex and Nifty scale record highs as foreign institutional investors pump in capital", expectedCategory: "Economy" },
  { title: "Finance Minister Nirmala Sitharaman announces GST rate reductions on essential items", expectedCategory: "Economy" },

  // 7. Technology (should NOT falsely match 'tech' inside unrelated words)
  { title: "ISRO prepares for next lunar mission with newly developed cryogenic engine test", expectedCategory: "Technology" },
  { title: "Google and Apple announce generative AI integration for next-generation smartphones", expectedCategory: "Technology" },
  { title: "Semiconductor chip manufacturing plant approved by Union Cabinet under Digital India", expectedCategory: "Technology" },

  // 8. Foreign / International Business & Markets
  { title: "Wall Street slips as US Federal Reserve signals cautious approach on interest rate cuts", expectedCategory: "Economy" },
  { title: "European consumer confidence declines as retail spending slows in Germany and France", expectedCategory: "Economy" },
  { title: "Oil prices surge on Middle East geopolitical tensions and supply disruptions", expectedCategory: "Economy" },

  // 9. Environment
  { title: "Yamuna river water level breaches danger mark following heavy monsoon rains in Delhi", expectedCategory: "Environment" },
  { title: "Severe air pollution recorded in national capital as stubble burning increases in Punjab", expectedCategory: "Environment" },

  // 10. Fact-Check
  { title: "Viral video claiming EVM machines were altered in recent elections is false and debunked", expectedCategory: "Fact-Check", sourceName: "Alt News" },
];

function runTest() {
  console.log("Running Topic Classification regression tests...");
  let passed = 0;
  for (const item of EVAL_HEADLINES) {
    const { topic } = getCategoryAndRegion(item.title, undefined, undefined, item.sourceName);
    if (topic === item.expectedCategory) {
      passed++;
    } else {
      console.error(`❌ Failed: "${item.title}" -> Got: "${topic}", Expected: "${item.expectedCategory}"`);
    }
  }
  console.log(`Summary: ${passed}/${EVAL_HEADLINES.length} passed.`);
  if (passed !== EVAL_HEADLINES.length) {
    process.exit(1);
  }
}

runTest();
