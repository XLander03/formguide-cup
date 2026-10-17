/**
 * Spoken commands for the Speak read-back, Review and Confirm pages, shared by the
 * speak function (which answers a matched command without a field call) and the web tests.
 *
 * Matching is deliberately strict: the whole utterance must be the command, so
 * "No, my PIN is 560037" is a correction for the field model, not a bare "no".
 */
export const VOICE_COMMANDS = [
  'yes',
  'no',
  'read_again',
  'go_back',
  'continue',
  'save_draft',
  'download',
  'next_form',
] as const;

export type VoiceCommand = (typeof VOICE_COMMANDS)[number];

/** Where a voice turn was spoken. Commands are only matched outside `fill`. */
export const VOICE_CONTEXTS = ['fill', 'readback', 'review', 'confirm'] as const;

export type VoiceContext = (typeof VOICE_CONTEXTS)[number];

export function isVoiceContext(value: unknown): value is VoiceContext {
  return typeof value === 'string' && (VOICE_CONTEXTS as readonly string[]).includes(value);
}

export function isVoiceCommand(value: unknown): value is VoiceCommand {
  return typeof value === 'string' && (VOICE_COMMANDS as readonly string[]).includes(value);
}

const FILLER_START =
  /^(?:(?:ok|okay|so|now|please|kindly|just|can you|could you|will you|hey formguide|formguide|कृपया|प्लीज़?|जी|अब|ठीक है)\s+)+/;
const FILLER_END = /(?:\s+(?:please|now|for me|then|thanks|thank you|कृपया|प्लीज़?|जी|अभी))+$/;

/** Lowercase, drop punctuation (Latin and the Devanagari danda), squeeze spaces, strip polite filler. */
export function normalizeUtterance(text: string): string {
  let out = text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:"“”()।॥\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Run twice so "okay please read it again now please" loses both ends fully.
  for (let i = 0; i < 2; i++) out = out.replace(FILLER_START, '').replace(FILLER_END, '').trim();
  return out;
}

// Speech-to-text often hears an Indian-English "form" as "forum" or "farm".
const FORM = '(?:form|forms|forum|farm)';

// Order matters: "next form" before "next", "read it back" before "back".
const PATTERNS: ReadonlyArray<readonly [VoiceCommand, RegExp]> = [
  [
    'next_form',
    new RegExp(
      `^(?:(?:start|open|go to|begin|do|fill) )?(?:the |my )?next (?:${FORM}|one)$|` +
        '^(?:अगला|अगले) (?:फ़ॉर्म|फॉर्म|form)(?: (?:शुरू करो|शुरू करें|खोलो|भरो))?$|^agla form(?: shuru karo)?$',
    ),
  ],
  [
    'download',
    new RegExp(
      `^download(?: (?:my|the|this))?(?: (?:${FORM}|draft|pdf|file|copy))?$|` +
        '^(?:मेरा |मेरी )?(?:फ़ॉर्म |फॉर्म |ड्राफ्ट |पीडीएफ )?डाउनलोड(?: (?:करो|करें|कर दो|कर दीजिए))?$|^form download karo$',
    ),
  ],
  [
    'save_draft',
    new RegExp(
      `^save(?: (?:my|the|this))?(?: (?:draft|${FORM}))?(?: only)?$|` +
        '^(?:ड्राफ्ट |फ़ॉर्म |फॉर्म )?(?:सेव|सहेजो|सहेजें)(?: (?:करो|करें|कर दो|कर दीजिए))?$|^draft save karo$',
    ),
  ],
  [
    'read_again',
    /^(?:read|say|tell me)(?: (?:it|that|this|everything|my details|the details))?(?: (?:back|again|once more|one more time))+$|^repeat(?: (?:it|that|this|again))?$|^(?:फिर से|दोबारा|एक बार और) (?:पढ़ो|पढ़ें|पढ़िए|सुनाओ|सुनाएं|सुनाइए|बोलो|बताओ)$|^(?:phir se|dobara) (?:padho|sunao|bolo)$/,
  ],
  [
    'go_back',
    /^(?:go )?back(?: (?:to (?:the )?(?:previous|last) (?:page|step)|one step))?$|^previous(?: (?:page|step))?$|^(?:पीछे|वापस)(?: (?:जाओ|जाएं|जाइए|चलो|चलें))?$|^(?:peeche|wapas) (?:jao|chalo)$/,
  ],
  [
    'continue',
    /^(?:continue|go ahead|proceed|next|next step|move on|carry on|go on|go next)$|^(?:आगे|आगे बढ़ो|आगे बढ़ें|आगे बढ़िए|आगे चलो|आगे चलें)$|^aage (?:badho|chalo)$/,
  ],
  [
    'yes',
    /^(?:yes|yeah|yep|yup|yes yes|sure|correct|right|confirm|confirmed|i confirm|agreed|i agree|all good|all correct|looks good|looks right|looks correct|that'?s (?:right|correct|fine)|it'?s (?:right|correct)|everything is (?:right|correct)|all of it is correct)$|^yes(?: (?:it is|it's|that is|that's|all|everything is|i confirm|please))? (?:right|correct|fine|good|confirm|confirmed)$|^(?:हाँ|हां|हा|जी हाँ|जी हां|सही है|सब सही है|बिल्कुल|बिलकुल|हाँ जी|हां जी)(?: (?:सही है|सब सही है|ठीक है|कन्फर्म))?$|^(?:haan|haa|han|ji haan|sahi hai|haan sahi hai)$/,
  ],
  [
    'no',
    /^(?:no|nope|nah|no no|not right|not correct|wrong|incorrect|that'?s (?:wrong|not right|incorrect)|it'?s (?:wrong|not right)|something is wrong|no (?:it'?s|that'?s|it is) (?:wrong|not right|incorrect))$|^(?:नहीं|नही|ना|गलत है|ग़लत है|गलत|सही नहीं है|नहीं सही नहीं है|कुछ गलत है)$|^(?:nahi|nahin|galat hai)$/,
  ],
];

/** The command this whole utterance is, or null when it carries anything else (a value, a question). */
export function matchVoiceCommand(text: string): VoiceCommand | null {
  const said = normalizeUtterance(text);
  if (!said || said.length > 60 || /\d/.test(said)) return null;
  for (const [command, pattern] of PATTERNS) {
    if (pattern.test(said)) return command;
  }
  return null;
}
