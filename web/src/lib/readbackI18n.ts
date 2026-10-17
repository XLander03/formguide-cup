import type { ShellLanguage } from './languages';

/**
 * Read-back copy for the regional (beta) languages, so a customer who spoke Telugu
 * hears their draft confirmed in Telugu. English and Hindi keep their own copy in
 * heuristicExtract / debitReissue.
 *
 * Values themselves are not translated: names, numbers and addresses are stored in
 * Latin script and read as they are. Only the labels around them and the enum
 * choices (document, account, journey, card reason) are.
 * "Fields vary by bank." stays English in every language: the app requires it verbatim.
 * The spoken gate phrase stays English too, because that is what the confirm step matches.
 */

export type RegionalLanguage = Exclude<ShellLanguage, 'en' | 'hi'>;

interface ReadbackCopy {
  confirm: string;
  name: string;
  dob: string;
  mobileEnding: (last4: string) => string;
  poi: string;
  product: string;
  draft: string;
  noSubmit: string;
  notSet: string;
  applicant: string;
  debit: string;
  customerId: string;
  account: string;
  cardLast4: string;
  reason: string;
  newCard: string;
  yes: string;
  no: string;
  registeredAddress: string;
  followup: string;
  enums: Record<string, string>;
}

const GATE_PHRASE = '"confirmed, draft only, no live submit"';

