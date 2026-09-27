export const TOPIC_SECTIONS = [
  'Politics',
  'Courts & Law',
  'Economy',
  'Environment',
  'Technology',
  'Sports',
  'Health',
  'Entertainment',
  'Fact-Check',
  'Discourse & Civic',
  'UP & Bihar',
  'Maharashtra',
  'South India',
];

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'Fact-Check': [
    'fact check', 'fact-check', 'claim', 'fake news', 'viral video', 'misleading',
    'debunked', 'दावा', 'फैक्ट चेक', 'अफवाह', 'सत्यता', 'पड़ताल'
  ],
  Sports: [
    'cricket', 'ipl', 'bcci', 'test series', 'test match', 'odi', 't20', 'wicket', 'century',
    'world cup', 'football', 'fifa', 'hockey', 'olympics', 'medal', 'asian games', 'badminton',
    'singles final', 'playoffs', 'championship', 'trophy', 'semifinals', 'tournament',
    'विराट', 'रोहित', 'क्रिकेट', 'सामना', 'खेळ'
  ],
  Entertainment: [
    'movie', 'film', 'cinema', 'actor', 'actress', 'bollywood', 'hollywood', 'tollywood',
    'box office', 'trailer', 'teaser', 'casting', 'director', 'celebrity', 'ott', 'netflix',
    'prime video', 'song', 'album', 'singer', 'starring', 'soundtrack', 'cinematography',
    'दंगल', 'सिनेमा', 'फिल्म', 'अभिनेता', 'अभिनेत्री', 'ट्रेलर', 'गाना'
  ],
  'Courts & Law': [
    'court', 'judge', 'verdict', 'fir', 'police', 'cbi', 'ed',
    'arrested', 'arrest', 'bail', 'supreme court', 'high court', 'sc hearing', 'cji',
    'interim bail', 'custody', 'petition', 'judiciary', 'prosecution', 'trial',
    'न्यायालय', 'कोर्ट', 'न्यायाधीश', 'अटक', 'जामीन', 'सुप्रीम कोर्ट', 'हाईकोर्ट',
    'हायकोर्ट', 'सर्वोच्च', 'तलवार', 'अपात्र', 'निकाल', 'कोടതി', 'ശിക്ഷ',
    'తీర్పు', 'కోర్టు', 'நீதிமன்றம்', 'કોર્ટ'
  ],
  Health: [
    'hospital', 'disease', 'doctor', 'health', 'patient', 'virus', 'vaccine', 'medical', 'medicine',
    'surgery', 'cancer', 'infection', 'epidemic', 'clinic', 'dengue', 'malaria', 'cardiac', 'aiims',
    'icmr', 'mental health', 'treatment',
    'अस्पताल', 'डॉक्टर', 'रुग्णालय', 'आरोग्य', 'आशുപത്രി', 'వైద్యులు', 'ఆసుపత్రి'
  ],
  Technology: [
    'technology', 'tech', 'ai', 'artificial intelligence', 'isro', 'space',
    'satellite', 'cyber', 'software', 'chip', 'semiconductor', 'gadgets',
    'smartphone', 'google', 'apple', 'microsoft', 'lunar mission', 'cryogenic',
    'चंद्रयान', 'इसरो', 'तकनीक'
  ],
  Economy: [
    'economy', 'gdp', 'rbi', 'inflation', 'bank', 'banking', 'market', 'sensex', 'nifty',
    'tax', 'gst', 'rupee', 'budget', 'growth', 'finance', 'stocks', 'trade',
    'wall street', 'federal reserve', 'interest rate', 'repo rate', 'consumer confidence',
    'retail spending', 'oil prices', 'real estate', 'property duplex', 'duplex', 'shares',
    'अर्थव्यवस्था', 'शेयर बाजार', 'बजट', 'आर्थिक', 'बँक', 'महागाई', 'రిజర్వ్ బ్యాంక్'
  ],
  Environment: [
    'flood', 'drought', 'rain', 'monsoon', 'climate', 'pollution', 'river', 'forest', 'water level',
    'air quality', 'aqi', 'stubble burning', 'smog', 'cyclone',
    'बाढ़', 'सूखा', 'पाऊस', 'दुष्काळ', 'टंचाई', 'पूर', 'उपशा', 'विहीर', 'पाणी', 'जल', 'पर्यावरण',
    'വായുമലിനീകരണം', 'മഴ', 'వర్షం'
  ],
  Politics: [
    // English
    'election', 'elections', 'bjp', 'congress', 'modi', 'rahul gandhi',
    'parliament', 'minister', 'party', 'vote', 'voting', 'cabinet', 'lok sabha', 'rajya sabha',
    'mla', 'mp', 'assembly poll', 'chief minister', 'prime minister',
    // Hindi
    'चुनाव', 'सरकार', 'नेता', 'विधानसभा', 'राजनीति', 'मंत्री', 'संसद', 'भाजपा', 'कांग्रेस', 'पीएम मोदी',
    // Marathi  
    'निवडणूक', 'सरकार', 'आमदार', 'खासदार', 'मुख्यमंत्री', 'महायुती', 'महाविकास', 'पवार',
    // Malayalam
    'സർക്കാർ', 'തിരഞ്ഞെടുപ്പ്', 'മന്ത്രി',
    // Telugu
    'ఎన్నికలు', 'రాజకీయాలు', 'ప్రభుత్వం', 'మంత్రి',
    // Tamil
    'தேர்தல்', 'அரசியல்', 'அமைச்சர்', 'முதல்வர்',
    // Gujarati
    'ચૂંટણી', 'સરકાર', 'રાજકારણ', 'મંત્રી',
    // Common names/parties
    'shinde', 'fadnavis', 'thackeray', 
    'mva', 'nda', 'aap', 'dmk', 'aiadmk',
    'jarange', 'जरांगे', 'काँग्रेस'
  ],
  Maharashtra: [
    'maharashtra', 'mumbai', 'pune', 'nagpur',
    'महाराष्ट्र', 'मुंबई', 'पुणे', 'नागपूर',
    'मराठा', 'maratha', 'obc', 'lokmat',
    'जरांगे', 'ठाकरे', 'शिंदे', 'फडणवीस',
    'विदर्भ', 'कोकण', 'मराठवाडा'
  ],
  'South India': [
    'tamil nadu', 'kerala', 'karnataka',
    'andhra', 'telangana', 'chennai',
    'bangalore', 'bengaluru', 'hyderabad', 'dmk',
    'stalin', 'mathrubhumi', 'onmanorama',
    'കേരള', 'മലയാള', 'ఆంధ్రప్రదేశ్', 'తెలంగాణ'
  ],
  'UP & Bihar': [
    'uttar pradesh', 'bihar', 'lucknow', 'patna', 'varanasi', 'prayagraj', 'kanpur', 'बिहार', 'उत्तर प्रदेश', 'योगी'
  ],
};

