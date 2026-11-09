// The game's screen style: Atlantean deco. Deep sea-teal panels framed by fine gold hairlines,
// classical capitals for titles, ivory text, gold for what matters, and neon teal only as the
// accent for active states. Screens opt in with the classes below (deco-panel, deco-title...).

const CSS = `
/* Panels: dark timber planks in an iron band, bronze studs in the corners. */
.deco-panel { position: relative; font-family: 'Alegreya Sans', system-ui, sans-serif; color: #e9e0cc;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,0.014) 0 3px, transparent 3px 13px), linear-gradient(180deg, #2e2620, #1b1613 70%);
  border: 2px solid #4a3c2e; border-radius: 8px;
  box-shadow: inset 0 0 0 5px rgba(0,0,0,0.35), inset 0 0 0 6px rgba(168,116,58,0.3), 0 30px 80px -30px rgba(0,0,0,0.9); }
.deco-panel::before, .deco-panel::after { content: ''; position: absolute; width: 10px; height: 10px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 35% 35%, #f0c27e, #a8743a 55%, #4a2e14); box-shadow: 0 1px 0 rgba(0,0,0,0.6); }
.deco-panel::before { top: 10px; left: 10px; }
.deco-panel::after { bottom: 10px; right: 10px; }
.deco-title { font-family: 'Uncial Antiqua', Georgia, serif; font-weight: 400; font-style: normal; letter-spacing: 0.08em;
  background: linear-gradient(180deg, #f3e6c8 10%, #d6a462 55%, #8a5a2b); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.5)); }
/* A rule with a rune at its centre. */
.deco-rule { height: 1px; margin: 8px 0 14px; background: linear-gradient(90deg, transparent, #8a6040 20%, #8a6040 80%, transparent); position: relative; }
.deco-rule::after { content: 'ᛉ'; position: absolute; left: 50%; top: -10px; transform: translateX(-50%); padding: 0 8px;
  font: 400 16px Georgia, serif; color: #c98b3e; background: #241d18; line-height: 20px; }
.deco-label { font-family: 'Alegreya Sans SC', 'Alegreya Sans', sans-serif; color: #c98b3e; font-weight: 700; letter-spacing: 0.2em; font-size: 11px; }
.deco-muted { color: #a89d8a; }
.deco-panel .hr-btn { border-radius: 4px; background: linear-gradient(180deg, #e0a861, #b07a3e 55%, #7a4e24); color: #1a120b;
  font-family: 'Alegreya Sans SC', 'Alegreya Sans', sans-serif; font-weight: 700; letter-spacing: 0.16em;
  box-shadow: 0 0 0 1px #3a2716, inset 0 1px 0 rgba(255,232,190,0.5); }
.deco-panel .hr-btn.secondary { background: linear-gradient(180deg, #3a2f26, #251e19); color: #e9e0cc; box-shadow: 0 0 0 1px #6a5640; }
.deco-panel .hr-btn.secondary:hover { color: #fff; box-shadow: 0 0 0 1px #c98b3e, 0 0 16px -6px rgba(201,139,62,0.7); }
.deco-panel .hr-seg { background: #1a1512; border: 1px solid #5a4a3a; border-radius: 4px; }
.deco-panel .hr-seg button { border-radius: 3px; color: #a89d8a; }
.deco-panel .hr-seg button.on { background: linear-gradient(180deg, #c4ecf5, #8fd0e0); color: #120e0b; }
`;

let installed = false;
/** Add the panel styles and the Norse faces, Uncial Antiqua and Alegreya Sans (once). */
export function installDeco(): void {
  if (installed) return;
  installed = true;
  // The futurist face for titles and UI text (Cinzel stays for the car cards' lettering).
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Uncial+Antiqua&family=Alegreya+Sans:wght@300;400;500;700;800&family=Alegreya+Sans+SC:wght@500;700&display=swap';
  document.head.append(font);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
}