const COPY: Record<RegionalLanguage, ReadbackCopy> = {
  bn: {
    confirm: 'অনুগ্রহ করে এই বিবরণগুলি শুনে নিশ্চিত করুন যে সব ঠিক আছে।',
    name: 'নাম',
    dob: 'জন্ম তারিখ',
    mobileEnding: (d) => `মোবাইল নম্বরের শেষ চারটি সংখ্যা ${d}`,
    poi: 'পরিচয়ের প্রমাণ',
    product: 'অ্যাকাউন্ট বা কাজ',
    draft: 'এটি শুধুমাত্র একটি খসড়া।',
    noSubmit: 'ব্যাংকে কিছুই জমা দেওয়া হবে না।',
    notSet: 'দেওয়া হয়নি',
    applicant: 'আবেদনকারী',
    debit: 'ডেবিট কার্ড পুনরায় ইস্যু',
    customerId: 'কাস্টমার আইডি',
    account: 'অ্যাকাউন্ট নম্বর',
    cardLast4: 'কার্ডের শেষ চারটি সংখ্যা',
    reason: 'কারণ',
    newCard: 'নতুন কার্ড',
    yes: 'হ্যাঁ',
    no: 'না',
    registeredAddress: 'কার্ডটি আপনার নথিভুক্ত ঠিকানায় পাঠানো হবে',
    followup: `শোনার পরে নিচের তিনটি বাক্সে টিক দিন, অথবা বলুন ${GATE_PHRASE}।`,
    enums: {
      account_opening: 'নতুন অ্যাকাউন্ট খোলা',
      kyc_update: 'কেওয়াইসি আপডেট',
      rekyc: 'রি-কেওয়াইসি',
      debit_reissue: 'ডেবিট কার্ড পুনরায় ইস্যু',
      regular_savings: 'সাধারণ সেভিংস অ্যাকাউন্ট',
      salary_savings: 'স্যালারি অ্যাকাউন্ট',
      bsbda: 'বেসিক সেভিংস অ্যাকাউন্ট',
      individual_current: 'কারেন্ট অ্যাকাউন্ট',
      unspecified_varies_by_bank: 'ব্যাংক অনুযায়ী',
      passport: 'পাসপোর্ট',
      driving_licence: 'ড্রাইভিং লাইসেন্স',
      proof_of_possession_of_aadhaar: 'আধার',
      voter_id: 'ভোটার আইডি',
      nrega_job_card: 'নরেগা জব কার্ড',
      npr_letter: 'এনপিআর চিঠি',
      lost_or_misplaced: 'হারিয়ে গেছে',
      stolen: 'চুরি হয়েছে',
      damaged: 'নষ্ট হয়ে গেছে',
      other: 'অন্য কারণ',
    },
  },
  mr: {
    confirm: 'कृपया हे तपशील ऐका आणि सर्व बरोबर आहे याची खात्री करा.',
    name: 'नाव',
    dob: 'जन्मतारीख',
    mobileEnding: (d) => `मोबाइल नंबरचे शेवटचे चार अंक ${d}`,
    poi: 'ओळखीचा पुरावा',
    product: 'खाते किंवा काम',
    draft: 'हा फक्त मसुदा आहे.',
    noSubmit: 'बँकेत काहीही जमा केले जाणार नाही.',
    notSet: 'दिलेले नाही',
    applicant: 'अर्जदार',
    debit: 'डेबिट कार्ड पुन्हा जारी करणे',
    customerId: 'ग्राहक आयडी',
    account: 'खाते क्रमांक',
    cardLast4: 'कार्डचे शेवटचे चार अंक',
    reason: 'कारण',
    newCard: 'नवीन कार्ड',
    yes: 'हो',
    no: 'नाही',
    registeredAddress: 'कार्ड तुमच्या नोंदणीकृत पत्त्यावर पाठवले जाईल',
    followup: `ऐकल्यानंतर खालील तीन चौकटींवर खूण करा, किंवा म्हणा ${GATE_PHRASE}.`,
    enums: {
      account_opening: 'नवीन खाते उघडणे',
      kyc_update: 'केवायसी अपडेट',
      rekyc: 'री-केवायसी',
      debit_reissue: 'डेबिट कार्ड पुन्हा जारी करणे',
      regular_savings: 'नियमित बचत खाते',
      salary_savings: 'पगार खाते',
      bsbda: 'मूलभूत बचत खाते',
      individual_current: 'चालू खाते',
      unspecified_varies_by_bank: 'बँकेनुसार',
      passport: 'पासपोर्ट',
      driving_licence: 'ड्रायव्हिंग लायसन्स',
      proof_of_possession_of_aadhaar: 'आधार',
      voter_id: 'मतदार ओळखपत्र',
      nrega_job_card: 'नरेगा जॉब कार्ड',
      npr_letter: 'एनपीआर पत्र',
      lost_or_misplaced: 'हरवले',
      stolen: 'चोरीला गेले',
      damaged: 'खराब झाले',
      other: 'इतर कारण',
    },
  },
  te: {
    confirm: 'దయచేసి ఈ వివరాలు విని, అన్నీ సరిగ్గా ఉన్నాయో లేదో నిర్ధారించండి.',
    name: 'పేరు',
    dob: 'పుట్టిన తేదీ',
    mobileEnding: (d) => `మొబైల్ నంబర్ చివరి నాలుగు అంకెలు ${d}`,
    poi: 'గుర్తింపు రుజువు',
    product: 'ఖాతా లేదా పని',
    draft: 'ఇది కేవలం ముసాయిదా మాత్రమే.',
    noSubmit: 'బ్యాంకుకు ఏమీ సమర్పించబడదు.',
    notSet: 'ఇవ్వలేదు',
    applicant: 'దరఖాస్తుదారు',
    debit: 'డెబిట్ కార్డు తిరిగి జారీ',
    customerId: 'కస్టమర్ ఐడి',
    account: 'ఖాతా నంబర్',
    cardLast4: 'కార్డు చివరి నాలుగు అంకెలు',
    reason: 'కారణం',
    newCard: 'కొత్త కార్డు',
    yes: 'అవును',
    no: 'వద్దు',
    registeredAddress: 'కార్డు మీ నమోదిత చిరునామాకు పంపబడుతుంది',
    followup: `విన్న తర్వాత కింద ఉన్న మూడు పెట్టెలను టిక్ చేయండి, లేదా ${GATE_PHRASE} అని చెప్పండి.`,
    enums: {
      account_opening: 'కొత్త ఖాతా తెరవడం',
      kyc_update: 'కేవైసీ అప్‌డేట్',
      rekyc: 'రీ-కేవైసీ',
      debit_reissue: 'డెబిట్ కార్డు తిరిగి జారీ',
      regular_savings: 'సాధారణ పొదుపు ఖాతా',
      salary_savings: 'జీతం ఖాతా',
      bsbda: 'ప్రాథమిక పొదుపు ఖాతా',
      individual_current: 'కరెంట్ ఖాతా',
      unspecified_varies_by_bank: 'బ్యాంకును బట్టి',
      passport: 'పాస్‌పోర్ట్',
      driving_licence: 'డ్రైవింగ్ లైసెన్స్',
      proof_of_possession_of_aadhaar: 'ఆధార్',
      voter_id: 'ఓటర్ ఐడి',
      nrega_job_card: 'నరేగా జాబ్ కార్డు',
      npr_letter: 'ఎన్‌పీఆర్ లేఖ',
      lost_or_misplaced: 'పోయింది',
      stolen: 'దొంగిలించబడింది',
      damaged: 'పాడైపోయింది',
      other: 'ఇతర కారణం',
    },
  },
  gu: {
    confirm: 'કૃપા કરીને આ વિગતો સાંભળો અને બધું સાચું છે તેની ખાતરી કરો.',
    name: 'નામ',
    dob: 'જન્મ તારીખ',
    mobileEnding: (d) => `મોબાઇલ નંબરના છેલ્લા ચાર અંક ${d}`,
    poi: 'ઓળખનો પુરાવો',
    product: 'ખાતું અથવા કામ',
    draft: 'આ ફક્ત ડ્રાફ્ટ છે.',
    noSubmit: 'બેંકમાં કંઈ જમા કરવામાં આવશે નહીં.',
    notSet: 'આપ્યું નથી',
    applicant: 'અરજદાર',
    debit: 'ડેબિટ કાર્ડ ફરી જારી',
    customerId: 'ગ્રાહક આઈડી',
    account: 'ખાતા નંબર',
    cardLast4: 'કાર્ડના છેલ્લા ચાર અંક',
    reason: 'કારણ',
    newCard: 'નવું કાર્ડ',
    yes: 'હા',
    no: 'ના',
    registeredAddress: 'કાર્ડ તમારા નોંધાયેલા સરનામે મોકલવામાં આવશે',
    followup: `સાંભળ્યા પછી નીચેના ત્રણ ખાનામાં ટિક કરો, અથવા બોલો ${GATE_PHRASE}.`,
    enums: {
      account_opening: 'નવું ખાતું ખોલવું',
      kyc_update: 'કેવાયસી અપડેટ',
      rekyc: 'રી-કેવાયસી',
      debit_reissue: 'ડેબિટ કાર્ડ ફરી જારી',
      regular_savings: 'નિયમિત બચત ખાતું',
      salary_savings: 'પગાર ખાતું',
      bsbda: 'બેઝિક બચત ખાતું',
      individual_current: 'ચાલુ ખાતું',
      unspecified_varies_by_bank: 'બેંક મુજબ',
      passport: 'પાસપોર્ટ',
      driving_licence: 'ડ્રાઇવિંગ લાઇસન્સ',
      proof_of_possession_of_aadhaar: 'આધાર',
      voter_id: 'મતદાર ઓળખપત્ર',
      nrega_job_card: 'નરેગા જોબ કાર્ડ',
      npr_letter: 'એનપીઆર પત્ર',
      lost_or_misplaced: 'ખોવાઈ ગયું',
      stolen: 'ચોરાઈ ગયું',
      damaged: 'ખરાબ થઈ ગયું',
      other: 'અન્ય કારણ',
    },
  },
  kn: {
    confirm: 'ದಯವಿಟ್ಟು ಈ ವಿವರಗಳನ್ನು ಕೇಳಿ, ಎಲ್ಲವೂ ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿ.',
    name: 'ಹೆಸರು',
    dob: 'ಹುಟ್ಟಿದ ದಿನಾಂಕ',
    mobileEnding: (d) => `ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕೆಗಳು ${d}`,
    poi: 'ಗುರುತಿನ ಪುರಾವೆ',
    product: 'ಖಾತೆ ಅಥವಾ ಕೆಲಸ',
    draft: 'ಇದು ಕೇವಲ ಕರಡು.',
    noSubmit: 'ಬ್ಯಾಂಕಿಗೆ ಏನನ್ನೂ ಸಲ್ಲಿಸಲಾಗುವುದಿಲ್ಲ.',
    notSet: 'ನೀಡಿಲ್ಲ',
    applicant: 'ಅರ್ಜಿದಾರ',
    debit: 'ಡೆಬಿಟ್ ಕಾರ್ಡ್ ಮರು ವಿತರಣೆ',
    customerId: 'ಗ್ರಾಹಕ ಐಡಿ',
    account: 'ಖಾತೆ ಸಂಖ್ಯೆ',
    cardLast4: 'ಕಾರ್ಡ್‌ನ ಕೊನೆಯ ನಾಲ್ಕು ಅಂಕೆಗಳು',
    reason: 'ಕಾರಣ',
    newCard: 'ಹೊಸ ಕಾರ್ಡ್',
    yes: 'ಹೌದು',
    no: 'ಬೇಡ',
    registeredAddress: 'ಕಾರ್ಡ್ ನಿಮ್ಮ ನೋಂದಾಯಿತ ವಿಳಾಸಕ್ಕೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ',
    followup: `ಕೇಳಿದ ನಂತರ ಕೆಳಗಿನ ಮೂರು ಚೌಕಗಳನ್ನು ಟಿಕ್ ಮಾಡಿ, ಅಥವಾ ${GATE_PHRASE} ಎಂದು ಹೇಳಿ.`,
    enums: {
      account_opening: 'ಹೊಸ ಖಾತೆ ತೆರೆಯುವುದು',
      kyc_update: 'ಕೆವೈಸಿ ಅಪ್‌ಡೇಟ್',
      rekyc: 'ರೀ-ಕೆವೈಸಿ',
      debit_reissue: 'ಡೆಬಿಟ್ ಕಾರ್ಡ್ ಮರು ವಿತರಣೆ',
      regular_savings: 'ಸಾಮಾನ್ಯ ಉಳಿತಾಯ ಖಾತೆ',
      salary_savings: 'ಸಂಬಳ ಖಾತೆ',
      bsbda: 'ಮೂಲ ಉಳಿತಾಯ ಖಾತೆ',
      individual_current: 'ಚಾಲ್ತಿ ಖಾತೆ',
      unspecified_varies_by_bank: 'ಬ್ಯಾಂಕ್ ಪ್ರಕಾರ',
      passport: 'ಪಾಸ್‌ಪೋರ್ಟ್',
      driving_licence: 'ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್',
      proof_of_possession_of_aadhaar: 'ಆಧಾರ್',
      voter_id: 'ಮತದಾರರ ಗುರುತಿನ ಚೀಟಿ',
      nrega_job_card: 'ನರೇಗಾ ಜಾಬ್ ಕಾರ್ಡ್',
      npr_letter: 'ಎನ್‌ಪಿಆರ್ ಪತ್ರ',
      lost_or_misplaced: 'ಕಳೆದುಹೋಗಿದೆ',
      stolen: 'ಕಳ್ಳತನವಾಗಿದೆ',
      damaged: 'ಹಾಳಾಗಿದೆ',
      other: 'ಬೇರೆ ಕಾರಣ',
    },
  },
  ml: {
    confirm: 'ദയവായി ഈ വിവരങ്ങൾ കേട്ട് എല്ലാം ശരിയാണോ എന്ന് ഉറപ്പാക്കുക.',
    name: 'പേര്',
    dob: 'ജനനത്തീയതി',
    mobileEnding: (d) => `മൊബൈൽ നമ്പറിന്റെ അവസാന നാല് അക്കങ്ങൾ ${d}`,
    poi: 'തിരിച്ചറിയൽ രേഖ',
    product: 'അക്കൗണ്ട് അല്ലെങ്കിൽ സേവനം',
    draft: 'ഇത് ഒരു കരട് മാത്രമാണ്.',
    noSubmit: 'ബാങ്കിലേക്ക് ഒന്നും സമർപ്പിക്കില്ല.',
    notSet: 'നൽകിയിട്ടില്ല',
    applicant: 'അപേക്ഷകൻ',
    debit: 'ഡെബിറ്റ് കാർഡ് വീണ്ടും നൽകൽ',
    customerId: 'കസ്റ്റമർ ഐഡി',
    account: 'അക്കൗണ്ട് നമ്പർ',
    cardLast4: 'കാർഡിന്റെ അവസാന നാല് അക്കങ്ങൾ',
    reason: 'കാരണം',
    newCard: 'പുതിയ കാർഡ്',
    yes: 'വേണം',
    no: 'വേണ്ട',
    registeredAddress: 'കാർഡ് നിങ്ങളുടെ രജിസ്റ്റർ ചെയ്ത വിലാസത്തിലേക്ക് അയയ്ക്കും',
    followup: `കേട്ട ശേഷം താഴെയുള്ള മൂന്ന് ബോക്സുകളിൽ ടിക്ക് ചെയ്യുക, അല്ലെങ്കിൽ ${GATE_PHRASE} എന്ന് പറയുക.`,
    enums: {
      account_opening: 'പുതിയ അക്കൗണ്ട് തുറക്കൽ',
      kyc_update: 'കെവൈസി അപ്ഡേറ്റ്',
      rekyc: 'റീ-കെവൈസി',
      debit_reissue: 'ഡെബിറ്റ് കാർഡ് വീണ്ടും നൽകൽ',
      regular_savings: 'സാധാരണ സേവിംഗ്സ് അക്കൗണ്ട്',
      salary_savings: 'ശമ്പള അക്കൗണ്ട്',
      bsbda: 'ബേസിക് സേവിംഗ്സ് അക്കൗണ്ട്',
      individual_current: 'കറന്റ് അക്കൗണ്ട്',
      unspecified_varies_by_bank: 'ബാങ്ക് അനുസരിച്ച്',
      passport: 'പാസ്പോർട്ട്',
      driving_licence: 'ഡ്രൈവിംഗ് ലൈസൻസ്',
      proof_of_possession_of_aadhaar: 'ആധാർ',
      voter_id: 'വോട്ടർ ഐഡി',
      nrega_job_card: 'തൊഴിലുറപ്പ് ജോബ് കാർഡ്',
      npr_letter: 'എൻപിആർ കത്ത്',
      lost_or_misplaced: 'നഷ്ടപ്പെട്ടു',
      stolen: 'മോഷണം പോയി',
      damaged: 'കേടായി',
      other: 'മറ്റ് കാരണം',
    },
  },
  or: {
    confirm: 'ଦୟାକରି ଏହି ବିବରଣୀ ଶୁଣି ସବୁ ଠିକ୍ ଅଛି କି ନାହିଁ ନିଶ୍ଚିତ କରନ୍ତୁ।',
    name: 'ନାମ',
    dob: 'ଜନ୍ମ ତାରିଖ',
    mobileEnding: (d) => `ମୋବାଇଲ ନମ୍ବରର ଶେଷ ଚାରି ଅଙ୍କ ${d}`,
    poi: 'ପରିଚୟର ପ୍ରମାଣ',
    product: 'ଖାତା କିମ୍ବା କାମ',
    draft: 'ଏହା କେବଳ ଏକ ଡ୍ରାଫ୍ଟ।',
    noSubmit: 'ବ୍ୟାଙ୍କରେ କିଛି ଜମା ହେବ ନାହିଁ।',
    notSet: 'ଦିଆଯାଇନାହିଁ',
    applicant: 'ଆବେଦନକାରୀ',
    debit: 'ଡେବିଟ୍ କାର୍ଡ ପୁନଃ ଜାରି',
    customerId: 'ଗ୍ରାହକ ଆଇଡି',
    account: 'ଖାତା ନମ୍ବର',
    cardLast4: 'କାର୍ଡର ଶେଷ ଚାରି ଅଙ୍କ',
    reason: 'କାରଣ',
    newCard: 'ନୂଆ କାର୍ଡ',
    yes: 'ହଁ',
    no: 'ନା',
    registeredAddress: 'କାର୍ଡଟି ଆପଣଙ୍କ ପଞ୍ଜୀକୃତ ଠିକଣାକୁ ପଠାଯିବ',
    followup: `ଶୁଣିବା ପରେ ତଳେ ଥିବା ତିନୋଟି ବାକ୍ସରେ ଟିକ୍ ଦିଅନ୍ତୁ, କିମ୍ବା କୁହନ୍ତୁ ${GATE_PHRASE}।`,
    enums: {
      account_opening: 'ନୂଆ ଖାତା ଖୋଲିବା',
      kyc_update: 'କେୱାଇସି ଅପଡେଟ୍',
      rekyc: 'ରି-କେୱାଇସି',
      debit_reissue: 'ଡେବିଟ୍ କାର୍ଡ ପୁନଃ ଜାରି',
      regular_savings: 'ସାଧାରଣ ସଞ୍ଚୟ ଖାତା',
      salary_savings: 'ଦରମା ଖାତା',
      bsbda: 'ମୌଳିକ ସଞ୍ଚୟ ଖାତା',
      individual_current: 'କରେଣ୍ଟ ଖାତା',
      unspecified_varies_by_bank: 'ବ୍ୟାଙ୍କ ଅନୁଯାୟୀ',
      passport: 'ପାସପୋର୍ଟ',
      driving_licence: 'ଡ୍ରାଇଭିଂ ଲାଇସେନ୍ସ',
      proof_of_possession_of_aadhaar: 'ଆଧାର',
      voter_id: 'ଭୋଟର ଆଇଡି',
      nrega_job_card: 'ନରେଗା ଜବ୍ କାର୍ଡ',
      npr_letter: 'ଏନପିଆର ଚିଠି',
      lost_or_misplaced: 'ହଜିଯାଇଛି',
      stolen: 'ଚୋରି ହୋଇଛି',
      damaged: 'ଖରାପ ହୋଇଯାଇଛି',
      other: 'ଅନ୍ୟ କାରଣ',
    },
  },
  pa: {
    confirm: 'ਕਿਰਪਾ ਕਰਕੇ ਇਹ ਵੇਰਵੇ ਸੁਣੋ ਅਤੇ ਪੁਸ਼ਟੀ ਕਰੋ ਕਿ ਸਭ ਕੁਝ ਸਹੀ ਹੈ।',
    name: 'ਨਾਮ',
    dob: 'ਜਨਮ ਮਿਤੀ',
    mobileEnding: (d) => `ਮੋਬਾਈਲ ਨੰਬਰ ਦੇ ਆਖਰੀ ਚਾਰ ਅੰਕ ${d}`,
    poi: 'ਪਛਾਣ ਦਾ ਸਬੂਤ',
    product: 'ਖਾਤਾ ਜਾਂ ਕੰਮ',
    draft: 'ਇਹ ਸਿਰਫ਼ ਇੱਕ ਡਰਾਫਟ ਹੈ।',
    noSubmit: 'ਬੈਂਕ ਵਿੱਚ ਕੁਝ ਵੀ ਜਮ੍ਹਾਂ ਨਹੀਂ ਕੀਤਾ ਜਾਵੇਗਾ।',
    notSet: 'ਨਹੀਂ ਦਿੱਤਾ',
    applicant: 'ਬਿਨੈਕਾਰ',
    debit: 'ਡੈਬਿਟ ਕਾਰਡ ਦੁਬਾਰਾ ਜਾਰੀ',
    customerId: 'ਗਾਹਕ ਆਈਡੀ',
    account: 'ਖਾਤਾ ਨੰਬਰ',
    cardLast4: 'ਕਾਰਡ ਦੇ ਆਖਰੀ ਚਾਰ ਅੰਕ',
    reason: 'ਕਾਰਨ',
    newCard: 'ਨਵਾਂ ਕਾਰਡ',
    yes: 'ਹਾਂ',
    no: 'ਨਹੀਂ',
    registeredAddress: 'ਕਾਰਡ ਤੁਹਾਡੇ ਰਜਿਸਟਰਡ ਪਤੇ ਤੇ ਭੇਜਿਆ ਜਾਵੇਗਾ',
    followup: `ਸੁਣਨ ਤੋਂ ਬਾਅਦ ਹੇਠਾਂ ਦਿੱਤੇ ਤਿੰਨ ਖਾਨਿਆਂ ਤੇ ਟਿੱਕ ਕਰੋ, ਜਾਂ ਕਹੋ ${GATE_PHRASE}।`,
    enums: {
      account_opening: 'ਨਵਾਂ ਖਾਤਾ ਖੋਲ੍ਹਣਾ',
      kyc_update: 'ਕੇਵਾਈਸੀ ਅੱਪਡੇਟ',
      rekyc: 'ਰੀ-ਕੇਵਾਈਸੀ',
      debit_reissue: 'ਡੈਬਿਟ ਕਾਰਡ ਦੁਬਾਰਾ ਜਾਰੀ',
      regular_savings: 'ਆਮ ਬੱਚਤ ਖਾਤਾ',
      salary_savings: 'ਤਨਖਾਹ ਖਾਤਾ',
      bsbda: 'ਬੇਸਿਕ ਬੱਚਤ ਖਾਤਾ',
      individual_current: 'ਚਾਲੂ ਖਾਤਾ',
      unspecified_varies_by_bank: 'ਬੈਂਕ ਅਨੁਸਾਰ',
      passport: 'ਪਾਸਪੋਰਟ',
      driving_licence: 'ਡਰਾਈਵਿੰਗ ਲਾਇਸੈਂਸ',
      proof_of_possession_of_aadhaar: 'ਆਧਾਰ',
      voter_id: 'ਵੋਟਰ ਆਈਡੀ',
      nrega_job_card: 'ਨਰੇਗਾ ਜੌਬ ਕਾਰਡ',
      npr_letter: 'ਐਨਪੀਆਰ ਪੱਤਰ',
      lost_or_misplaced: 'ਗੁੰਮ ਹੋ ਗਿਆ',
      stolen: 'ਚੋਰੀ ਹੋ ਗਿਆ',
      damaged: 'ਖਰਾਬ ਹੋ ਗਿਆ',
      other: 'ਹੋਰ ਕਾਰਨ',
    },
  },
  as: {
    confirm: 'অনুগ্ৰহ কৰি এই বিৱৰণবোৰ শুনি সকলো সঠিক নেকি নিশ্চিত কৰক।',
    name: 'নাম',
    dob: 'জন্মৰ তাৰিখ',
    mobileEnding: (d) => `মোবাইল নম্বৰৰ শেষৰ চাৰিটা সংখ্যা ${d}`,
    poi: 'পৰিচয়ৰ প্ৰমাণ',
    product: 'একাউণ্ট বা কাম',
    draft: 'এইটো কেৱল এটা খচৰা।',
    noSubmit: 'বেংকত একো জমা দিয়া নহ’ব।',
    notSet: 'দিয়া হোৱা নাই',
    applicant: 'আবেদনকাৰী',
    debit: 'ডেবিট কাৰ্ড পুনৰ জাৰি',
    customerId: 'গ্ৰাহক আইডি',
    account: 'একাউণ্ট নম্বৰ',
    cardLast4: 'কাৰ্ডৰ শেষৰ চাৰিটা সংখ্যা',
    reason: 'কাৰণ',
    newCard: 'নতুন কাৰ্ড',
    yes: 'লাগে',
    no: 'নালাগে',
    registeredAddress: 'কাৰ্ডখন আপোনাৰ পঞ্জীয়নভুক্ত ঠিকনালৈ পঠোৱা হ’ব',
    followup: `শুনাৰ পিছত তলৰ তিনিটা বাকচত টিক দিয়ক, নাইবা কওক ${GATE_PHRASE}।`,
    enums: {
      account_opening: 'নতুন একাউণ্ট খোলা',
      kyc_update: 'কেৱাইচি আপডেট',
      rekyc: 'ৰি-কেৱাইচি',
      debit_reissue: 'ডেবিট কাৰ্ড পুনৰ জাৰি',
      regular_savings: 'সাধাৰণ সঞ্চয় একাউণ্ট',
      salary_savings: 'দৰমহা একাউণ্ট',
      bsbda: 'মৌলিক সঞ্চয় একাউণ্ট',
      individual_current: 'কাৰেণ্ট একাউণ্ট',
      unspecified_varies_by_bank: 'বেংক অনুসৰি',
      passport: 'পাছপৰ্ট',
      driving_licence: 'ড্ৰাইভিং লাইচেন্স',
      proof_of_possession_of_aadhaar: 'আধাৰ',
      voter_id: 'ভোটাৰ আইডি',
      nrega_job_card: 'নৰেগা জব কাৰ্ড',
      npr_letter: 'এনপিআৰ পত্ৰ',
      lost_or_misplaced: 'হেৰাই গৈছে',
      stolen: 'চুৰি হৈছে',
      damaged: 'বেয়া হৈ গৈছে',
      other: 'অন্য কাৰণ',
    },
  },
  sd: {
    confirm: 'مهرباني ڪري اهي تفصيل ٻڌو ۽ تصديق ڪريو ته سڀ ڪجهه صحيح آهي.',
    name: 'نالو',
    dob: 'ڄمڻ جي تاريخ',
    mobileEnding: (d) => `موبائل نمبر جا آخري چار انگ ${d}`,
    poi: 'سڃاڻپ جو ثبوت',
    product: 'کاتو يا ڪم',
    draft: 'هي صرف هڪ مسودو آهي.',
    noSubmit: 'بئنڪ ۾ ڪجهه به جمع نه ڪيو ويندو.',
    notSet: 'نه ڏنو ويو',
    applicant: 'درخواست ڏيندڙ',
    debit: 'ڊيبٽ ڪارڊ ٻيهر جاري ڪرڻ',
    customerId: 'گراهڪ آئي ڊي',
    account: 'کاتي نمبر',
    cardLast4: 'ڪارڊ جا آخري چار انگ',
    reason: 'سبب',
    newCard: 'نئون ڪارڊ',
    yes: 'ها',
    no: 'نه',
    registeredAddress: 'ڪارڊ توهان جي رجسٽرڊ پتي تي موڪليو ويندو',
    followup: `ٻڌڻ کان پوءِ هيٺ ڏنل ٽن خانن تي نشان لڳايو، يا چئو ${GATE_PHRASE}.`,
    enums: {
      account_opening: 'نئون کاتو کولڻ',
      kyc_update: 'ڪي وائي سي اپڊيٽ',
      rekyc: 'ري ڪي وائي سي',
      debit_reissue: 'ڊيبٽ ڪارڊ ٻيهر جاري ڪرڻ',
      regular_savings: 'عام بچت کاتو',
      salary_savings: 'پگهار کاتو',
      bsbda: 'بنيادي بچت کاتو',
      individual_current: 'ڪرنٽ کاتو',
      unspecified_varies_by_bank: 'بئنڪ موجب',
      passport: 'پاسپورٽ',
      driving_licence: 'ڊرائيونگ لائسنس',
      proof_of_possession_of_aadhaar: 'آڌار',
      voter_id: 'ووٽر آئي ڊي',
      nrega_job_card: 'نريگا جاب ڪارڊ',
      npr_letter: 'اين پي آر خط',
      lost_or_misplaced: 'گم ٿي ويو',
      stolen: 'چوري ٿي ويو',
      damaged: 'خراب ٿي ويو',
      other: 'ٻيو سبب',
    },
  },
};

