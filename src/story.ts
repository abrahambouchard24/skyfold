// Story mode, "Rookie Season": the characters, the missions (built from the normal race rules
// with different goals and set-ups), the garage upgrades, and the player's saved progress.
// Pure data and logic: the screens live in storyui.ts and the racing in main.ts.

import { Mods, NO_MODS } from './craft';

// --- characters ---------------------------------------------------------------------------------

export type Speaker = 'player' | 'lupis' | 'charlie' | 'sophi' | 'judah' | 'rook' | 'announcer';

export interface Character { name: string; role: string; color: string }

/** Who's who. The player's name is filled in from the save. */
export const CHARACTERS: Record<Speaker, Character> = {
  player:    { name: 'YOU', role: 'Rookie, Leopard GP', color: '#ff3d6e' },
  charlie:   { name: 'CHARLIE', role: 'County speedway legend', color: '#ff8a1f' },
  lupis:     { name: 'MR. LUPIS', role: 'Team Secretary, Leopard GP', color: '#ffd23f' },
  sophi:     { name: 'SOPHI', role: 'Team Mechanic, Leopard GP', color: '#4fe3ff' },
  judah:     { name: 'JUDAH', role: 'Two-time champion, Vanta Racing', color: '#a46bff' },
  rook:      { name: 'ROOK', role: 'Judah\'s teammate, Vanta Racing', color: '#3d7bff' },
  announcer: { name: 'ANNOUNCER', role: 'Apex Series broadcast', color: '#8a93c0' },
};

/**
 * A line of dialogue. `if` makes it conditional on how the race actually went, so the
 * post-race talk matches what happened. Text can use {name} and {place} (e.g. P3).
 */
export interface Line { who: Speaker; text: string; if?: Cond }

// --- the field ----------------------------------------------------------------------------------

/**
 * Livery index per car in the race (see LIVERIES in main.ts): 0 red (the player, Leopard GP),
 * 1 cyan, 2 green, 3 orange, 4 purple, 5 blue.
 */
export interface Entrant {
  name: string;
  livery: number;
  /** Driving skill, 0.7 (cautious) to 1 (at the limit). */
  skill: number;
  /** Extra pace on top of the mission's AI buff (Judah's edge). */
  edge?: number;
  /** Also gets the player's own garage upgrades, so upgrades can't buy a win against them. */
  matchPlayer?: boolean;
  /** A story character this car belongs to, so goals can name it. */
  who?: Speaker;
}

const CHARLIE = (skill: number): Entrant => ({ name: 'CHARLIE', livery: 3, skill, who: 'charlie' });
const JUDAH = (skill: number, edge: number, matchPlayer = false): Entrant => ({ name: 'JUDAH', livery: 4, skill, edge, matchPlayer, who: 'judah' });
const ROOK = (skill: number): Entrant => ({ name: 'ROOK', livery: 5, skill, who: 'rook' });
/** Local racers and other teams' drivers, to fill out a grid. */
const LOCALS: Entrant[] = [
  { name: 'MAGS', livery: 2, skill: 0.8 },
  { name: 'DUTCH', livery: 1, skill: 0.8 },
  { name: 'KENJI', livery: 5, skill: 0.8 },
  { name: 'BEA', livery: 3, skill: 0.8 },
  { name: 'VOSS', livery: 4, skill: 0.8 },
];
/** n filler drivers whose skills spread across [lo, hi], skipping liveries already used. */
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

// --- missions -----------------------------------------------------------------------------------

export type Goal =
  | { kind: 'win' }
  | { kind: 'top'; n: number }
  | { kind: 'beat'; who: Speaker }
  | { kind: 'lap'; seconds: number }
  | { kind: 'cool' }               // finish without ever overheating
  | { kind: 'and'; goals: Goal[] };

export interface Mission {
  id: string;
  chapter: number;
  title: string;
  track: string;
  laps: number;
  rivals: Entrant[];
  /** Where the player starts: from the back, from pole, or a random slot. */
  grid: 'back' | 'pole' | 'random';
  /** Pace bump for every AI car (fraction), the main way difficulty climbs through the story. */
  aiBuff: number;
  /** Heat the player's car starts with (the sabotage mission). */
  startHeat?: number;
  goal: Goal;
  bonus?: Goal;
  points: number;
  bonusPoints: number;
  /** A note on the result card the first time this mission is completed. */
  unlocks?: string;
  intro: Line[];
  win: Line[];
  lose: Line[];
}

