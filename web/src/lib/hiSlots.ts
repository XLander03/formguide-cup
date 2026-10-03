/**
 * Hindi and Hinglish cues for aof_kyc_demo_v1.
 * English detectors run first; callers should keep those values.
 * Schema enum values stay English codes. Spoken names stay as spoken.
 */

export type SlotValue = string | boolean;

const PLACES: Array<{ re: RegExp; city?: string; state?: string }> = [
  { re: /नई दिल्ली|नयी दिल्ली/, city: 'New Delhi', state: 'Delhi' },
  { re: /बेंगलुरु|बंगलुरु|बैंगलोर|बेंगलूरु/, city: 'Bengaluru', state: 'Karnataka' },
  { re: /मुंबई|मुम्बई/, city: 'Mumbai', state: 'Maharashtra' },
  { re: /चेन्नई|चेन्नै/, city: 'Chennai', state: 'Tamil Nadu' },
  { re: /हैदराबाद/, city: 'Hyderabad', state: 'Telangana' },
  { re: /पुणे/, city: 'Pune', state: 'Maharashtra' },
  { re: /कोलकाता/, city: 'Kolkata', state: 'West Bengal' },
  { re: /अहमदाबाद/, city: 'Ahmedabad', state: 'Gujarat' },
  { re: /जयपुर/, city: 'Jaipur', state: 'Rajasthan' },
  { re: /लखनऊ/, city: 'Lucknow', state: 'Uttar Pradesh' },
  { re: /दिल्ली/, city: 'Delhi', state: 'Delhi' },
  { re: /कर्नाटक/, state: 'Karnataka' },
  { re: /महाराष्ट्र/, state: 'Maharashtra' },
  { re: /तमिल\s?नाडु/, state: 'Tamil Nadu' },
  { re: /तेलंगाना/, state: 'Telangana' },
  { re: /पश्चिम बंगाल/, state: 'West Bengal' },
  { re: /गुजरात/, state: 'Gujarat' },
  { re: /राजस्थान/, state: 'Rajasthan' },
  { re: /उत्तर प्रदेश/, state: 'Uttar Pradesh' },
  { re: /मध्य प्रदेश/, state: 'Madhya Pradesh' },
  { re: /केरल/, state: 'Kerala' },
  { re: /हरियाणा/, state: 'Haryana' },
  { re: /पंजाब/, state: 'Punjab' },
  { re: /बिहार/, state: 'Bihar' },
  { re: /ओडिशा|उड़ीसा/, state: 'Odisha' },
  { re: /असम/, state: 'Assam' },
  { re: /गोवा/, state: 'Goa' },
];