export function isRegionalLanguage(id: string | null | undefined): id is RegionalLanguage {
  return typeof id === 'string' && id in COPY;
}

function label(copy: ReadbackCopy, value: unknown): string {
  const raw = String(value ?? '');
  return copy.enums[raw] ?? raw.replace(/_/g, ' ');
}

type Values = Record<string, string | boolean | null | undefined>;

export function regionalReadback(values: Values, lang: RegionalLanguage): string {
  const c = COPY[lang];
  const name = values.applicant_full_name || c.applicant;
  const dob = values.dob || c.notSet;
  const mobile = String(values.mobile_registered || '');
  const last4 = mobile.length >= 4 ? mobile.slice(-4) : 'xxxx';
  const ovd = values.ovd_poi_type ? label(c, values.ovd_poi_type) : c.notSet;
  const productRaw = values.account_product_intent || values.journey_mode;
  const product = productRaw ? label(c, productRaw) : c.notSet;
  return (
    `${c.confirm} ${c.name}: ${name}. ${c.dob}: ${dob}. ${c.mobileEnding(last4)}. ` +
    `${c.poi}: ${ovd}. ${c.product}: ${product}. ` +
    `${c.draft} Fields vary by bank. ${c.noSubmit}`
  );
}

export function regionalDebitReadback(values: Values, lang: RegionalLanguage, last4: string): string {
  const c = COPY[lang];
  const name = values.applicant_full_name || c.applicant;
  const customer = values.card_customer_id || c.notSet;
  const account = values.card_account_number || c.notSet;
  const reason = values.card_reason ? label(c, values.card_reason) : c.notSet;
  const other = values.card_reason === 'other' && values.card_reason_other ? ` (${values.card_reason_other})` : '';
  const reissue = values.card_reissue_new === false ? c.no : c.yes;
  return (
    `${c.confirm} ${c.debit}. ${c.name}: ${name}. ${c.customerId}: ${customer}. ` +
    `${c.account}: ${account}. ${c.cardLast4}: ${last4 || 'xxxx'}. ${c.reason}: ${reason}${other}. ` +
    `${c.newCard}: ${reissue}. ${c.registeredAddress}. ` +
    `${c.draft} Fields vary by bank. ${c.noSubmit}`
  );
}

export function regionalReadbackFollowup(lang: RegionalLanguage): string {
  return COPY[lang].followup;
}
