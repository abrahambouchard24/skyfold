// Online play, peer to peer. The host's browser runs the race; guests send their controls and get
// back a snapshot of every car about 30 times a second. PeerJS's free public server only
// introduces the two browsers; after that they talk to each other directly over WebRTC.

import Peer, { DataConnection } from 'peerjs';
import type { ResultsView } from './menu';
import type { CraftState } from './craft';
import type { Setup } from './setup';

const ID_PREFIX = 'skyfold-race-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I to mix up

export function newCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

// --- messages -----------------------------------------------------------------------------------

export interface LobbyPlayer { id: string; name: string; car: number; setup?: Setup; skin?: string }

/** One player's line in the lobby's session leaderboard (all races played together this session). */
export interface BoardRow { name: string; races: number; wins: number; podiums: number; points: number; best: number; last: number }

/** The lobby as everyone sees it. */
/** races: 1 = a single race; more = a season of that many. */
export interface LobbyState {
  players: LobbyPlayer[]; track: number; laps: number; ai: number; races: number; board?: BoardRow[];
  /** Car-to-car contact; false = cars pass through each other. Missing = on. */
  contact?: boolean;
}

/** One entrant in an online race, in grid order of the cars array. */
export interface NetEntrant { name: string; livery: number; peer: string | null; skin?: string }

/** Per-car state in a snapshot (positions rounded to keep messages small). */
export interface CarSnap {
  x: number; y: number; h: number; vx: number; vy: number;
  gear: number; rev: number; thrust: number; heat: number; over: boolean; energy: number; dep: boolean;
  slip: number; drs: boolean; cool: boolean; drift: boolean;
  /** Height above the ground (sprint jumps); missing from older hosts = 0. */
  alt?: number;
  lap: number; idx: number; next: number; lapStart: number; last: number; best: number;
}

export interface Snapshot {
  t: 'snap';
  time: number; goTime: number;
  cars: CarSnap[];
  /** Indexes into the cars array, in finishing order. */
  finish: number[];
  /** Finish times (from the lights going out) per car index, -1 if still running. */
  times: number[];
  /**
   * Per guest: the full state of their car and the last of their controls the host applied, so
   * the guest's own prediction can reset to it and replay anything newer.
   */
  own: Record<string, { seq: number; s: CraftState }>;
}

/** One frame of a guest's controls. seq counts up from 1 so the host can say which it applied. */
export interface Controls { seq: number; aim: number; brake: boolean; deploy: boolean }

export type ToHost =
  | { t: 'hello'; name: string; car: number; setup?: Setup; skin?: string }
  | { t: 'skin'; skin: string }
  | { t: 'car'; car: number }
  | { t: 'setup'; setup: Setup }
  | ({ t: 'input' } & Controls);

export type ToGuest =
  | { t: 'lobby'; lobby: LobbyState; you: string }
  | { t: 'start'; track: number; laps: number; entrants: NetEntrant[]; title?: string }
  /** The host's results screen (with season standings), for guests to show as-is. */
  | { t: 'results'; view: ResultsView }
  | Snapshot
  | { t: 'toLobby' };

// --- host ---------------------------------------------------------------------------------------

export class Host {
  readonly code = newCode();
  private peer: Peer;
  private conns = new Map<string, DataConnection>();
  /** Each guest's controls not yet applied, oldest first (one is used per physics step). */
  private queues = new Map<string, Controls[]>();
  onJoin: (id: string, name: string, car: number, setup?: Setup, skin?: string) => void = () => {};
  onCar: (id: string, car: number) => void = () => {};
  onSetup: (id: string, setup: Setup) => void = () => {};
  onSkin: (id: string, skin: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onReady: () => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor() {
    this.peer = new Peer(ID_PREFIX + this.code.toLowerCase());
    this.peer.on('open', () => this.onReady());
    this.peer.on('error', (e) => this.onError(friendly(e)));
    this.peer.on('connection', (conn) => {
      conn.on('data', (d) => this.receive(conn, d as ToHost));
      conn.on('close', () => this.drop(conn.peer));
      conn.on('error', () => this.drop(conn.peer));
    });
  }

  private receive(conn: DataConnection, m: ToHost): void {
    if (m.t === 'hello') {
      if (this.conns.size >= 5) { conn.close(); return; }   // 6 cars: the host and up to 5 guests
      this.conns.set(conn.peer, conn);
      this.onJoin(conn.peer, m.name, m.car, m.setup, m.skin);
    } else if (m.t === 'car') {
      this.onCar(conn.peer, m.car);
    } else if (m.t === 'setup') {
      this.onSetup(conn.peer, m.setup);
    } else if (m.t === 'skin') {
      this.onSkin(conn.peer, String(m.skin).slice(0, 24));
    } else if (m.t === 'input') {
      const q = this.queues.get(conn.peer) ?? [];
      q.push({ seq: m.seq, aim: m.aim, brake: m.brake, deploy: m.deploy });
      // If the guest's frames run a little ahead of ours, drop the oldest rather than fall behind.
      while (q.length > 6) q.shift();
      this.queues.set(conn.peer, q);
    }
  }

  private drop(id: string): void {
    if (!this.conns.delete(id)) return;
    this.queues.delete(id);
    this.onLeave(id);
  }

  /** Send to every guest (to one, with `only`). */
  send(m: ToGuest, only?: string): void {
    for (const [id, c] of this.conns) if (!only || id === only) if (c.open) c.send(m);
  }

  /** The next of a guest's controls to apply, or null if none has arrived since the last step. */
  nextInput(id: string): Controls | null { return this.queues.get(id)?.shift() ?? null; }

  /** Drop any queued controls (a new race starts from a clean slate). */
  clearInputs(): void { this.queues.clear(); }

  get guests(): number { return this.conns.size; }

  close(): void { this.peer.destroy(); this.conns.clear(); }
}

// --- guest --------------------------------------------------------------------------------------

export class Guest {
  private peer: Peer;
  private conn: DataConnection | null = null;
  onMessage: (m: ToGuest) => void = () => {};
  onClose: () => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor(code: string, name: string, car: number, setup?: Setup, skin?: string) {
    this.peer = new Peer();
    this.peer.on('error', (e) => this.onError(friendly(e)));
    this.peer.on('open', () => {
      const conn = this.peer.connect(ID_PREFIX + code.trim().toLowerCase(), { reliable: true });
      this.conn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name, car, setup, skin } satisfies ToHost));
      conn.on('data', (d) => this.onMessage(d as ToGuest));
      conn.on('close', () => this.onClose());
      conn.on('error', () => this.onClose());
    });
  }

  send(m: ToHost): void { if (this.conn?.open) this.conn.send(m); }

  close(): void { this.peer.destroy(); }
}

/** PeerJS errors in plain words. */
function friendly(e: unknown): string {
  const type = (e as { type?: string }).type;
  if (type === 'peer-unavailable') return 'No race found with that code. Check it and try again.';
  if (type === 'unavailable-id') return 'That race code is taken. Try hosting again.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')
    return 'Couldn\'t reach the matchmaking server. Check your internet connection.';
  if (type === 'browser-incompatible') return 'This browser can\'t do online races. Try Chrome, Edge or Firefox.';
  return 'Connection problem: ' + (type ?? String(e));
}