export const CHAPTERS = ['COUNTY CUP', 'LEOPARD GP', 'THE CLIMB', 'THE APEX'];
/** One line under each chapter's title card. */
export const CHAPTER_TAGLINES = [
  'A Tuesday night. A county speedway. One borrowed seat.',
  'A team on its last legs, and a champion who wants you gone.',
  'Every race a little faster. Every rival a little meaner.',
  'One title. One rival. Everything on the line.',
];

export const MISSIONS: Mission[] = [
  // ---- Chapter 1: County Cup ------------------------------------------------------------------
  {
    id: 'prove-it', chapter: 0, title: 'PROVE IT', track: 'VELOCITY COLOSSEUM', laps: 2, grid: 'random', aiBuff: 0,
    rivals: [CHARLIE(0.74)],
    goal: { kind: 'win' }, points: 150, bonusPoints: 0,
    intro: [
      { who: 'announcer', text: 'Tuesday night at the county speedway. Two cars on the grid, and twelve people in the stands.' },
      { who: 'charlie', text: 'So you\'re the kid who\'s been sleeping in my pit garage. {name}, right?' },
      { who: 'player', text: 'I can drive. I just need a car.' },
      { who: 'charlie', text: 'Everybody can drive on a Tuesday. I\'ve sponsored a seat in the County Cup for twenty-two years. It goes to whoever beats me.' },
      { who: 'charlie', text: 'Two laps. Nobody\'s passed me on this banking since before you were born.' },
    ],
    win: [
      { who: 'charlie', text: '...Well. Huh.' },
      { who: 'charlie', text: 'Twenty-two years. Fine. The seat\'s yours, {name}. Don\'t make me regret it.' },
    ],
    lose: [
      { who: 'charlie', text: 'Told you. The banking\'s mine. Come back when you\'ve learned to brake.' },
    ],
  },
  {
    id: 'county-cup', chapter: 0, title: 'COUNTY CUP', track: 'VELOCITY COLOSSEUM', laps: 3, grid: 'back', aiBuff: 0,
    rivals: fillers(5, 0.72, 0.84, [0]),
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'win' }, points: 200, bonusPoints: 100,
    intro: [
      { who: 'charlie', text: 'Six cars, three laps, and you start dead last. That\'s what a new name gets you.' },
      { who: 'charlie', text: 'Get on the podium and people start paying attention. Win it and they won\'t forget you.' },
    ],
    win: [
      { who: 'announcer', text: 'A rookie WINS the County Cup! Somebody find out who that red car belongs to!', if: { kind: 'win' } },
      { who: 'announcer', text: 'A rookie on the County Cup podium! Somebody find out who that red car belongs to!', if: { kind: 'not', cond: { kind: 'win' } } },
      { who: 'lupis', text: 'Excuse me. Lupis. Team Secretary, Leopard GP. Perhaps you\'ve heard of us.' },
      { who: 'charlie', text: 'Leopard GP. Now there\'s a name I haven\'t heard in a while.' },
      { who: 'lupis', text: 'We have a seat open in the Apex Series. A tryout, tomorrow, at the Apex Arena. Bring Charlie if you like.' },
    ],
    lose: [
      { who: 'charlie', text: 'Off the podium. It happens. Shake it off and line up again.' },
    ],
  },
  {
    id: 'tryout', chapter: 0, title: 'THE TRYOUT', track: 'APEX ARENA', laps: 3, grid: 'pole', aiBuff: 0,
    rivals: [],
    goal: { kind: 'lap', seconds: 32.0 }, bonus: { kind: 'lap', seconds: 29.5 }, points: 250, bonusPoints: 100,
    unlocks: 'GARAGE UNLOCKED: spend team points on upgrades from the story menu.',
    intro: [
      { who: 'lupis', text: 'An empty track, three laps. Leopard GP needs one lap under thirty-two seconds.' },
      { who: 'lupis', text: 'Our previous driver managed twenty-nine and a half. He has since... moved on.' },
      { who: 'charlie', text: 'Brake before the corners, kid. Not in them.' },
    ],
    win: [
      { who: 'lupis', text: 'Acceptable. More than acceptable, frankly. Welcome to Leopard GP, {name}.' },
      { who: 'sophi', text: 'So you\'re the one who\'s going to wreck my car. I\'m Sophi. I keep it alive.' },
      { who: 'sophi', text: 'Every race you finish earns the team points. Spend them in the garage and I\'ll make the car faster. A little at a time.' },
    ],
    lose: [
      { who: 'lupis', text: 'Not quite. The track is booked until six. Try again.' },
    ],
  },

  // ---- Chapter 2: Leopard GP ------------------------------------------------------------------
  {
    id: 'shakedown', chapter: 1, title: 'SHAKEDOWN', track: 'NEW ATLANTIS', laps: 3, grid: 'random', aiBuff: 0.01,
    rivals: fillers(3, 0.8, 0.88, [0]),
    goal: { kind: 'and', goals: [{ kind: 'top', n: 3 }, { kind: 'cool' }] }, bonus: { kind: 'win' }, points: 250, bonusPoints: 100,
    intro: [
      { who: 'sophi', text: 'First proper race in the Apex Series. New Atlantis. Four cars.' },
      { who: 'sophi', text: 'I rebuilt the cooling last night and I want to know it works. Top three, and do NOT overheat my car.' },
      { who: 'sophi', text: 'If it gets hot, there\'s a cooling lane on the outside of the main straight. Use it.' },
    ],
    win: [
      { who: 'sophi', text: 'Temperatures held. Car\'s in one piece. I might actually like you.' },
      { who: 'sophi', text: 'And you won it. Okay. I definitely like you.', if: { kind: 'win' } },
    ],
    lose: [
      { who: 'sophi', text: 'That\'s not a shakedown, that\'s a meltdown. Again. Gently this time.', if: { kind: 'not', cond: { kind: 'cool' } } },
      { who: 'sophi', text: 'Temperatures were perfect. The result wasn\'t. Top three, please.', if: { kind: 'cool' } },
    ],
  },
  {
    id: 'enter-judah', chapter: 1, title: 'ENTER JUDAH', track: 'NEW YORK', laps: 3, grid: 'random', aiBuff: 0.015,
    // Judah's debut: he matches whatever you've bought in the garage, so only driving beats him.
    rivals: [JUDAH(0.99, 0.06, true), ROOK(0.88), ...fillers(3, 0.8, 0.88, [0, 4, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'judah' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'judah', text: 'Leopard GP? I thought they folded. What are they running now, a rental?' },
      { who: 'judah', text: 'Stay out of my mirrors, rookie. It\'s a long way down from the Apex.' },
      { who: 'lupis', text: 'Judah. Vanta Racing. Two championships. And a car that is faster than it has any right to be.' },
      { who: 'sophi', text: 'You won\'t outrun him on the straights. Not yet. Get on the podium and let him have his parade.' },
    ],
    win: [
      { who: 'judah', text: '...What.', if: { kind: 'beat', who: 'judah' } },
      { who: 'judah', text: 'Enjoy it, rookie. That doesn\'t happen twice.', if: { kind: 'beat', who: 'judah' } },
      { who: 'sophi', text: 'You beat Judah. In OUR car. I need to sit down.', if: { kind: 'beat', who: 'judah' } },
      { who: 'lupis', text: 'Vanta will not take that quietly. Be ready for them.', if: { kind: 'beat', who: 'judah' } },
      { who: 'judah', text: '{place} in a rental. Cute.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
      { who: 'sophi', text: 'His car pulled away like we were standing still. Nobody gets that kind of pace legally.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
      { who: 'lupis', text: 'Rumors are not evidence, Sophi. Points are. Keep scoring them.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
    ],
    lose: [
      { who: 'judah', text: 'You beat me and still missed the podium? Somebody explain this team to me.', if: { kind: 'beat', who: 'judah' } },
      { who: 'sophi', text: '...That\'s a first. Let\'s fix the missing-the-podium part.', if: { kind: 'beat', who: 'judah' } },
      { who: 'judah', text: 'Told you. Long way down.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
    ],
  },
  {
    id: 'penalty', chapter: 1, title: 'BACK OF THE GRID', track: 'CRYSTAL FRONT', laps: 3, grid: 'back', aiBuff: 0.02,
    rivals: [ROOK(0.9), ...fillers(4, 0.82, 0.9, [0, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'rook' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'lupis', text: 'Vanta filed a protest about our "unsafe driving" in the streets. The stewards agreed with them.' },
      { who: 'lupis', text: 'You start from the back. Judah, of course, sits this one out to "rest".' },
      { who: 'sophi', text: 'Crystal Front is all switchbacks, through the old war zone. Drift the long corners: it charges the boost. Then spend it on the way out.' },
    ],
    win: [
      { who: 'sophi', text: 'Last to the podium. On the front.' },
      { who: 'sophi', text: 'And you took Rook. He\'s going to hear about that from Judah.', if: { kind: 'beat', who: 'rook' } },
      { who: 'rook', text: '...Fine driving, Leopard. Don\'t tell him I said that.', if: { kind: 'beat', who: 'rook' } },
      { who: 'rook', text: 'Nice recovery, Leopard. Still behind me, though.', if: { kind: 'not', cond: { kind: 'beat', who: 'rook' } } },
    ],
    lose: [
      { who: 'lupis', text: 'The stewards will be pleased. I am not. Again, please.' },
    ],
  },

  // ---- Chapter 3: The Climb -------------------------------------------------------------------
  {
    id: 'last-ride', chapter: 2, title: 'CHARLIE\'S LAST RIDE', track: 'LAPPLAND', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [CHARLIE(0.93), ...fillers(4, 0.84, 0.92, [0, 3])],
    goal: { kind: 'beat', who: 'charlie' }, bonus: { kind: 'win' }, points: 350, bonusPoints: 150,
    intro: [
      { who: 'charlie', text: 'Leopard GP let me have one more go. Lappland. My favorite road in the world.' },
      { who: 'charlie', text: 'I\'m not here to make friends, {name}. I want to see what they\'ve taught you. Don\'t you dare lift for me.' },
    ],
    win: [
      { who: 'charlie', text: 'Ha! There it is. You\'re better than I ever was. Don\'t let it go to your head.' },
      { who: 'charlie', text: 'Now go beat that smug Vanta kid for me.' },
    ],
    lose: [
      { who: 'charlie', text: 'Twenty-two years, kid. The mountain still likes me better. Again.' },
    ],
  },
  {
    id: 'mirage', chapter: 2, title: 'MIRAGE', track: 'HIEROPOLIS', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [ROOK(0.95), JUDAH(0.96, 0.05), ...fillers(3, 0.86, 0.93, [0, 4, 5])],
    goal: { kind: 'beat', who: 'rook' }, bonus: { kind: 'beat', who: 'judah' }, points: 350, bonusPoints: 200,
    intro: [
      { who: 'judah', text: 'Rook. Keep the rookie behind you. That\'s your whole job today.' },
      { who: 'sophi', text: 'Long straights, huge braking zones. DRS opens if you\'re within a second of the car ahead. Use Rook\'s tow.' },
    ],
    win: [
      { who: 'rook', text: 'He\'s going to bench me for that.' },
      { who: 'judah', text: '...The heat haze. That\'s all that was. Don\'t get used to it.', if: { kind: 'beat', who: 'judah' } },
      { who: 'judah', text: 'Enjoy it, rookie. Wins against Rook don\'t count.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
    ],
    lose: [
      { who: 'judah', text: 'See? Rook earns his money.' },
    ],
  },
  {
    id: 'sabotage', chapter: 2, title: 'SABOTAGE', track: 'HANGING GARDENS', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [JUDAH(0.97, 0.05), ROOK(0.95), ...fillers(3, 0.88, 0.95, [0, 4, 5])],
    startHeat: 0.55,
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'judah' }, points: 400, bonusPoints: 200,
    intro: [
      { who: 'sophi', text: 'Someone was in our garage last night. The coolant line\'s been cut. Clean cut.' },
      { who: 'sophi', text: 'No time to fix it. You\'re starting hot. Very hot. Get to the cooling lane on the straight and stay off the walls.' },
      { who: 'lupis', text: 'Vanta\'s garage is next to ours. I\'m sure that\'s a coincidence.' },
    ],
    win: [
      { who: 'sophi', text: 'You podiumed with a cut coolant line. I\'m framing that car.' },
      { who: 'judah', text: '...With a cut coolant line? That\'s not possible.', if: { kind: 'beat', who: 'judah' } },
      { who: 'lupis', text: 'Interesting, Judah. How would you know it was cut?', if: { kind: 'beat', who: 'judah' } },
      { who: 'judah', text: 'Shame about your cooling. These old cars are so fragile.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
      { who: 'lupis', text: 'Careful, Judah. That sounded almost like a confession.', if: { kind: 'not', cond: { kind: 'beat', who: 'judah' } } },
    ],
    lose: [
      { who: 'sophi', text: 'It cooked. Not your fault. Well, partly your fault. Again.', if: { kind: 'not', cond: { kind: 'cool' } } },
      { who: 'sophi', text: 'You kept it cool, I\'ll give you that. Now keep it on the podium. Again.', if: { kind: 'cool' } },
    ],
  },

  // ---- Chapter 4: The Apex --------------------------------------------------------------------
  {
    id: 'rivals', chapter: 3, title: 'RIVALS', track: 'NEW ATLANTIS', laps: 4, grid: 'random', aiBuff: 0.015,
    rivals: [JUDAH(0.95, 0.02), ROOK(0.95), ...fillers(3, 0.9, 0.95, [0, 4, 5])],
    goal: { kind: 'beat', who: 'judah' }, bonus: { kind: 'win' }, points: 450, bonusPoints: 200,
    intro: [
      { who: 'lupis', text: 'I should tell you something, {name}. Leopard GP\'s owners pull the funding at the end of this season unless we win the title.' },
      { who: 'lupis', text: 'This season is all we have. You, Sophi, that car. That is the whole team.' },
      { who: 'judah', text: 'Heard your team\'s closing down. I\'ll send flowers.' },
      { who: 'sophi', text: 'Beat him. Just once. Show him he can be beaten.', if: { kind: 'not', cond: { kind: 'flag', flag: 'beat-judah' } } },
      { who: 'sophi', text: "You've beaten him before. Do it again, now, when it actually matters.", if: { kind: 'flag', flag: 'beat-judah' } },
    ],
    win: [
      { who: 'announcer', text: 'JUDAH BEATEN! The Leopard GP rookie has put the champion behind them!' },
      { who: 'sophi', text: 'And the win! Not just ahead of him. Ahead of everyone.', if: { kind: 'win' } },
      { who: 'judah', text: 'One race. Lucky. The final is a different story.' },
    ],
    lose: [
      { who: 'judah', text: 'Same story every time. Long way down, rookie.', if: { kind: 'not', cond: { kind: 'flag', flag: 'beat-judah' } } },
      { who: 'judah', text: "Not so lucky this time, rookie. Whatever you did before, it's gone.", if: { kind: 'flag', flag: 'beat-judah' } },
    ],
  },
  {
    id: 'final', chapter: 3, title: 'THE APEX', track: 'APEX ARENA', laps: 5, grid: 'back', aiBuff: 0.01,
    rivals: [JUDAH(0.96, 0.025), ROOK(0.93), CHARLIE(0.92), ...fillers(2, 0.88, 0.93, [0, 3, 4, 5])],
    goal: { kind: 'win' }, bonus: { kind: 'cool' }, points: 600, bonusPoints: 250,
    unlocks: 'ROOKIE SEASON COMPLETE. Every mission can be replayed from the story menu.',
    intro: [
      { who: 'announcer', text: 'The season final at the Apex Arena. Win it and the title goes to Leopard GP. Lose it and it\'s Judah\'s third.' },
      { who: 'lupis', text: 'Vanta protested again. You start from the back. Of course you do.' },
      { who: 'charlie', text: 'I talked my way onto the grid. If Judah gets stuck behind me for a lap or two, well. Accidents happen.' },
      { who: 'sophi', text: 'The car\'s everything I\'ve got. Five laps. Go get it, {name}.' },
      { who: 'judah', text: 'Back of the grid, rookie. Right where you belong.' },
    ],
    win: [
      { who: 'announcer', text: 'LEOPARD GP ARE THE CHAMPIONS! From the county speedway to the top of the Apex Series in one season!' },
      { who: 'judah', text: '...Good race. I mean it. Next year I won\'t need the help.' },
      { who: 'sophi', text: 'Not a scratch on it. Okay, a few scratches. I don\'t care!' },
      { who: 'charlie', text: 'Twenty-two years I waited to see somebody drive like that. Worth it.' },
      { who: 'lupis', text: 'The owners called. The funding is renewed. Welcome to your second season, champion.' },
    ],
    lose: [
      { who: 'judah', text: 'Three titles. Thanks for making it interesting.', if: { kind: 'winner', who: 'judah' } },
      { who: 'rook', text: 'Vanta takes it anyway. Sorry, Leopard. Not that sorry.', if: { kind: 'winner', who: 'rook' } },
      { who: 'charlie', text: 'Twenty-two years and I finally win the big one. Sorry, kid. Couldn\'t help myself.', if: { kind: 'winner', who: 'charlie' } },
      { who: 'judah', text: 'Not even on the podium of my own coronation? You were ahead of me today, rookie. It won\'t last.', if: { kind: 'beat', who: 'judah' } },
      { who: 'sophi', text: 'We\'re not done. One more go. Please.' },
    ],
  },
];

// --- garage -------------------------------------------------------------------------------------

export type UpgradeId = 'speed' | 'accel' | 'control' | 'heat' | 'boost';

export interface Upgrade { id: UpgradeId; name: string; blurb: string; perLevel: number; stat: keyof Mods }

/** Small steps on purpose: the AI gets faster each chapter, so the upgrades keep you in the fight. */
export const UPGRADES: Upgrade[] = [
  { id: 'speed', name: 'TOP SPEED', blurb: '+1% top speed per level', perLevel: 0.01, stat: 'top' },
  { id: 'accel', name: 'ACCELERATION', blurb: '+1% pull per level', perLevel: 0.01, stat: 'accel' },
  { id: 'control', name: 'CONTROL', blurb: '+2% cornering grip per level', perLevel: 0.02, stat: 'grip' },
  { id: 'heat', name: 'HEAT RESISTANCE', blurb: '-3% heat from hits per level', perLevel: 0.03, stat: 'heat' },
  { id: 'boost', name: 'BOOST', blurb: '+3% boost power per level', perLevel: 0.03, stat: 'ers' },
];
export const MAX_LEVEL = 10;

/** Points to buy the next level when at `level`. */
export function upgradeCost(level: number): number { return 80 + level * 40; }

/** The player's car mods from their garage levels. */
export function playerMods(save: Save): Mods {
  const m: Mods = { ...NO_MODS };
  for (const u of UPGRADES) m[u.stat] += (save.upgrades[u.id] ?? 0) * u.perLevel;
  return m;
}

/** An AI car's mods: the mission's field-wide buff plus the driver's own edge. */
/**
 * Story rivals keep pace with the garage: every one of them gets UPGRADE_MATCH of the player's
 * upgrades, so upgrades give a small edge but never buy a win. A rival with matchPlayer (Judah's
 * debut) gets all of them, so only driving beats him.
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
  /** Moments the story remembers across missions, e.g. 'beat-judah'. */
  flags?: string[];
  bonus: string[];
}

const SAVE_KEY = 'skyfold-story';

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    return { name: s.name ?? 'ROOKIE', points: s.points ?? 0, upgrades: s.upgrades ?? {}, done: s.done ?? [], bonus: s.bonus ?? [], flags: s.flags ?? [] };
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
    case 'win': return 'Win the race';
    case 'top': return `Finish in the top ${goal.n}`;
    case 'beat': return `Finish ahead of ${CHARACTERS[goal.who].name}`;
    case 'lap': return `Set a lap under ${goal.seconds.toFixed(1)} s`;
    case 'cool': return 'Never overheat';
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

/** Fill {name} and {place} into a line. */
export function say(text: string, save: Save, place = 0): string {
  return text.replace(/\{name\}/g, save.name).replace(/\{place\}/g, `P${place}`);
}
