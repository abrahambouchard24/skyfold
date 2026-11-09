// The game's screen style: Atlantean deco. Deep sea-teal panels framed by fine gold hairlines,
// classical capitals for titles, ivory text, gold for what matters, and neon teal only as the
// accent for active states. Screens opt in with the classes below (deco-panel, deco-title...).

const CSS = `
.deco-panel { position: relative; font-family: 'Outfit', system-ui, sans-serif; backdrop-filter: blur(8px); background: linear-gradient(160deg, rgba(11,34,40,0.97), rgba(8,14,26,0.98) 60%);
  border: 1px solid rgba(201,162,74,0.5); border-radius: 18px; color: #ece5d4;
  box-shadow: inset 0 0 0 5px rgba(8,14,26,0.9), inset 0 0 0 6px rgba(201,162,74,0.22), 0 30px 80px -30px rgba(0,0,0,0.8); }
/* Deco corner marks: small gold chevrons in each corner. */
.deco-panel::before, .deco-panel::after { content: ''; position: absolute; width: 18px; height: 18px; border: 1px solid #c9a24a; pointer-events: none; }
.deco-panel::before { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
.deco-panel::after { bottom: 10px; right: 10px; border-left: 0; border-top: 0; }
.deco-title { font-family: 'Outfit', system-ui, sans-serif; font-weight: 300; font-style: normal; letter-spacing: 0.32em;
  background: linear-gradient(180deg, #fffaf0 10%, #f1d79a 55%, #c9a24a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.deco-rule { height: 1px; margin: 8px 0 14px; background: linear-gradient(90deg, transparent, #c9a24a 20%, #c9a24a 80%, transparent); position: relative; }
.deco-rule::after { content: ''; position: absolute; left: 50%; top: -4px; width: 7px; height: 7px; margin-left: -4px; transform: rotate(45deg);
  background: #0b1a22; border: 1px solid #c9a24a; }
.deco-label { color: #c9a24a; font-weight: 700; letter-spacing: 0.24em; font-size: 11px; }
.deco-muted { color: #93aba8; }
.deco-panel .hr-btn { border-radius: 999px; background: linear-gradient(180deg, #f8e2a0, #d4ae58 60%, #b38a35); color: #0b1418;
  font-family: 'Outfit', system-ui, sans-serif; font-weight: 600; letter-spacing: 0.24em; box-shadow: 0 0 0 1px rgba(255,244,214,0.5) inset; }
.deco-panel .hr-btn.secondary { background: transparent; color: #ece5d4; box-shadow: 0 0 0 1px rgba(201,162,74,0.7) inset; }
.deco-panel .hr-btn.secondary:hover { color: #fff6dc; box-shadow: 0 0 0 1px #e8c25a inset, 0 0 18px -6px #e8c25a; }
.deco-panel .hr-seg { background: rgba(8,22,28,0.7); border: 1px solid rgba(201,162,74,0.4); border-radius: 999px; }
.deco-panel .hr-seg button { border-radius: 999px; color: #93aba8; }
.deco-panel .hr-seg button.on { background: #3fe0d0; color: #071214; }
`;

let installed = false;
/** Add the deco styles and the Outfit face (once). */
export function installDeco(): void {
  if (installed) return;
  installed = true;
  // The futurist face for titles and UI text (Cinzel stays for the car cards' lettering).
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700&display=swap';
  document.head.append(font);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}
