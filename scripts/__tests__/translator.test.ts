import { detectScriptLanguage, getEnglishGloss } from '../../lib/translator';

async function testTranslator() {
  console.log('Testing Indic script detection...');
  const tests = [
    { text: 'Pushpa 2 box office collection crosses 1000 crore', expectedLang: 'en', isNonEnglish: false },
    { text: 'मुंबईत मुसळधार पाऊस, सखल भागात पाणी साचले', expectedLang: 'mr', isNonEnglish: true },
    { text: 'दिल्ली में भारी प्रदूषण, ग्रैप-4 के कड़े नियम लागू', expectedLang: 'hi', isNonEnglish: true },
    { text: 'ఆంధ్రప్రదేశ్‌లో భారీ వర్షాలు.. పలు జిల్లాలకు ఎల్లో అలర్ట్', expectedLang: 'te', isNonEnglish: true },
    { text: 'சென்னையில் மெட்ரோ ரயில் சேவை விரிவாக்கம்', expectedLang: 'ta', isNonEnglish: true },
    { text: 'കേരളത്തിൽ ഇന്നും അതിശക്തമായ മഴ തുടരും', expectedLang: 'ml', isNonEnglish: true },
    { text: 'ಬೆಂಗಳೂರಿನಲ್ಲಿ ಟ್ರಾಫಿಕ್ ಸಮಸ್ಯೆ ನಿವಾರಣೆಗೆ ಹೊಸ ಯೋಜನೆ', expectedLang: 'kn', isNonEnglish: true },
    { text: 'ગુજરાતમાં નવી ઔદ્યોગિક નીતિની જાહેરાત', expectedLang: 'gu', isNonEnglish: true },
    { text: 'কলকাতায় দুর্গাপূজার প্রস্তুতি জোরকদমে', expectedLang: 'bn', isNonEnglish: true },
  ];

  let passed = 0;
  for (const t of tests) {
    const res = detectScriptLanguage(t.text);
    if (res.isNonEnglish === t.isNonEnglish && (t.expectedLang === 'en' || res.langCode === t.expectedLang)) {
      passed++;
      console.log(`✅ [${res.langCode.toUpperCase()}] "${t.text.slice(0, 30)}..." detected correctly.`);
    } else {
      console.error(`❌ Failed: "${t.text}" -> Got ${res.langCode} (${res.isNonEnglish}), Expected ${t.expectedLang}`);
    }
  }

  console.log(`Script detection: ${passed}/${tests.length} passed.`);

  console.log('\nTesting getEnglishGloss for English text (instant pass-through)...');
  const enRes = await getEnglishGloss('Prime Minister announces new solar energy initiative');
  if (enRes.englishGloss === 'Prime Minister announces new solar energy initiative' && !enRes.isTranslated) {
    console.log('✅ English headline passed through without calling LLM.');
  } else {
    console.error('❌ English headline was modified or incorrectly marked as translated:', enRes);
  }
}

testTranslator();
