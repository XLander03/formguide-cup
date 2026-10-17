import type { ReadbackLang } from './utteranceLang';
import { REGIONAL_VOICE_LINES } from './voiceLinesI18n';

/**
 * What FormGuide says aloud in hands-free and voice-command turns: English and Hindi here,
 * the ten regional languages in voiceLinesI18n.ts. A line missing there is said in English.
 */
export const LINES = {
  startName: ['Hi! Start with your full name.', 'नमस्ते! अपना पूरा नाम बताइए।'],
  askConfirm: [
    'Is everything correct? Say yes to confirm. This saves a draft only, and nothing is sent to a bank. Or say what to change.',
    'क्या सब सही है? पुष्टि के लिए हाँ कहिए। यह सिर्फ़ ड्राफ्ट सेव करता है, बैंक को कुछ नहीं भेजा जाता। या बताइए क्या बदलना है।',
  ],
  whatToChange: ['What would you like to change?', 'क्या बदलना है? बताइए।'],
  sayCorrectValue: ['Please say the correct value.', 'कृपया सही जानकारी बताइए।'],
  thanks: ['Thank you.', 'धन्यवाद।'],
  confirmedGoConfirm: [
    'Confirmed. Opening the confirm page.',
    'पुष्टि हो गई। अब कन्फ़र्म पेज खोल रहे हैं।',
  ],
  confirmFirst: ['First confirm the read-back. Say yes if everything is right.', 'पहले रीड-बैक की पुष्टि करें। सब सही हो तो हाँ कहिए।'],
  firstPage: ['You are on the first step. Say what you would like to change.', 'आप पहले चरण पर हैं। बताइए क्या बदलना है।'],
  goingReview: ['Opening the review page.', 'रिव्यू पेज खोल रहे हैं।'],
  checkField: [
    'Please check {label}. I heard {value}. Say yes if that is right, or say the correct value.',
    'कृपया {label} जाँचें। मैंने सुना {value}। सही हो तो हाँ कहिए, नहीं तो सही जानकारी बताइए।',
  ],
  fixFormat: ['{label} does not look right. {issue} Please say it again.', '{label} सही नहीं लग रहा। {issue} कृपया फिर से बताइए।'],
  oldCardBlocked: [
    'Is your old card permanently blocked? Say yes or no.',
    'क्या पुराना कार्ड हमेशा के लिए ब्लॉक हो गया है? हाँ या नहीं कहिए।',
  ],
  blockOldCardFirst: [
    'Please block the old card with your bank first, then tick the box on screen.',
    'पहले बैंक से पुराना कार्ड ब्लॉक करवाइए, फिर स्क्रीन पर बॉक्स टिक कीजिए।',
  ],
  reviewPrompt: [
    'Say continue if it is right, or tell me what to change. You can also ask what a field means.',
    'सही हो तो आगे बढ़ो कहिए, या बताइए क्या बदलना है। किसी फ़ील्ड का मतलब भी पूछ सकते हैं।',
  ],
  reviewIncomplete: [
    'Some details are still missing. Say go back to finish them.',
    'कुछ जानकारी अभी बाकी है। पूरा करने के लिए वापस जाओ कहिए।',
  ],
  goingBackFill: ['Going back to fill the form.', 'फ़ॉर्म भरने के लिए वापस जा रहे हैं।'],
  goingConfirm: ['Opening the confirm page.', 'कन्फ़र्म पेज खोल रहे हैं।'],
  finishFormFirst: ['Finish and save this form first.', 'पहले यह फ़ॉर्म पूरा करके सेव कीजिए।'],
  saveOnConfirm: ['Say continue, then save the draft on the confirm page.', 'आगे बढ़ो कहिए, फिर कन्फ़र्म पेज पर ड्राफ्ट सेव कीजिए।'],
  gatesPrompt: [
    'Please confirm three things: you reviewed the details, this saves a draft only, and nothing is submitted to a bank. Say yes to confirm all three.',
    'तीन बातों की पुष्टि करें: आपने जानकारी जाँच ली है, यह सिर्फ़ ड्राफ्ट है, और बैंक को कुछ नहीं भेजा जाता। तीनों की पुष्टि के लिए हाँ कहिए।',
  ],
  gatesTicked: ['Confirmed. Say save my draft.', 'पुष्टि हो गई। अब ड्राफ्ट सेव करो कहिए।'],
  saySave: ['All three are confirmed. Say save my draft.', 'तीनों की पुष्टि हो गई है। ड्राफ्ट सेव करो कहिए।'],
  confirmGatesFirst: ['Say yes to confirm the three checks first.', 'पहले तीनों बातों की पुष्टि के लिए हाँ कहिए।'],
  saved: ['Saved. Nothing was sent to a bank.', 'सेव हो गया। बैंक को कुछ नहीं भेजा गया।'],
  savedPromptNext: [
    'Your draft is saved. Say download my form, or start the next form.',
    'ड्राफ्ट सेव हो गया। फ़ॉर्म डाउनलोड करो, या अगला फ़ॉर्म शुरू करो कहिए।',
  ],
  savedPrompt: ['Your draft is saved. Say download my form.', 'ड्राफ्ट सेव हो गया। फ़ॉर्म डाउनलोड करो कहिए।'],
  downloading: ['Your form is downloading.', 'आपका फ़ॉर्म डाउनलोड हो रहा है।'],
  downloadFailed: ['Sorry, the download did not work. Please use the button on screen.', 'माफ़ कीजिए, डाउनलोड नहीं हुआ। स्क्रीन पर बटन दबाइए।'],
  promptNextForm: ['Say start the next form when you are ready.', 'तैयार हों तो अगला फ़ॉर्म शुरू करो कहिए।'],
  startingNext: ['Starting {title}.', '{title} शुरू कर रहे हैं।'],
  noNextForm: ['There is no other form in your plan.', 'आपके प्लान में और कोई फ़ॉर्म नहीं है।'],
  allDone: ['All done. Nothing was sent to a bank.', 'सब हो गया। बैंक को कुछ नहीं भेजा गया।'],
  goingBackReview: ['Going back to review.', 'रिव्यू पर वापस जा रहे हैं।'],
  sayGoBack: ['Okay. Say go back to change something.', 'ठीक है। कुछ बदलना हो तो वापस जाओ कहिए।'],
  errBusy: ['The voice service is busy. Please say that again.', 'वॉइस सेवा अभी व्यस्त है। कृपया फिर से कहिए।'],
  errNetwork: ['I could not reach the voice service. Check your connection.', 'वॉइस सेवा से जुड़ नहीं पाए। इंटरनेट जाँचिए।'],
  errShorter: ['Sorry, I did not get that. Please say it in shorter parts.', 'माफ़ कीजिए, समझ नहीं आया। कृपया छोटे हिस्सों में बताइए।'],
  errRepeat: ['Sorry, I did not catch that. Please say it again.', 'माफ़ कीजिए, सुनाई नहीं दिया। कृपया फिर से कहिए।'],
  errRateLimited: ['Too many tries from this network. Wait a minute, then tap the mic.', 'इस नेटवर्क से बहुत कोशिशें हुईं। एक मिनट रुककर माइक दबाइए।'],
} as const;