// Isolated list of short or sensitive English keywords requiring strict word boundary match
const BOUNDARY_KEYWORDS = new Set([
  'up', 'ed', 'sc', 'ai', 'rbi', 'gdp', 'bjp', 'aap', 'fir', 'who', 'gst', 't20', 'odi', 'cbi', 'mla', 'mp', 'tech', 'chip', 'tax', 'bank'
]);

function matchesKeyword(text: string, kw: string): boolean {
  const kwLower = kw.toLowerCase().trim();
  // If keyword contains non-ASCII characters (e.g. Devanagari, Telugu, Tamil), use substring check
  if (/[^\x00-\x7F]/.test(kwLower)) {
    return text.includes(kwLower);
  }

  // If keyword is in boundary list or very short (<= 3 chars), strictly enforce word boundary
  if (BOUNDARY_KEYWORDS.has(kwLower) || kwLower.length <= 3) {
    const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  }

  return text.includes(kwLower);
}

export function getRegionFromHub(hub: { title?: string }, sourceRegion?: string): string {
  if (sourceRegion && sourceRegion !== 'national') {
    const regionMap: Record<string, string> = {
      maharashtra: 'Maharashtra',
      kerala: 'Kerala',
      'tamil-nadu': 'Tamil Nadu',
      karnataka: 'Karnataka',
      'west-bengal': 'West Bengal',
      gujarat: 'Gujarat',
      punjab: 'Punjab',
      bihar: 'Bihar',
      delhi: 'New Delhi',
      'uttar-pradesh': 'Uttar Pradesh',
      international: 'International',
    };
    if (regionMap[sourceRegion]) return regionMap[sourceRegion];
  }

  // Fallback: keyword check on title
  const title = (hub.title || '').toLowerCase();
  if (
    title.includes('maharashtr') ||
    title.includes('mumbai') ||
    title.includes('pune') ||
    title.includes('नागपूर') ||
    title.includes('मुंबई') ||
    title.includes('महाराष्ट्र') ||
    title.includes('ठाकरे') ||
    title.includes('शिंदे') ||
    title.includes('जरांगे')
  ) {
    return 'Maharashtra';
  }
  if (
    title.includes('kerala') ||
    title.includes('malayal') ||
    title.includes('കേരള')
  ) {
    return 'Kerala';
  }
  if (
    title.includes('tamil') ||
    title.includes('chennai') ||
    title.includes('stalin')
  ) {
    return 'Tamil Nadu';
  }
  if (
    title.includes('karnataka') ||
    title.includes('bengaluru') ||
    title.includes('bangalore')
  ) {
    return 'Karnataka';
  }
  if (
    title.includes('bihar') ||
    title.includes('बिहार') ||
    title.includes('patna')
  ) {
    return 'Bihar';
  }
  if (
    matchesKeyword(title, 'up') ||
    title.includes('uttar pradesh') ||
    title.includes('lucknow') ||
    title.includes('prayagraj') ||
    title.includes('varanasi')
  ) {
    return 'Uttar Pradesh';
  }
  if (
    title.includes('delhi') ||
    title.includes('parliament') ||
    title.includes('supreme court') ||
    title.includes('सर्वोच्च')
  ) {
    return 'New Delhi';
  }

  // International detection
  if (
    title.includes('wall street') ||
    title.includes('us federal reserve') ||
    title.includes('united states') ||
    title.includes('white house') ||
    title.includes('middle east') ||
    title.includes('ukraine') ||
    title.includes('gaza')
  ) {
    return 'International';
  }

  return 'India';
}

export function getCategoryAndRegion(
  title: string,
  sourceRegion?: string,
  sourceLane?: string,
  sourceName?: string
): { topic: string; region: string } {
  const lower = title.toLowerCase();
  const sName = (sourceName || '').toLowerCase();

  // 1. Fact Checkers priority
  if (
    sName.includes('alt news') ||
    sName.includes('boom live') ||
    sName.includes('factly') ||
    sName.includes('newschecker')
  ) {
    return { topic: 'Fact-Check', region: getRegionFromHub({ title }, sourceRegion) };
  }

  // 2. Keyword match in strict priority order
  let topic = 'General';
  for (const [top, kws] of Object.entries(TOPIC_KEYWORDS)) {
    if (kws.some((kw) => matchesKeyword(lower, kw))) {
      topic = top;
      break;
    }
  }

  // 3. Discourse / Civic fallback
  if (topic === 'General' && sourceLane === 'discourse') {
    topic = 'Discourse & Civic';
  }

  const region = getRegionFromHub({ title }, sourceRegion);
  return { topic, region };
}