function takeName(text: string, cues: RegExp): string | null {
  const m = text.match(cues);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

function addressChunk(text: string): string | null {
  const labeled = text.match(
    /(?:मेरा पता|पता है|पता:|mera pata(?:\s+hai)?|pata hai)\s+(.+?)(?:[।.]|$)/i,
  );
  if (labeled) return labeled[1].trim();
  const live = text.match(
    /(?:मैं|main)\s+(.+?)\s+(?:में|mein)\s+रह(?:ती|ता|ते)\s+(?:हूँ|हूं|हैं|hoon|hun|hain)/i,
  );
  if (live) return live[1].trim();
  return null;
}

function stripPlaces(line: string): string {
  let out = line;
  for (const p of PLACES) out = out.replace(p.re, ' ');
  out = out.replace(/\b\d{6}\b/g, ' ');
  out = out.replace(/\b(?:bengaluru|bangalore|mumbai|karnataka|maharashtra|delhi)\b/gi, ' ');
  return out.replace(/[,\s]+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

export function extractHindiSlots(text: string): Record<string, SlotValue> {
  const out: Record<string, SlotValue> = {};
  const t = text.toLowerCase();

  if (/री[-\s]?के(?:वाई|वाइ)सी|रीकेवाईसी/.test(text)) {
    out.journey_mode = 'rekyc';
  } else if (/केवाईसी|केवाइसी/.test(text) || /केवाईसी\s*अपडेट/.test(text)) {
    out.journey_mode = 'kyc_update';
  } else if (
    /खाता\s*खोल|नया खाता|बचत खाता|सेविंग्स खाता/.test(text) ||
    /khata\s*khol|naya\s+khata|bachat\s+khata|savings\s+khata/.test(t)
  ) {
    out.journey_mode = 'account_opening';
  }

  const name = takeName(
    text,
    /(?:मेरा पूरा नाम|मेरा नाम|mera poora naam|mera naam|mera name)\s+(.+?)(?:\s+है|\s+हैं|\s+hai\b|\s+hain\b|[।,.]|$)/i,
  );
  if (name) out.applicant_full_name = name;

  const father = takeName(
    text,
    /(?:पिता का नाम|पिताजी का नाम|पति का नाम|pita ka naam|pati ka naam)\s+(.+?)(?:\s+है|\s+hai\b|[।,.]|$)/i,
  );
  if (father) out.father_or_spouse_name = father;

  if (/महिला|स्त्री/.test(text) || /\bmahila\b|\bstree\b/.test(t)) out.gender = 'female';
  else if (/पुरुष/.test(text) || /\bpurush\b/.test(t)) out.gender = 'male';

  if (/भारतीय/.test(text) || /\bbharatiya\b/.test(t)) out.nationality = 'Indian';
  if (/निवासी/.test(text) || /\bnivasi\b/.test(t)) out.residential_status = 'resident_individual';

  if (/पैन\s*नह|बिना पैन/.test(text) || /pan\s+nahi|pan\s+nahin/.test(t)) {
    out.pan_available = false;
    out.form60_declared = true;
  } else if (/मेरे पास पैन|पैन है|mere paas pan|paas pan hai/.test(text) || /mere paas pan|paas pan hai/.test(t)) {
    out.pan_available = true;
  }

  if (/सैलरी/.test(text) && /खाता|अकाउंट|account/.test(text)) out.account_product_intent = 'salary_savings';
  else if (/बीएसबीडीए|बेसिक सेविंग्स/.test(text)) out.account_product_intent = 'bsbda';
  else if (/करंट खाता/.test(text)) out.account_product_intent = 'individual_current';
  else if (/बचत खाता|सेविंग्स खाता|नियमित बचत|रेगुलर सेविंग्स/.test(text))
    out.account_product_intent = 'regular_savings';

  for (const p of PLACES) {
    if (!p.re.test(text)) continue;
    if (p.city && out.addr_current_city === undefined) out.addr_current_city = p.city;
    if (p.state && out.addr_current_state === undefined) out.addr_current_state = p.state;
  }

  const chunk = addressChunk(text);
  if (chunk) {
    const pin = chunk.match(/\b(\d{6})\b/);
    if (pin) out.addr_current_pin = pin[1];
    for (const p of PLACES) {
      if (!p.re.test(chunk)) continue;
      if (p.city) out.addr_current_city = p.city;
      if (p.state) out.addr_current_state = p.state;
    }
    const line = stripPlaces(chunk);
    if (line.length >= 3) out.addr_current_line1 = line;
  }

  if (/पासपोर्ट/.test(text)) out.ovd_poi_type = 'passport';
  else if (/ड्राइविंग\s*ला[इी]से(?:न्स|ंस)|चालक\s*ला[इी]से(?:न्स|ंस)/.test(text))
    out.ovd_poi_type = 'driving_licence';
  else if (/आधार/.test(text)) {
    out.ovd_poi_type = 'proof_of_possession_of_aadhaar';
    out.aadhaar_voluntary_consent = true;
  } else if (/वोटर|मतदाता/.test(text)) out.ovd_poi_type = 'voter_id';
  else if (/नरेगा|मनरेगा/.test(text)) out.ovd_poi_type = 'nrega_job_card';
  else if (/एनपीआर/.test(text)) out.ovd_poi_type = 'npr_letter';

  if (/स्थायी पता (?:भी )?वही|स्थायी पता वर्तमान|स्थायी और वर्तमान एक|sthayi pata (?:bhi )?wahi/.test(text))
    out.addr_permanent_same_as_current = true;
  else if (/स्थायी पता अलग|sthayi pata alag/.test(text)) out.addr_permanent_same_as_current = false;

  if (/पते का प्रमाण वही|पता प्रमाण वही|वही दस्तावेज़ पता/.test(text))
    out.ovd_poa_same_as_poi = true;

  if (/फोटो की सहमति|फोटोग्राफ की सहमति|photo ki sahmati/.test(text)) out.photo_consent = true;
  if (/मूल दस्तावे|मूल दिखा|mool dastavez|mool dastaavez/.test(text)) out.ovd_originals_ack = true;

  if (/नया ग्राहक|पहली बार|naya grahak/.test(text)) out.existing_bank_customer = false;
  else if (/मौजूदा ग्राहक|पहले से ग्राहक|pehle se grahak/.test(text))
    out.existing_bank_customer = true;

  if (/नौकरी|कर्मचारी|सैलरी पाने/.test(text)) out.occupation_bucket = 'salaried';
  else if (/खुद का काम|व्यवसाय/.test(text)) out.occupation_bucket = 'self_employed';
  else if (/छात्र/.test(text)) out.occupation_bucket = 'student';
  else if (/गृहिणी/.test(text)) out.occupation_bucket = 'homemaker';
  else if (/सेवानिवृत्त/.test(text)) out.occupation_bucket = 'retired';

  if (/राजनीतिक रूप से उजागर नहीं|पीईपी नहीं|pep\s*नहीं/i.test(text) || /\bpep\s+nahi\b/.test(t))
    out.pep_declaration = false;
  else if (/राजनीतिक रूप से उजागर हूँ|राजनीतिक रूप से उजागर हूं|मैं पीईपी/.test(text))
    out.pep_declaration = true;

  if (/केवल भारत|सिर्फ भारत|कर के लिए केवल भारत/.test(text)) out.tax_resident_india_only = true;

  if (/एचडीएफसी/.test(text)) out.bank_hint = 'HDFC';
  else if (/एसबीआई/.test(text)) out.bank_hint = 'SBI';
  else if (/आईसीआईसीआई|आईसीआईसीआई/.test(text)) out.bank_hint = 'ICICI';

  if (/सही है|ठीक है|पुष्टि कर/.test(text) || /\bsahi hai\b/.test(t)) out.readback_confirmed = true;
  if (/केवल ड्राफ्ट|सिर्फ ड्राफ्ट|ड्राफ्ट ही/.test(text) || /\bkeval draft\b|\bsirf draft\b/.test(t))
    out.draft_only_ack = true;
  if (
    /लाइव जमा नहीं|बैंक को नहीं भेज|बैंक में जमा नहीं|बैंक को मत भेज/.test(text) ||
    /live jama nahi|bank ko mat bhej/.test(t)
  ) {
    out.no_live_submit_ack = true;
  }

  return out;
}

export function hindiWantsLiveSubmit(text: string): boolean {
  if (/जमा नहीं|नहीं भेज|मत भेज|nahi jama|mat bhej|nahin bhej/.test(text.toLowerCase())) return false;
  return /बैंक\s*(?:में|को)\s*(?:जमा|भेज)|लाइव\s*(?:जमा|सबमिट)|बैंक में सबमिट/.test(text);
}

export function hindiExcluded(text: string): boolean {
  return /नामांकन|नॉमिनी|नोमिनी|नामिनी|ऋण/.test(text) || /(?:^|[\s।,])लोन(?:[\s।,]|$)/.test(text);
}