export type VoiceLineKey = keyof typeof LINES;

/** `true` means Hindi (older call sites); otherwise the read-back language of the conversation. */
type LineLang = boolean | ReadbackLang;

export function voiceLine(key: VoiceLineKey, lang: LineLang, vars: Record<string, string> = {}): string {
  const template = lineTemplate(key, lang);
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '');
}

function lineTemplate(key: VoiceLineKey, lang: LineLang): string {
  if (lang === true || lang === 'hi' || lang === 'mixed') return LINES[key][1];
  if (lang === false || lang === 'en') return LINES[key][0];
  return REGIONAL_VOICE_LINES[lang]?.[key] ?? LINES[key][0];
}

/** The line for a failed voice turn, and whether hands-free should stop instead of asking again. */
export function voiceErrorLine(error: string, lang: LineLang): { line: string; stop: boolean } {
  if (/rate_limited|_429/.test(error)) return { line: voiceLine('errRateLimited', lang), stop: true };
  if (/_503|unavailable/.test(error)) return { line: voiceLine('errBusy', lang), stop: false };
  if (error === 'network_error') return { line: voiceLine('errNetwork', lang), stop: true };
  if (error === 'fields_bad_json') return { line: voiceLine('errShorter', lang), stop: false };
  return { line: voiceLine('errRepeat', lang), stop: false };
}
