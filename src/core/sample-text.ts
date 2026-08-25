import { MULTILINGUAL } from './providers/types';

/**
 * What the voice browser's play button speaks: one short sentence in the
 * locale's own language, so a Chinese voice demos in Chinese and a German
 * one in German. Multilingual voices get English plus Chinese in one
 * sample — switching languages mid-sample is the very thing they are for.
 * Samples are synthesized by the user's provider like any sentence, so
 * they are kept short; unknown languages fall back to English.
 */

const ENGLISH = 'Hello! This is what I sound like when reading aloud.';
const CHINESE_SIMPLIFIED = '你好!这是我朗读时的声音。';
const CHINESE_TRADITIONAL = '你好!這是我朗讀時的聲音。';

const MULTILINGUAL_SAMPLE = `${ENGLISH} ${CHINESE_SIMPLIFIED}`;

// One line per language, translations of the English sentence. Data, not
// prose: the strings are what the voices speak.
const BY_LANGUAGE: Record<string, string> = {
  en: ENGLISH,
  zh: CHINESE_SIMPLIFIED,
  wuu: CHINESE_SIMPLIFIED,
  yue: '你好!呢個係我朗讀時嘅聲音。',
  ja: 'こんにちは。これが朗読するときの私の声です。',
  ko: '안녕하세요. 이것이 제가 낭독할 때의 목소리입니다.',
  de: 'Hallo! So klinge ich beim Vorlesen.',
  fr: 'Bonjour ! Voici ma voix quand je lis à haute voix.',
  es: '¡Hola! Así sueno cuando leo en voz alta.',
  it: 'Ciao! Questa è la mia voce quando leggo ad alta voce.',
  pt: 'Olá! É assim que eu soo quando leio em voz alta.',
  ru: 'Здравствуйте! Так звучит мой голос при чтении вслух.',
  uk: 'Вітаю! Так звучить мій голос під час читання вголос.',
  ar: 'مرحبًا! هكذا يبدو صوتي عند القراءة بصوت عالٍ.',
  he: 'שלום! כך אני נשמע כשאני קורא בקול.',
  fa: 'سلام! صدای من هنگام بلندخوانی این‌گونه است.',
  hi: 'नमस्ते! ज़ोर से पढ़ते समय मेरी आवाज़ ऐसी लगती है।',
  bn: 'নমস্কার! জোরে পড়ার সময় আমার কণ্ঠস্বর এমন শোনায়।',
  ta: 'வணக்கம்! நான் உரக்கப் படிக்கும்போது என் குரல் இப்படி ஒலிக்கும்.',
  te: 'నమస్కారం! నేను బిగ్గరగా చదివేటప్పుడు నా స్వరం ఇలా ఉంటుంది.',
  ur: 'السلام علیکم! بلند آواز میں پڑھتے وقت میری آواز ایسی ہے۔',
  th: 'สวัสดี นี่คือเสียงของฉันเวลาอ่านออกเสียง',
  vi: 'Xin chào! Đây là giọng của tôi khi đọc to.',
  id: 'Halo! Seperti inilah suara saya saat membaca.',
  ms: 'Helo! Beginilah bunyi suara saya semasa membaca.',
  nl: 'Hallo! Zo klink ik wanneer ik voorlees.',
  pl: 'Cześć! Tak brzmi mój głos podczas czytania na głos.',
  tr: 'Merhaba! Sesli okurken sesim böyle.',
  sv: 'Hej! Så här låter jag när jag läser högt.',
  da: 'Hej! Sådan lyder jeg, når jeg læser højt.',
  nb: 'Hei! Slik høres jeg ut når jeg leser høyt.',
  no: 'Hei! Slik høres jeg ut når jeg leser høyt.',
  fi: 'Hei! Tältä ääneni kuulostaa, kun luen ääneen.',
  cs: 'Ahoj! Takhle zním, když čtu nahlas.',
  sk: 'Ahoj! Takto zniem, keď čítam nahlas.',
  el: 'Γεια σας! Έτσι ακούγομαι όταν διαβάζω δυνατά.',
  hu: 'Helló! Így hangzik a hangom felolvasás közben.',
  ro: 'Bună! Așa sună vocea mea când citesc cu voce tare.',
  bg: 'Здравейте! Така звучи гласът ми, когато чета на глас.',
  ca: 'Hola! Així sona la meva veu quan llegeixo en veu alta.',
  hr: 'Bok! Ovako zvučim kada čitam naglas.',
};

// Chinese is the one language whose script differs by region; everything
// else resolves by base language alone.
const BY_LOCALE: Record<string, string> = {
  'zh-tw': CHINESE_TRADITIONAL,
  'zh-hk': CHINESE_TRADITIONAL,
  'zh-mo': CHINESE_TRADITIONAL,
};

export function sampleTextForLocale(locale: string): string {
  // `*` is Zotero's wildcard for the same voices the plugin files under mul
  if (locale === MULTILINGUAL || locale === '*') return MULTILINGUAL_SAMPLE;
  const normalized = locale.toLowerCase();
  const exact = BY_LOCALE[normalized];
  if (exact) return exact;
  const base = normalized.split('-', 1)[0];
  return BY_LANGUAGE[base] ?? ENGLISH;
}
