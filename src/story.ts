// The saga, "The Runt's Saga": the characters, the flights (built from the normal race rules with
// different goals and set-ups), the rookery's training, and the player's saved progress.
// Pure data and logic: the screens live in storyui.ts and the racing in main.ts.

import { Mods, NO_MODS } from './craft';

// --- characters ---------------------------------------------------------------------------------

export type Speaker = 'player' | 'hilda' | 'brand' | 'sigrun' | 'viggo' | 'aske' | 'skald';

export interface Character { name: string; role: string; color: string }

/** Who's who. The player's name is filled in from the save. */
export const CHARACTERS: Record<Speaker, Character> = {
  player: { name: 'YOU', role: 'Young rider, the Raven Hall', color: '#c8433a' },
  hilda:  { name: 'HILDA', role: 'Old dragon-rider of the fjord', color: '#d9873a' },
  brand:  { name: 'BRAND', role: 'Steward of the Raven Hall', color: '#d9b25b' },
  sigrun: { name: 'SIGRUN', role: 'Dragon-keeper of the Raven Hall', color: '#8fd0e0' },
  viggo:  { name: 'VIGGO', role: 'Twice crowned rider, the Serpent Hall', color: '#9a7ad0' },
  aske:   { name: 'ASKE', role: 'Viggo\'s shield-brother, the Serpent Hall', color: '#5a86c8' },
  skald:  { name: 'THE SKALD', role: 'Singer of the flights', color: '#a8b0a0' },
};

/**
 * A line of dialogue. `if` makes it conditional on how the race actually went, so the
 * post-flight talk matches what happened. Text can use {name} and {place} (e.g. 3RD).
 */
export interface Line { who: Speaker; text: string; if?: Cond }

// --- the field ----------------------------------------------------------------------------------

/**
 * Dragon (livery) index per rider in the flight (see LIVERIES in main.ts): 0 the player's red,
 * 1 frost blue, 2 green, 3 amber, 4 violet, 5 storm blue.
 */
export interface Entrant {
  name: string;
  livery: number;
  /** Riding skill, 0.7 (cautious) to 1 (at the limit). */
  skill: number;
  /** Extra pace on top of the flight's AI buff (Viggo's edge). */
  edge?: number;
  /** Also gets the player's own training, so training can't buy a win against them. */
  matchPlayer?: boolean;
  /** A saga character this dragon belongs to, so goals can name it. */
  who?: Speaker;
}

const HILDA = (skill: number): Entrant => ({ name: 'HILDA', livery: 3, skill, who: 'hilda' });
const VIGGO = (skill: number, edge: number, matchPlayer = false): Entrant => ({ name: 'VIGGO', livery: 4, skill, edge, matchPlayer, who: 'viggo' });
const ASKE = (skill: number): Entrant => ({ name: 'ASKE', livery: 5, skill, who: 'aske' });
/** Riders of the fjords and the other halls, to fill out a flight. */
const LOCALS: Entrant[] = [
  { name: 'ASTRID', livery: 2, skill: 0.8 },
  { name: 'GUNNAR', livery: 1, skill: 0.8 },
  { name: 'EINAR', livery: 5, skill: 0.8 },
  { name: 'RAGNA', livery: 3, skill: 0.8 },
  { name: 'TORVI', livery: 4, skill: 0.8 },
];
/** n other riders whose skills spread across [lo, hi], skipping dragons already used. */
function fillers(n: number, lo: number, hi: number, taken: number[]): Entrant[] {
  const out: Entrant[] = [];
  for (const e of LOCALS) {
    if (out.length === n) break;
    if (taken.includes(e.livery)) continue;
    taken.push(e.livery);
    out.push({ ...e, skill: n === 1 ? hi : lo + ((hi - lo) * out.length) / (n - 1) });
  }
  return out;
}

// --- flights ------------------------------------------------------------------------------------

export type Goal =
  | { kind: 'win' }
  | { kind: 'top'; n: number }
  | { kind: 'beat'; who: Speaker }
  | { kind: 'lap'; seconds: number }
  | { kind: 'cool' }               // finish without your dragon ever overheating
  | { kind: 'and'; goals: Goal[] };

