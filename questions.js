// Every question lives here. Add one and it shows up everywhere (home, explore, /q/:id, sitemap).
//
// Option shape: { id, label, alt?, swatch?, reward? }
//   reward (optional) is what a person sees right after voting for that option:
//     { facts: ['...', '...'] }          rotating "did you know" cards
//     { video: 'YOUTUBE_ID', title }     a video that plays inline (youtube-nocookie)
//     { links: [{ label, href }] }       things to go explore
//   Add more reward types in public/app.js -> rewardHTML().

export const CATEGORIES = [
  { id: 'where', label: "Where you're from" },
  { id: 'you', label: 'About you' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'rather', label: 'Would you rather' },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = (labels) => labels.map((l) => (typeof l === 'string' ? { id: slug(l), label: l } : { id: slug(l.label), ...l }));

// ---- countries, built from ISO codes so we never hand-type 190 names
const CODES = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW PS TW XK HK MO PR GL`.split(/\s+/);

const NAME_FIX = {
  HK: 'Hong Kong', MO: 'Macau', CD: 'DR Congo', CG: 'Republic of the Congo', PS: 'Palestine',
  MM: 'Myanmar', FM: 'Micronesia', KR: 'South Korea', KP: 'North Korea', VA: 'Vatican City',
  CV: 'Cape Verde', CI: "Côte d'Ivoire", TR: 'Türkiye',
};
const ALT = {
  TR: 'turkey', CZ: 'czech republic', CI: 'ivory coast', US: 'usa america united states of america',
  GB: 'uk england scotland wales britain great britain', MM: 'burma', SZ: 'swaziland', MK: 'macedonia',
  CD: 'congo drc', CG: 'congo', AE: 'uae emirates dubai', NL: 'holland', TL: 'east timor',
  PS: 'gaza west bank', RU: 'russian federation', KR: 'korea', KP: 'korea', LA: 'lao',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryOptions = CODES.map((code) => ({
  id: code,
  code,
  label: NAME_FIX[code] || regionNames.of(code),
  ...(ALT[code] ? { alt: ALT[code] } : {}),
})).sort((a, b) => a.label.localeCompare(b.label, 'en'));

// ---- starter rewards (text only). Swap in videos/images as you collect them.
const colorOptions = [
  { label: 'Red', swatch: '#E5484D', reward: { facts: ['Red is the first color most languages ever named after black and white.', 'Red-wavelength light is the first to fade underwater. Deep-sea fish that look red are practically invisible.'] } },
  { label: 'Orange', swatch: '#F76B15', reward: { facts: ['The fruit gave the color its name, not the other way round. English had no word for orange before oranges arrived.', 'Orange is the national color of the Netherlands, thanks to the House of Orange.', 'Pumpkin, autumn leaves, lava. Orange is what warm looks like.'] } },
  { label: 'Yellow', swatch: '#F5C400', reward: { facts: ['Yellow is the most visible color in daylight, which is why taxis and school buses wear it.', 'Bananas used to be a different, sweeter variety. Most of those were wiped out by disease in the 1950s.'] } },
  { label: 'Green', swatch: '#30A46C', reward: { facts: ['Human eyes distinguish more shades of green than any other color.', 'Most of the world\'s oxygen is made by green things you can\'t see: plankton.'] } },
  { label: 'Teal', swatch: '#12A594', reward: { facts: ['Teal is named after a small duck. The color is the stripe on its head.'] } },
  { label: 'Blue', swatch: '#3E63DD', reward: { facts: ['Blue is the most common favorite color in surveys on every continent.', 'Homer never describes the sea as blue. Many ancient languages had no word for it.'] } },
  { label: 'Purple', swatch: '#8E4EC6', reward: { facts: ['Purple dye used to cost more than gold, made from thousands of sea snails per gram.'] } },
  { label: 'Pink', swatch: '#E93D82', reward: { facts: ['Pink was once a color for boys. Red\'s little brother, the logic went.'] } },
  { label: 'Black', swatch: '#1B1B1F', reward: { facts: ['Vantablack absorbs about 99.96% of light. It looks like a hole in the world.'] } },
  { label: 'White', swatch: '#F4F4F5', reward: { facts: ['White isn\'t one color. It\'s all of them at once.'] } },
];

const duel = (id, prompt, a, b, hue, extra = {}) => ({ id, category: 'rather', prompt, hue, options: list([a, b]), ...extra });

export const QUESTIONS = [
  { id: 'country', category: 'where', prompt: 'Which country are you?', hue: 172, kind: 'countries', options: countryOptions },
  { id: 'dream-trip', category: 'where', prompt: 'Where would you fly tomorrow?', hue: 20, kind: 'countries', options: countryOptions },
  { id: 'best-food', category: 'favorites', prompt: 'Which country has the best food?', hue: 35, kind: 'countries', options: countryOptions },
  { id: 'nicest-people', category: 'favorites', prompt: 'Which country has the nicest people?', hue: 350, kind: 'countries', options: countryOptions },
  {
    id: 'language', category: 'where', prompt: "What's your first language?", hue: 205,
    options: list([
      { label: 'English', flag: 'gb' }, { label: 'Mandarin Chinese', flag: 'cn' }, { label: 'Hindi', flag: 'in' }, { label: 'Spanish', flag: 'es' },
      { label: 'French', flag: 'fr' }, { label: 'Arabic', flag: 'sa' }, { label: 'Bengali', flag: 'bd' }, { label: 'Portuguese', flag: 'pt' },
      { label: 'Russian', flag: 'ru' }, { label: 'Urdu', flag: 'pk' }, { label: 'Indonesian', flag: 'id' }, { label: 'German', flag: 'de' },
      { label: 'Japanese', flag: 'jp' }, { label: 'Swahili', flag: 'ke' }, { label: 'Turkish', flag: 'tr' }, { label: 'Korean', flag: 'kr' },
      { label: 'Vietnamese', flag: 'vn' }, { label: 'Italian', flag: 'it' }, { label: 'Persian', flag: 'ir' }, { label: 'Polish', flag: 'pl' },
      { label: 'Ukrainian', flag: 'ua' }, 'Another language',
    ]),
  },
  {
    id: 'religion', category: 'you', prompt: "What's your religion?", hue: 78,
    options: list(['Christian', 'Muslim', 'Hindu', 'Buddhist', 'Jewish', 'Sikh', 'Folk or traditional', 'Spiritual, not religious', 'Agnostic', 'Atheist', 'Other']),
  },
  { id: 'age', category: 'you', prompt: 'How old are you?', hue: 150, options: list(['Under 18', '18 to 24', '25 to 34', '35 to 44', '45 to 54', '55 to 64', '65 and over']) },
  { id: 'sleep', category: 'you', prompt: 'How much do you sleep?', hue: 285, options: list(['Under 5 hours', '5 to 6 hours', '7 to 8 hours', '9 hours or more']) },
  {
    id: 'favorite-animal', category: 'favorites', prompt: 'Favorite animal?', hue: 48,
    options: list([
      { label: 'Dog', reward: { facts: ['Dogs can learn over 150 words, and understand tone in a human voice the way we do.', 'A dog\'s nose print is as unique as a human fingerprint.'] } },
      { label: 'Cat', reward: { facts: ['Cats spend about two thirds of their lives asleep. Efficient.', 'A purr sits at 25 to 150 Hz, a range linked to healing in bone and muscle.'] } },
      'Horse', 'Dolphin', 'Elephant', 'Wolf', 'Lion', 'Owl', 'Penguin', 'Panda', 'Fox', 'Octopus', 'Eagle', 'Rabbit', 'Something else',
    ]),
  },
  { id: 'favorite-color', category: 'favorites', prompt: 'Favorite color?', hue: 345, options: list(colorOptions) },
  { id: 'season', category: 'favorites', prompt: 'Favorite season?', hue: 135, options: list(['Spring', 'Summer', 'Autumn', 'Winter']) },
  {
    id: 'cuisine', category: 'favorites', prompt: 'Favorite cuisine?', hue: 28,
    options: list([
      { label: 'Italian', flag: 'it' }, { label: 'Japanese', flag: 'jp' }, { label: 'Mexican', flag: 'mx' }, { label: 'Indian', flag: 'in' },
      { label: 'Chinese', flag: 'cn' }, { label: 'Thai', flag: 'th' }, { label: 'French', flag: 'fr' }, { label: 'Turkish', flag: 'tr' },
      { label: 'Lebanese', flag: 'lb' }, { label: 'Korean', flag: 'kr' }, { label: 'Greek', flag: 'gr' }, { label: 'Spanish', flag: 'es' },
      { label: 'American', flag: 'us' }, 'Something else',
    ]),
  },
  duel('coffee-or-tea', 'Coffee or tea?', 'Coffee', 'Tea', 55),
  duel('mountains-or-beach', 'Mountains or beach?', 'Mountains', 'Beach', 220),
  duel('morning-or-night', 'Morning person or night owl?', 'Morning person', 'Night owl', 300),
  duel('sweet-or-salty', 'Sweet or salty?', 'Sweet', 'Salty', 12),
  duel('pineapple-on-pizza', 'Pineapple on pizza?', 'Yes, always', 'Never', 95),
  duel('cats-or-dogs', 'Cats or dogs?', 'Cats', 'Dogs', 40),
  duel('city-or-town', 'Big city or small town?', 'Big city', 'Small town', 250),
  duel('fly-or-invisible', 'Fly or be invisible?', 'Fly', 'Invisible', 190),
  duel('past-or-future', 'Visit the past or the future?', 'The past', 'The future', 320),
  duel('book-or-movie', 'Book or movie?', 'Book', 'Movie', 165),
  duel('call-or-text', 'Call or text?', 'Call', 'Text', 232),
  duel('hot-or-cold', 'Live somewhere hot or cold?', 'Hot', 'Cold', 20),
  duel('save-or-spend', 'Save or spend?', 'Save', 'Spend', 120),
];

// Emoji shown next to options. Keyed by question id, then option id.
const EMOJI = {
  'coffee-or-tea': { coffee: '☕', tea: '🍵' },
  'mountains-or-beach': { mountains: '⛰️', beach: '🏖️' },
  'morning-or-night': { 'morning-person': '🌅', 'night-owl': '🦉' },
  'sweet-or-salty': { sweet: '🍬', salty: '🧂' },
  'pineapple-on-pizza': { 'yes-always': '🍍', never: '🙅' },
  'cats-or-dogs': { cats: '🐱', dogs: '🐶' },
  'city-or-town': { 'big-city': '🏙️', 'small-town': '🏡' },
  'fly-or-invisible': { fly: '🦅', invisible: '👻' },
  'past-or-future': { 'the-past': '🦖', 'the-future': '🚀' },
  'book-or-movie': { book: '📖', movie: '🎬' },
  'call-or-text': { call: '📞', text: '💬' },
  'hot-or-cold': { hot: '🔥', cold: '❄️' },
  'save-or-spend': { save: '🏦', spend: '🛍️' },
  season: { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' },
  'favorite-animal': { dog: '🐶', cat: '🐱', horse: '🐴', dolphin: '🐬', elephant: '🐘', wolf: '🐺', lion: '🦁', owl: '🦉', penguin: '🐧', panda: '🐼', fox: '🦊', octopus: '🐙', eagle: '🦅', rabbit: '🐰', 'something-else': '✨' },
  religion: { christian: '✝️', muslim: '☪️', hindu: '🕉️', buddhist: '☸️', jewish: '✡️', sikh: '🪯', 'folk-or-traditional': '🌿', 'spiritual-not-religious': '✨', agnostic: '🤷', atheist: '⚛️', other: '🌍' },
  age: { 'under-18': '🧒', '18-to-24': '🎓', '25-to-34': '💼', '35-to-44': '🏠', '45-to-54': '🌳', '55-to-64': '🌅', '65-and-over': '🧓' },
  sleep: { 'under-5-hours': '😵', '5-to-6-hours': '🥱', '7-to-8-hours': '😴', '9-hours-or-more': '🛌' },
  cuisine: { 'something-else': '🍽️' },
  language: { 'another-language': '🗣️' },
};
for (const q of QUESTIONS) for (const o of q.options) if (EMOJI[q.id]?.[o.id]) o.emoji = EMOJI[q.id][o.id];

export const questionById = new Map(QUESTIONS.map((q) => [q.id, q]));
for (const q of QUESTIONS) q.optionIds = new Set(q.options.map((o) => o.id));

export const FEATURED = ['coffee-or-tea', 'mountains-or-beach', 'morning-or-night', 'season', 'sweet-or-salty', 'pineapple-on-pizza'];
