// Online screens: pick a name and host or join, then the lobby (the race code, who's in, car
// picks, and for the host the track, laps and AI cars). Plain DOM, using menu.ts's styles.

import { LAP_CHOICES, SEASON_CHOICES, CarChoice, SkinChoice, TrackChoice, cardFace, skinCards } from './menu';
import { LobbyState } from './net';

export interface LobbyHandlers {
  host(name: string): void;
  join(code: string, name: string): void;
  pickCar(car: number): void;
  setTrack(track: number): void;
  setLaps(laps: number): void;
  setAi(ai: number): void;
  /** Car-to-car contact on or off. */
  setContact(on: boolean): void;
  /** 1 = single race; more = a season of that many races. */
  setRaces(races: number): void;
  start(): void;
  leave(): void;
  /** Open the TRAIN DRAGON screen for my car. */
  tune(): void;
  /** Wear a skin ('stock' = the car's own colours). */
  equip(skin: string): void;
  /** Open the Garage (skins and achievements). */
  garage(): void;
}

const CSS = `
.ol-card { width: min(980px, calc(100% - 32px)); margin: auto; padding: 26px 34px 22px; border-radius: 4px; text-align: left; position: relative;
  color: #e9e0cc; font-family: 'Alegreya Sans', system-ui, sans-serif;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 118px, rgba(0,0,0,0.28) 118px 120px),
    linear-gradient(180deg, rgba(52,38,26,0.97), rgba(30,22,16,0.97));
  box-shadow: 0 0 0 2px #2a2724, 0 0 0 3px rgba(176,122,62,0.55), inset 0 0 0 6px rgba(0,0,0,0.25), 0 24px 60px -20px rgba(0,0,0,0.9); }
.ol-card::before, .ol-card::after { content: ''; position: absolute; top: 0; bottom: 0; width: 10px; background: linear-gradient(90deg, #3a3632, #55504a, #2e2b28); }
.ol-card::before { left: 8px; } .ol-card::after { right: 8px; }
.ol-card > * { position: relative; z-index: 1; }
.ol-card h2 { margin: 0 0 6px; font: 400 40px 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.08em; color: transparent;
  background: linear-gradient(180deg, #f3e6c8 10%, #d6a462 60%, #8a5a2b); -webkit-background-clip: text; background-clip: text;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.55)); }
.ol-sub { color: #a89d8a; font: 500 13px 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.24em; margin-bottom: 16px; }
.ol-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.ol-input { flex: 1; min-width: 180px; padding: 13px 15px; border-radius: 3px; border: 1px solid #5a4632; background: #17110c; color: #f1e6d0;
  font: 700 20px 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.6); }
.ol-input:focus { outline: none; border-color: #c98b3e; box-shadow: inset 0 2px 6px rgba(0,0,0,0.6), 0 0 0 1px #c98b3e; }
.ol-err { color: #d9654a; font-weight: 700; margin: 4px 0 12px; }
.ol-code { font: 400 54px 'Uncial Antiqua', Georgia, serif; letter-spacing: 0.22em; color: #e0a861;
  text-shadow: 0 3px 0 rgba(0,0,0,0.6), 0 0 22px rgba(224,168,97,0.25); }
.ol-cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 22px; }
@media (max-width: 800px) { .ol-cols { grid-template-columns: 1fr; } }
.ol-players { list-style: none; padding: 0; margin: 0 0 12px; }
.ol-players li { display: flex; justify-content: space-between; padding: 9px 12px; border-radius: 3px; margin-bottom: 6px;
  background: rgba(20,15,11,0.7); border: 1px solid #4a3a2a; border-left: 3px solid #b07a3e; font-weight: 700; letter-spacing: 0.08em; }
.ol-players li small { color: #a89d8a; font: 600 11px 'Alegreya Sans SC', system-ui, sans-serif; letter-spacing: 0.16em; }
.ol-label { color: #c98b3e; font: 600 12px 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.24em; margin: 12px 0 6px; }
.ol-label::before { content: 'ᛟ '; color: #8a5a2b; }
.ol-cars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.ol-cars .hr-car { padding: 10px 4px 12px; border-radius: 40px 40px 6px 6px; }
.ol-cars .hr-car img { max-width: 96px; margin-bottom: 2px; }
.ol-cars .hr-car b { font-size: 15px; }
.ol-cars .hr-car span { font-size: 9px; }
.ol-skins .hr-skin-hint { font-size: 11px; }
.ol-cars .hr-car:disabled { opacity: 0.3; cursor: default; transform: none; }
.ol-tracks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.ol-tracks button { padding: 8px 6px; border-radius: 3px; border: 1px solid #4a3a2a; background: linear-gradient(180deg, #3a2a1e, #261b13); color: #d8ccb0;
  font: 600 12px 'Alegreya Sans SC', 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.1em; cursor: pointer; }
.ol-tracks button:hover:not(:disabled) { border-color: #b07a3e; color: #fff; }
.ol-tracks button.on { border-color: #8fd0e0; color: #f1f8fa; background: linear-gradient(180deg, #2c4a55, #1b2c33); box-shadow: 0 0 14px -4px #8fd0e0; }
.ol-tracks button:disabled { cursor: default; }
.ol-wait { color: #a89d8a; font: italic 500 15px 'Alegreya Sans', system-ui, sans-serif; letter-spacing: 0.06em; margin-top: 12px; }
.ol-board { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; margin-bottom: 8px; }
.ol-board th { color: #a8743a; font-size: 10px; letter-spacing: 0.16em; font-weight: 700; text-align: right; padding: 0 6px 5px; }
.ol-board th:nth-child(-n+2) { text-align: left; }
.ol-board td { padding: 6px; font-weight: 800; font-size: 13px; text-align: right; border-top: 1px solid rgba(168,116,58,0.18); }
.ol-board td:nth-child(-n+2) { text-align: left; }
.ol-board tr.me td { background: rgba(143,208,224,0.08); }
.ol-board .lead { color: #c98b3e; }
`;

