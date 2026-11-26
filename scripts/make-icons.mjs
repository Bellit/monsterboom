// Genera los iconos PNG y la imagen para compartir a partir de SVG.
// Uso: node scripts/make-icons.mjs   (los deja en public/)
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../public/', import.meta.url);
const BG = '#1a1726';

const favicon = await readFile(new URL('favicon.svg', OUT), 'utf8');
const inner = favicon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** Icono con fondo (iOS y Android no admiten transparencia en todos los casos). */
const withBg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  <g transform="translate(${pad} ${pad}) scale(${(64 - pad * 2) / 64})">${inner}</g>
</svg>`;

async function png(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(fileURLToPath(new URL(file, OUT)));
  console.log('✓', file);
}

await png(favicon, 48, 'favicon-48.png');
await png(withBg(6), 180, 'apple-touch-icon.png');
await png(withBg(6), 192, 'icon-192.png');
await png(withBg(10), 512, 'icon-512.png');

// ---------- Imagen para compartir (1200×630) ----------
const monsters = [
  ['#6fd34a', 'horns'], ['#a45ae6', 'cyclops'], ['#ff9a3c', 'ears'], ['#3cd0e6', 'blush'],
  ['#ff6fae', 'antennae'], ['#ffd84a', 'spikes'], ['#e6493c', 'fangs'], ['#4a7cff', 'crest'],
];

function monster(x, y, r, color, feature) {
  const dark = 'rgba(0,0,0,0.25)';
  let deco = '';
  if (feature === 'horns' || feature === 'fangs') {
    deco = `<path d="M${x - r * 0.8} ${y - r * 0.35} L${x - r * 0.35} ${y - r * 0.75} L${x - r * 0.95} ${y - r * 1.2}Z M${x + r * 0.8} ${y - r * 0.35} L${x + r * 0.35} ${y - r * 0.75} L${x + r * 0.95} ${y - r * 1.2}Z" fill="${color}" filter="brightness(0.7)"/>`;
  } else if (feature === 'ears') {
    deco = `<path d="M${x - r * 0.85} ${y - r * 0.2} L${x - r * 0.2} ${y - r * 0.85} L${x - r * 0.9} ${y - r * 1.25}Z M${x + r * 0.85} ${y - r * 0.2} L${x + r * 0.2} ${y - r * 0.85} L${x + r * 0.9} ${y - r * 1.25}Z" fill="${color}"/>`;
  } else if (feature === 'antennae') {
    deco = `<path d="M${x - r * 0.3} ${y - r * 0.8} L${x - r * 0.55} ${y - r * 1.35} M${x + r * 0.3} ${y - r * 0.8} L${x + r * 0.55} ${y - r * 1.35}" stroke="${color}" stroke-width="${r * 0.12}"/><circle cx="${x - r * 0.57}" cy="${y - r * 1.42}" r="${r * 0.17}" fill="#fff27a"/><circle cx="${x + r * 0.57}" cy="${y - r * 1.42}" r="${r * 0.17}" fill="#fff27a"/>`;
  } else if (feature === 'spikes' || feature === 'crest') {
    deco = [-2, -1, 0, 1, 2].map((i) => `<path d="M${x + i * r * 0.3 - r * 0.18} ${y - r * 0.8} L${x + i * r * 0.3 + r * 0.18} ${y - r * 0.8} L${x + i * r * 0.35} ${y - r * 1.3}Z" fill="${color}"/>`).join('');
  }
  const eyes = feature === 'cyclops'
    ? `<circle cx="${x}" cy="${y - r * 0.15}" r="${r * 0.42}" fill="#fff"/><circle cx="${x}" cy="${y - r * 0.05}" r="${r * 0.2}" fill="#111122"/>`
    : `<circle cx="${x - r * 0.35}" cy="${y - r * 0.15}" r="${r * 0.3}" fill="#fff"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.15}" r="${r * 0.3}" fill="#fff"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.08}" r="${r * 0.14}" fill="#111122"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.08}" r="${r * 0.14}" fill="#111122"/>`;
  return `<g>
    <ellipse cx="${x}" cy="${y + r * 1.05}" rx="${r * 0.9}" ry="${r * 0.25}" fill="rgba(0,0,0,0.3)"/>
    ${deco}
    <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
    <ellipse cx="${x}" cy="${y + r * 0.55}" rx="${r * 0.75}" ry="${r * 0.35}" fill="${dark}"/>
    ${eyes}
  </g>`;
}

const row = monsters.map(([c, f], i) => monster(150 + i * 128, 470 + (i % 2 ? 12 : -8), 44, c, f)).join('');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="50%" cy="30%" r="75%">
      <stop offset="0" stop-color="#3a2d63"/><stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g font-family="Segoe UI, Arial, sans-serif" font-weight="800" text-anchor="middle">
    <text x="600" y="190" font-size="150" fill="#a5481c">Boom Monsters</text>
    <text x="600" y="180" font-size="150" fill="#ffd84a">Boom <tspan fill="#6fd34a">Monsters</tspan></text>
    <text x="600" y="265" font-size="40" font-weight="600" fill="#d9d3f2">Monstruos, bombas y bloques que vuelan</text>
  </g>
  <g transform="translate(1060 345)">
    <circle r="40" fill="#23213a" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/>
    <rect x="12" y="-58" width="7" height="22" fill="#8c7a5a"/>
    <circle cx="16" cy="-62" r="9" fill="#ffe066"/>
  </g>
  ${row}
</svg>`;
await sharp(Buffer.from(og)).png().toFile(fileURLToPath(new URL('og.png', OUT)));
console.log('✓ og.png');