export interface Mission {
  id: string;
  chapter: number;
  title: string;
  track: string;
  laps: number;
  rivals: Entrant[];
  /** Where the player starts: at the back of the line, at the front, or anywhere. */
  grid: 'back' | 'pole' | 'random';
  /** Pace bump for every AI dragon (fraction), the main way difficulty climbs through the saga. */
  aiBuff: number;
  /** Heat the player's dragon starts with (the poisoning). */
  startHeat?: number;
  goal: Goal;
  bonus?: Goal;
  points: number;
  bonusPoints: number;
  /** A note on the result card the first time this flight is completed. */
  unlocks?: string;
  intro: Line[];
  win: Line[];
  lose: Line[];
}

export const CHAPTERS = ['THE FJORD FLIGHTS', 'THE RAVEN HALL', 'THE CLIMB', 'THE CROWN OF THE SKY'];
/** One line under each chapter's title card. */
export const CHAPTER_TAGLINES = [
  'A cold night on the fjord. A runt of a dragon. One borrowed saddle.',
  'A hall on its last silver, and a champion who wants you gone.',
  'Every realm a little wilder. Every rival a little meaner.',
  'One crown. One rival. Everything on the wing.',
];

export const MISSIONS: Mission[] = [
  // ---- Chapter 1: The Fjord Flights -----------------------------------------------------------
  {
    id: 'prove-it', chapter: 0, title: 'PROVE IT', track: 'ASGARD', laps: 2, grid: 'random', aiBuff: 0,
    rivals: [HILDA(0.74)],
    goal: { kind: 'win' }, points: 150, bonusPoints: 0,
    intro: [
      { who: 'skald', text: 'Moonrise over the old ring under Asgard\'s wall. Two dragons on the line, and a dozen fishermen watching.' },
      { who: 'hilda', text: 'So you\'re the whelp who\'s been sleeping in my rookery. {name}, is it? And that\'s the runt of the spring clutch.' },
      { who: 'player', text: 'She can fly. We just need the chance.' },
      { who: 'hilda', text: 'Every runt can flap. Twenty-two winters I\'ve kept a saddle for the Fjord Flights. It goes to whoever beats me.' },
      { who: 'hilda', text: 'Two laps. No one has passed me round this ring since before you were born.' },
    ],
    win: [
      { who: 'hilda', text: '...Well. Odin\'s eye.' },
      { who: 'hilda', text: 'Twenty-two winters. Fine. The saddle\'s yours, {name}. And the runt with it. Don\'t make me regret it.' },
    ],
    lose: [
      { who: 'hilda', text: 'Told you. This ring is mine. Come back when you\'ve learned to check your speed.' },
    ],
  },
  {
    id: 'county-cup', chapter: 0, title: 'THE FJORD FLIGHTS', track: 'ASGARD', laps: 3, grid: 'back', aiBuff: 0,
    rivals: fillers(5, 0.72, 0.84, [0]),
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'win' }, points: 200, bonusPoints: 100,
    intro: [
      { who: 'hilda', text: 'Six dragons, three laps, and you start at the very back. That\'s what a new name gets you.' },
      { who: 'hilda', text: 'Finish in the first three and people start to whisper. Win it and they\'ll sing about you.' },
    ],
    win: [
      { who: 'skald', text: 'A whelp WINS the Fjord Flights! Somebody find out whose red dragon that is!', if: { kind: 'win' } },
      { who: 'skald', text: 'A whelp in the first three of the Fjord Flights! Somebody find out whose red dragon that is!', if: { kind: 'not', cond: { kind: 'win' } } },
      { who: 'brand', text: 'Forgive me. Brand. Steward of the Raven Hall. Perhaps you\'ve heard of us.' },
      { who: 'hilda', text: 'The Raven Hall. Now there\'s a name I haven\'t heard sung in a while.' },
      { who: 'brand', text: 'We have a saddle open in the Sky Moot. A trial flight, tomorrow, over Midgard. Bring Hilda if you like.' },
    ],
    lose: [
      { who: 'hilda', text: 'Outside the first three. It happens. Shake it off and fly again.' },
    ],
  },
  {
    id: 'tryout', chapter: 0, title: 'THE TRIAL FLIGHT', track: 'MIDGARD', laps: 3, grid: 'pole', aiBuff: 0,
    rivals: [],
    goal: { kind: 'lap', seconds: 32.0 }, bonus: { kind: 'lap', seconds: 29.5 }, points: 250, bonusPoints: 100,
    unlocks: 'THE ROOKERY IS OPEN: spend glory on your dragon\'s training from the saga menu.',
    intro: [
      { who: 'brand', text: 'An empty sky, three laps. The Raven Hall needs one lap under thirty-two seconds.' },
      { who: 'brand', text: 'Our last rider managed twenty-nine and a half. He has since... flown elsewhere.' },
      { who: 'hilda', text: 'Slow down before the turns, whelp. Not in them.' },
    ],
    win: [
      { who: 'brand', text: 'Acceptable. More than acceptable, frankly. Welcome to the Raven Hall, {name}.' },
      { who: 'sigrun', text: 'So you\'re the one who\'s going to wear out my dragon. I\'m Sigrun. I keep her flying.' },
      { who: 'sigrun', text: 'Every flight you finish earns the hall glory. Spend it at the rookery and I\'ll train her stronger. A little at a time.' },
    ],
    lose: [
      { who: 'brand', text: 'Not quite. The sky is ours until sundown. Try again.' },
    ],
  },

  // ---- Chapter 2: The Raven Hall --------------------------------------------------------------
  {
    id: 'shakedown', chapter: 1, title: 'FIRST WINGS', track: 'VANAHEIM', laps: 3, grid: 'random', aiBuff: 0.01,
    rivals: fillers(3, 0.8, 0.88, [0]),
    goal: { kind: 'and', goals: [{ kind: 'top', n: 3 }, { kind: 'cool' }] }, bonus: { kind: 'win' }, points: 250, bonusPoints: 100,
    intro: [
      { who: 'sigrun', text: 'Your first real flight in the Sky Moot. Vanaheim. Four dragons.' },
      { who: 'sigrun', text: 'I changed her feed last night and I want to know it worked. First three, and do NOT let her overheat.' },
      { who: 'sigrun', text: 'If she runs hot, there are frost runes along the outside of the long stretch. Fly over them.' },
    ],
    win: [
      { who: 'sigrun', text: 'She kept cool. Not a scratch on her. I might actually like you.' },
      { who: 'sigrun', text: 'And you won it. All right. I definitely like you.', if: { kind: 'win' } },
    ],
    lose: [
      { who: 'sigrun', text: 'That wasn\'t first wings, that was a fever. Again. Gently this time.', if: { kind: 'not', cond: { kind: 'cool' } } },
      { who: 'sigrun', text: 'She stayed cool. The result didn\'t. First three, please.', if: { kind: 'cool' } },
    ],
  },
  {
    id: 'enter-judah', chapter: 1, title: 'ENTER VIGGO', track: 'JOTUNHEIM', laps: 3, grid: 'random', aiBuff: 0.015,
    // Viggo's first flight: he matches whatever you've trained, so only riding beats him.
    rivals: [VIGGO(0.99, 0.06, true), ASKE(0.88), ...fillers(3, 0.8, 0.88, [0, 4, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'viggo' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'viggo', text: 'The Raven Hall? I thought their roof fell in. What are they flying now, a runt?' },
      { who: 'viggo', text: 'Stay out of my wake, whelp. It\'s a long way down from the sky.' },
      { who: 'brand', text: 'Viggo. The Serpent Hall. Twice crowned. And a dragon that is faster than it has any right to be.' },
      { who: 'sigrun', text: 'You won\'t outfly him on the long stretches. Not yet. Finish in the first three and let him have his feast.' },
    ],
    win: [
      { who: 'viggo', text: '...What.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'viggo', text: 'Enjoy it, whelp. That doesn\'t happen twice.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'sigrun', text: 'You beat Viggo. On OUR runt. I need to sit down.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'brand', text: 'The Serpent Hall will not take that quietly. Be ready for them.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'viggo', text: '{place} on a runt. Sweet.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
      { who: 'sigrun', text: 'His dragon pulled away like we were hovering. No honest feed gives that kind of speed.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
      { who: 'brand', text: 'Whispers are not proof, Sigrun. Glory is. Keep earning it.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
    ],
    lose: [
      { who: 'viggo', text: 'You beat me and still missed the first three? Somebody explain this hall to me.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'sigrun', text: '...That\'s a first. Let\'s fix the missing-the-first-three part.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'viggo', text: 'Told you. Long way down.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
    ],
  },
  {
    id: 'penalty', chapter: 1, title: 'LAST IN LINE', track: 'SVARTALFHEIM', laps: 3, grid: 'back', aiBuff: 0.02,
    rivals: [ASKE(0.9), ...fillers(4, 0.82, 0.9, [0, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'aske' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'brand', text: 'The Serpent Hall called us reckless before the Moot\'s lawspeakers. The lawspeakers agreed with them.' },
      { who: 'brand', text: 'You start at the very back. Viggo, of course, sits this one out to "rest his wings".' },
      { who: 'sigrun', text: 'Svartalfheim is all switchbacks through the dwarf forges. Slide the long turns: it stirs up the gale. Then call it on the way out.' },
    ],
    win: [
      { who: 'sigrun', text: 'From last in line to the first three.' },
      { who: 'sigrun', text: 'And you took Aske. He\'s going to hear about that from Viggo.', if: { kind: 'beat', who: 'aske' } },
      { who: 'aske', text: '...Fine flying, Raven. Don\'t tell him I said that.', if: { kind: 'beat', who: 'aske' } },
      { who: 'aske', text: 'Nice climb, Raven. Still behind me, though.', if: { kind: 'not', cond: { kind: 'beat', who: 'aske' } } },
    ],
    lose: [
      { who: 'brand', text: 'The lawspeakers will be pleased. I am not. Again, please.' },
    ],
  },

  // ---- Chapter 3: The Climb -------------------------------------------------------------------
  {
    id: 'last-ride', chapter: 2, title: 'HILDA\'S LAST FLIGHT', track: 'NIFLHEIM', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [HILDA(0.93), ...fillers(4, 0.84, 0.92, [0, 3])],
    goal: { kind: 'beat', who: 'hilda' }, bonus: { kind: 'win' }, points: 350, bonusPoints: 150,
    intro: [
      { who: 'hilda', text: 'The Raven Hall let me have one more flight. Niflheim. My favourite sky in all the realms.' },
      { who: 'hilda', text: 'I\'m not here to make friends, {name}. I want to see what they\'ve taught you. Don\'t you dare ease off for me.' },
    ],
    win: [
      { who: 'hilda', text: 'Ha! There it is. You fly better than I ever did. Don\'t let it go to your head.' },
      { who: 'hilda', text: 'Now go and beat that smug Serpent boy for me.' },
    ],
    lose: [
      { who: 'hilda', text: 'Twenty-two winters, whelp. The mist still likes me better. Again.' },
    ],
  },
  {
    id: 'mirage', chapter: 2, title: 'THE FIRE REALM', track: 'MUSPELHEIM', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [ASKE(0.95), VIGGO(0.96, 0.05), ...fillers(3, 0.86, 0.93, [0, 4, 5])],
    goal: { kind: 'beat', who: 'aske' }, bonus: { kind: 'beat', who: 'viggo' }, points: 350, bonusPoints: 200,
    intro: [
      { who: 'viggo', text: 'Aske. Keep the whelp behind you. That\'s your whole task today.' },
      { who: 'sigrun', text: 'Long stretches, hard turns. A tailwind rises if you\'re within a breath of the dragon ahead. Ride in Aske\'s wake.' },
    ],
    win: [
      { who: 'aske', text: 'He\'s going to send me to clean the stables for that.' },
      { who: 'viggo', text: '...The smoke. That\'s all that was. Don\'t get used to it.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'viggo', text: 'Enjoy it, whelp. Beating Aske doesn\'t count.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
    ],
    lose: [
      { who: 'viggo', text: 'See? Aske earns his mead.' },
    ],
  },
  {
    id: 'sabotage', chapter: 2, title: 'NIGHTSHADE', track: 'ALFHEIM', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [VIGGO(0.97, 0.05), ASKE(0.95), ...fillers(3, 0.88, 0.95, [0, 4, 5])],
    startHeat: 0.55,
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'viggo' }, points: 400, bonusPoints: 200,
    intro: [
      { who: 'sigrun', text: 'Someone was in our rookery last night. There was nightshade in her trough. Deliberately.' },
      { who: 'sigrun', text: 'No time to purge it. She\'s starting with a fever. A bad one. Find the frost runes on the long stretch and keep her off the walls.' },
      { who: 'brand', text: 'The Serpent Hall\'s stalls are next to ours. I\'m sure that\'s a coincidence.' },
    ],
    win: [
      { who: 'sigrun', text: 'First three with nightshade in her blood. They\'ll carve this one on a stone.' },
      { who: 'viggo', text: '...With nightshade in her? That\'s not possible.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'brand', text: 'Interesting, Viggo. How would you know it was nightshade?', if: { kind: 'beat', who: 'viggo' } },
      { who: 'viggo', text: 'Shame about her fever. These runts are so frail.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
      { who: 'brand', text: 'Careful, Viggo. That sounded almost like a confession.', if: { kind: 'not', cond: { kind: 'beat', who: 'viggo' } } },
    ],
    lose: [
      { who: 'sigrun', text: 'The fever took her. Not your fault. Well, partly your fault. Again.', if: { kind: 'not', cond: { kind: 'cool' } } },
      { who: 'sigrun', text: 'You kept her cool, I\'ll give you that. Now keep her in the first three. Again.', if: { kind: 'cool' } },
    ],
  },

  // ---- Chapter 4: The Crown of the Sky --------------------------------------------------------
  {
    id: 'rivals', chapter: 3, title: 'RIVALS', track: 'VANAHEIM', laps: 4, grid: 'random', aiBuff: 0.015,
    rivals: [VIGGO(0.95, 0.02), ASKE(0.95), ...fillers(3, 0.9, 0.95, [0, 4, 5])],
    goal: { kind: 'beat', who: 'viggo' }, bonus: { kind: 'win' }, points: 450, bonusPoints: 200,
    intro: [
      { who: 'brand', text: 'I should tell you something, {name}. The Jarl will burn the Raven Hall\'s banner at midwinter unless we take the crown.' },
      { who: 'brand', text: 'This saga is all we have. You, Sigrun, that runt. That is the whole hall.' },
      { who: 'viggo', text: 'Heard your hall is closing its doors. I\'ll send a funeral ship.' },
      { who: 'sigrun', text: 'Beat him. Just once. Show him he can be beaten.', if: { kind: 'not', cond: { kind: 'flag', flag: 'beat-viggo' } } },
      { who: 'sigrun', text: 'You\'ve beaten him before. Do it again, now, when it actually matters.', if: { kind: 'flag', flag: 'beat-viggo' } },
    ],
    win: [
      { who: 'skald', text: 'VIGGO BEATEN! The Raven Hall\'s whelp has left the champion in their wake!' },
      { who: 'sigrun', text: 'And the win! Not just ahead of him. Ahead of everyone.', if: { kind: 'win' } },
      { who: 'viggo', text: 'One flight. Luck. The crown is a different story.' },
    ],
    lose: [
      { who: 'viggo', text: 'Same saga every time. Long way down, whelp.', if: { kind: 'not', cond: { kind: 'flag', flag: 'beat-viggo' } } },
      { who: 'viggo', text: 'Not so lucky this time, whelp. Whatever you had before, it\'s gone.', if: { kind: 'flag', flag: 'beat-viggo' } },
    ],
  },
  {
    id: 'final', chapter: 3, title: 'THE CROWN OF THE SKY', track: 'MIDGARD', laps: 5, grid: 'back', aiBuff: 0.01,
    rivals: [VIGGO(0.96, 0.025), ASKE(0.93), HILDA(0.92), ...fillers(2, 0.88, 0.93, [0, 3, 4, 5])],
    goal: { kind: 'win' }, bonus: { kind: 'cool' }, points: 600, bonusPoints: 250,
    unlocks: 'THE RUNT\'S SAGA IS COMPLETE. Every flight can be flown again from the saga menu.',
    intro: [
      { who: 'skald', text: 'The last flight of the saga, over Midgard. Win it and the Crown of the Sky goes to the Raven Hall. Lose it and it\'s Viggo\'s third.' },
      { who: 'brand', text: 'The Serpent Hall complained again. You start at the very back. Of course you do.' },
      { who: 'hilda', text: 'I talked my way into the flight. If Viggo gets stuck behind me for a lap or two, well. Winds are fickle.' },
      { who: 'sigrun', text: 'She\'s everything I\'ve got. Five laps. Go and take it, {name}.' },
      { who: 'viggo', text: 'The very back, whelp. Right where you belong.' },
    ],
    win: [
      { who: 'skald', text: 'THE RAVEN HALL WEARS THE CROWN OF THE SKY! From a fjord rookery to the top of the Sky Moot in one saga!' },
      { who: 'viggo', text: '...Good flight. I mean it. Next saga I won\'t need the help.' },
      { who: 'sigrun', text: 'Not a scratch on her. All right, a few scratches. I don\'t care!' },
      { who: 'hilda', text: 'Twenty-two winters I waited to see someone fly like that. Worth every one.' },
      { who: 'brand', text: 'The Jarl sent word. The banner stays. Welcome to your second saga, champion.' },
    ],
    lose: [
      { who: 'viggo', text: 'Three crowns. Thanks for making it interesting.', if: { kind: 'winner', who: 'viggo' } },
      { who: 'aske', text: 'The Serpent Hall takes it anyway. Sorry, Raven. Not that sorry.', if: { kind: 'winner', who: 'aske' } },
      { who: 'hilda', text: 'Twenty-two winters and I finally take the big one. Sorry, whelp. Couldn\'t help myself.', if: { kind: 'winner', who: 'hilda' } },
      { who: 'viggo', text: 'Not even in the first three at my own crowning? You were ahead of me today, whelp. It won\'t last.', if: { kind: 'beat', who: 'viggo' } },
      { who: 'sigrun', text: 'We\'re not done. One more flight. Please.' },
    ],
  },
];

// --- the rookery (training) ---------------------------------------------------------------------

export type UpgradeId = 'speed' | 'accel' | 'control' | 'heat' | 'boost';

export interface Upgrade { id: UpgradeId; name: string; blurb: string; perLevel: number; stat: keyof Mods }

/** Small steps on purpose: the rivals get faster each chapter, so training keeps you in the fight. */
export const UPGRADES: Upgrade[] = [
  { id: 'speed', name: 'SWIFT WINGS', blurb: '+1% top speed per level', perLevel: 0.01, stat: 'top' },
  { id: 'accel', name: 'STRONG WINGBEAT', blurb: '+1% pull per level', perLevel: 0.01, stat: 'accel' },
  { id: 'control', name: 'SURE FLIGHT', blurb: '+2% grip in the turns per level', perLevel: 0.02, stat: 'grip' },
  { id: 'heat', name: 'FROST BLOOD', blurb: '-3% heat from hits per level', perLevel: 0.03, stat: 'heat' },
  { id: 'boost', name: 'STORM LUNGS', blurb: '+3% gale power per level', perLevel: 0.03, stat: 'ers' },
];
export const MAX_LEVEL = 10;

/** Points to buy the next level when at `level`. */
export function upgradeCost(level: number): number { return 80 + level * 40; }

/** The player's dragon mods from their training levels. */
export function playerMods(save: Save): Mods {
  const m: Mods = { ...NO_MODS };
  for (const u of UPGRADES) m[u.stat] += (save.upgrades[u.id] ?? 0) * u.perLevel;
  return m;
}

/**
 * An AI dragon's mods: the flight's field-wide buff plus the rider's own edge. Saga rivals keep
 * pace with the rookery: every one of them gets UPGRADE_MATCH of the player's training, so it
 * gives a small edge but never buys a win. A rival with matchPlayer (Viggo's first flight) gets
 * all of it, so only riding beats him.
 */
export const UPGRADE_MATCH = 0.8;

export function rivalMods(mission: Mission, e: Entrant, player: Mods): Mods {
  const pace = mission.aiBuff + (e.edge ?? 0);
  const m: Mods = { ...NO_MODS, top: pace, accel: pace };
  const share = e.matchPlayer ? 1 : UPGRADE_MATCH;
  for (const k of Object.keys(m) as (keyof Mods)[]) m[k] += player[k] * share;
  return m;
}

// --- saved progress -----------------------------------------------------------------------------

export interface Save {
  name: string;
  points: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Missions completed, and which earned their bonus. */
  done: string[];
  /** Moments the saga remembers across flights, e.g. 'beat-viggo'. */
  flags?: string[];
  bonus: string[];
}

const SAVE_KEY = 'skyfold-story';

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    return { name: s.name ?? 'WHELP', points: s.points ?? 0, upgrades: s.upgrades ?? {}, done: s.done ?? [], bonus: s.bonus ?? [], flags: s.flags ?? [] };
  } catch {
    return null;
  }
}

export function writeSave(s: Save): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode etc.: progress just isn't kept */ }
}

export function newSave(name: string): Save {
  return { name, points: 0, upgrades: {}, done: [], bonus: [] };
}

/** A mission is open once every mission before it is done. */
export function unlocked(save: Save, i: number): boolean {
  return MISSIONS.slice(0, i).every((m) => save.done.includes(m.id));
}

/** Replaying a finished mission pays a quarter, so there's a little to grind but not much. */
export const REPLAY_SHARE = 0.25;

// --- judging a race -----------------------------------------------------------------------------

/** What happened in the race, as far as the goals care. */
export interface Outcome {
  place: number;                       // 1 = won
  winner: Speaker | null;              // the character who won ('player' for you; null for a filler driver)
  ahead: (who: Speaker) => boolean;    // did the player finish ahead of that character?
  bestLap: number;                     // 0 = no lap completed
  overheated: boolean;
}

export function met(goal: Goal, o: Outcome): boolean {
  switch (goal.kind) {
    case 'win': return o.place === 1;
    case 'top': return o.place <= goal.n;
    case 'beat': return o.ahead(goal.who);
    case 'lap': return o.bestLap > 0 && o.bestLap <= goal.seconds;
    case 'cool': return !o.overheated;
    case 'and': return goal.goals.every((g) => met(g, o));
  }
}

export function describe(goal: Goal): string {
  switch (goal.kind) {
    case 'win': return 'Win the flight';
    case 'top': return `Finish in the top ${goal.n}`;
    case 'beat': return `Finish ahead of ${CHARACTERS[goal.who].name}`;
    case 'lap': return `Set a lap under ${goal.seconds.toFixed(1)} s`;
    case 'cool': return 'Never let your dragon overheat';
    case 'and': return goal.goals.map((g, i) => (i ? describe(g).replace(/^./, (c) => c.toLowerCase()) : describe(g))).join(' and ');
  }
}

/** A condition on a dialogue line: any goal, its opposite, or who won the race. */
export type Cond = Goal | { kind: 'not'; cond: Cond } | { kind: 'winner'; who: Speaker } | { kind: 'flag'; flag: string };

/** Check a condition against the race (null before it's run) and the story's remembered flags. */
export function check(c: Cond, o: Outcome | null, flags: string[]): boolean {
  if (c.kind === 'not') return !check(c.cond, o, flags);
  if (c.kind === 'flag') return flags.includes(c.flag);
  if (!o) return false;
  if (c.kind === 'winner') return o.winner === c.who;
  return met(c, o);
}

/** The lines that apply to how the race went and what's happened in the story so far. */
export function linesFor(lines: Line[], o: Outcome | null, flags: string[] = []): Line[] {
  return lines.filter((l) => !l.if || check(l.if, o, flags));
}

/** A place as words: 1ST, 2ND, 3RD, 4TH... */
export function ordinal(n: number): string {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? 'TH' : u === 1 ? 'ST' : u === 2 ? 'ND' : u === 3 ? 'RD' : 'TH'}`;
}

/** Fill {name} and {place} into a line. */
export function say(text: string, save: Save, place = 0): string {
  return text.replace(/\{name\}/g, save.name).replace(/\{place\}/g, ordinal(place));
}