export class LobbyUI {
  private el: HTMLDivElement;

  private skins: SkinChoice[] = [];
  private equipped = 'stock';
  /** The unlocked skins offered under the cars, and the one being worn. */
  setSkins(skins: SkinChoice[], equipped: string): void { this.skins = skins; this.equipped = equipped; }

  constructor(private cars: CarChoice[], private tracks: TrackChoice[], private on: LobbyHandlers) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    document.body.append(this.el);
  }

  get visible(): boolean { return !this.el.classList.contains('hidden'); }
  hide(): void { this.el.classList.add('hidden'); }

  /** Name, then Host a race or Join one with a code. */
  showMenu(name: string, error = ''): void {
    this.render(`
      <div class="ol-card" style="max-width:560px">
        <h2>THE MOOT</h2>
        <div class="ol-sub">FLY AGAINST YOUR FRIENDS · UP TO 6 RIDERS</div>
        <div class="ol-label">YOUR NAME</div>
        <div class="ol-row"><input class="ol-input" data-name maxlength="12" value="${esc(name)}" placeholder="NAME"></div>
        ${error ? `<div class="ol-err">${esc(error)}</div>` : ''}
        <div class="ol-label">CALL A MOOT</div>
        <div class="ol-row"><button class="hr-btn" data-host>HOST</button><span class="ol-sub" style="margin:0">You'll be given a code to send to your friends.</span></div>
        <div class="ol-label">OR JOIN WITH A CODE</div>
        <div class="ol-row"><input class="ol-input" data-code maxlength="5" placeholder="CODE" style="max-width:200px">
          <button class="hr-btn secondary" data-join>JOIN</button></div>
        <div class="ol-row" style="margin:18px 0 0"><button class="hr-btn secondary" data-leave>BACK</button></div>
      </div>`);
    const nameOf = () => (this.el.querySelector<HTMLInputElement>('[data-name]')!.value.trim().toUpperCase() || 'RIDER').slice(0, 12);
    this.el.querySelector('[data-host]')!.addEventListener('click', () => this.on.host(nameOf()));
    const join = () => {
      const code = this.el.querySelector<HTMLInputElement>('[data-code]')!.value.trim().toUpperCase();
      if (code.length === 5) this.on.join(code, nameOf());
    };
    this.el.querySelector('[data-join]')!.addEventListener('click', join);
    this.el.querySelector('[data-leave]')!.addEventListener('click', () => this.on.leave());
    // Keep typing in these boxes from steering or pausing the game behind.
    this.el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' && i.hasAttribute('data-code')) join();
    }));
  }

  /** A short status while connecting. */
  showStatus(text: string): void {
    this.render(`<div class="ol-card" style="max-width:480px"><h2>THE MOOT</h2><div class="ol-wait">${esc(text)}</div>
      <div class="ol-row" style="margin:18px 0 0"><button class="hr-btn secondary" data-leave>CANCEL</button></div></div>`);
    this.el.querySelector('[data-leave]')!.addEventListener('click', () => this.on.leave());
  }

  /** The lobby: the code, who's in, cars, and (host only) the race settings. */
  showLobby(lobby: LobbyState, me: string, isHost: boolean, code: string): void {
    const mine = lobby.players.find((p) => p.id === me);
    const taken = new Set(lobby.players.filter((p) => p.id !== me).map((p) => p.car));
    const maxAi = Math.max(0, 6 - lobby.players.length);
    const players = lobby.players.map((p) => `<li><span style="color:${this.cars[p.car].color}">${esc(p.name)}${p.id === me ? ' (YOU)' : ''}</span>
      <small>${this.cars[p.car].name}${p === lobby.players[0] ? ' · HOST' : ''}</small></li>`).join('')
      + (lobby.ai ? `<li><span style="color:#a89d8a">AI × ${Math.min(lobby.ai, maxAi)}</span><small>WILD DRAGONS</small></li>` : '');
    const cars = this.cars.map((c, i) => `<button class="hr-car ${mine?.car === i && this.equipped === 'stock' ? 'selected' : ''}" style="--c:${c.color}" data-car="${i}"
      ${taken.has(i) ? 'disabled' : ''}>${cardFace(c)}</button>`).join('');
    // The session leaderboard: everyone's tally across the races played together in this lobby.
    const meName = mine?.name;
    const rows = [...(lobby.board ?? [])].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
    const board = rows.length ? `<div class="ol-label">TALLY OF THE MOOT</div>
      <table class="ol-board"><thead><tr><th></th><th>PLAYER</th><th>RACES</th><th>WINS</th><th>TOP 3</th><th>GLORY</th><th>BEST LAP</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.name === meName ? 'me' : ''}"><td class="${i === 0 ? 'lead' : ''}">${i + 1}</td><td>${esc(r.name)}</td>
        <td>${r.races}</td><td>${r.wins}</td><td>${r.podiums}</td><td class="${i === 0 ? 'lead' : ''}">${r.points}</td><td>${r.best ? lapTime(r.best) : '-'}</td></tr>`).join('')}
      </tbody></table>` : '';
    const tracks = this.tracks.map((t, i) => `<button data-track="${i}" class="${lobby.track === i ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${t.name}${t.sprint ? ' ◆' : ''}</button>`).join('');
    const seg = (name: string, values: number[], cur: number) => `<div class="hr-seg" data-seg="${name}">${values.map((v) =>
      `<button data-v="${v}" class="${v === cur ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${v}</button>`).join('')}</div>`;
    this.render(`
      <div class="ol-card">
        <div class="ol-cols">
          <div>
            <h2>THE GATHERING</h2>
            <div class="ol-label">MOOT CODE · SEND THIS TO YOUR FRIENDS</div>
            <div class="ol-code">${code}</div>
            <div class="ol-label">RIDERS</div>
            <ul class="ol-players">${players}</ul>
            ${board}
          </div>
          <div>
            <div class="ol-label">YOUR DRAGON</div>
            <div class="ol-cars">${cars}</div>
            <div class="ol-label" style="margin-top:8px">YOUR SKINS</div>
            <div class="ol-cars ol-skins">${skinCards(this.skins, this.equipped)}</div>
            <div class="ol-row" style="margin:0 0 4px;gap:22px">
              <div><div class="ol-label">MODE</div><div class="hr-seg" data-seg="mode">
                <button data-v="1" class="${lobby.races === 1 ? 'on' : ''}" ${isHost ? '' : 'disabled'}>SINGLE RACE</button>
                <button data-v="season" class="${lobby.races > 1 ? 'on' : ''}" ${isHost ? '' : 'disabled'}>SAGA</button></div></div>
              ${lobby.races > 1 ? `<div><div class="ol-label">RACES</div>${seg('races', SEASON_CHOICES, lobby.races)}</div>` : ''}
            </div>
            <div class="ol-label">${lobby.races > 1 ? 'FIRST REALM' : 'REALM'}${isHost ? '' : ' (THE HOST CHOOSES)'}</div>
            <div class="ol-tracks">${tracks}</div>
            <div class="ol-row" style="margin-top:12px;gap:22px">
              ${this.tracks[lobby.track]?.sprint
                ? `<div><div class="ol-label">SPRINT · ONE RUN</div><div style="font:400 20px 'Uncial Antiqua',Georgia,serif;letter-spacing:0.08em;color:#e0a861;padding:6px 0">${this.tracks[lobby.track].sprint} KM</div></div>`
                : `<div><div class="ol-label">LAPS</div>${seg('laps', LAP_CHOICES, lobby.laps)}</div>`}
              <div><div class="ol-label">AI DRAGONS</div>${seg('ai', Array.from({ length: maxAi + 1 }, (_, i) => i), Math.min(lobby.ai, maxAi))}</div>
              <div><div class="ol-label">CONTACT</div><div class="hr-seg" data-seg="contact">
                <button data-v="on" class="${lobby.contact !== false ? 'on' : ''}" ${isHost ? '' : 'disabled'}>ON</button>
                <button data-v="off" class="${lobby.contact === false ? 'on' : ''}" ${isHost ? '' : 'disabled'}>OFF</button></div></div>
            </div>
          </div>
        </div>
        ${isHost ? '<div class="ol-wait" style="margin:10px 0 0">Keep this tab open and in front while flying: your browser runs the race for everyone.</div>' : ''}
        <div class="ol-row" style="margin:18px 0 0">
          ${isHost ? `<button class="hr-btn" data-start>${lobby.races > 1 ? 'BEGIN THE SAGA' : 'TAKE FLIGHT'}</button>` : '<div class="ol-wait">Waiting for the host to sound the horn…</div>'}
          <button class="hr-btn secondary" data-tune>TRAIN DRAGON</button>
          <button class="hr-btn secondary" data-garage>HOARD</button>
          <button class="hr-btn secondary" data-leave>LEAVE</button>
        </div>
      </div>`);
    this.el.querySelector('[data-tune]')!.addEventListener('click', () => this.on.tune());
    this.el.querySelector('[data-garage]')!.addEventListener('click', () => this.on.garage());
    this.el.querySelectorAll<HTMLElement>('[data-car]').forEach((b) => b.addEventListener('click', () => { this.equipped = 'stock'; this.on.equip('stock'); this.on.pickCar(Number(b.dataset.car)); }));
    this.el.querySelectorAll<HTMLElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      this.equipped = b.dataset.skin!;
      this.on.equip(this.equipped);
      if (!b.isConnected) return;   // the host re-rendered the lobby already
      this.el.querySelectorAll<HTMLElement>('[data-skin]').forEach((o) => o.classList.toggle('selected', o === b));
      this.el.querySelectorAll<HTMLElement>('[data-car]').forEach((o) => o.classList.remove('selected'));
    }));
    this.el.querySelectorAll<HTMLElement>('[data-track]').forEach((b) => b.addEventListener('click', () => this.on.setTrack(Number(b.dataset.track))));
    this.el.querySelectorAll<HTMLElement>('[data-seg]').forEach((seg) => seg.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest('button')?.getAttribute('data-v');
      if (v === null || v === undefined) return;
      if (seg.dataset.seg === 'laps') this.on.setLaps(Number(v));
      if (seg.dataset.seg === 'ai') this.on.setAi(Number(v));
      if (seg.dataset.seg === 'contact') this.on.setContact(v === 'on');
      if (seg.dataset.seg === 'races') this.on.setRaces(Number(v));
      if (seg.dataset.seg === 'mode') this.on.setRaces(v === 'season' ? 4 : 1);
    }));
    this.el.querySelector('[data-start]')?.addEventListener('click', () => this.on.start());
    this.el.querySelector('[data-leave]')!.addEventListener('click', () => this.on.leave());
  }

  private render(html: string): void {
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
  }
}

function lapTime(t: number): string {
  const m = Math.floor(t / 60), sec = t - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
