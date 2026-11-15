// Generates the app icons in public/ from one SVG design.
// Run with `npm run icons`; the outputs are committed.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// The basket from the app's empty state (56-unit grid, centre ≈ 28,27.5).
const BODY = "M8 20h40l-4.2 22.4A4 4 0 0 1 39.9 46H16.1a4 4 0 0 1-3.9-3.6L8 20Z";
const HANDLES = "M19 20 26 9M37 20 30 9";
const SLATS = "M22 29v8M28 29v8M34 29v8";

/** size: canvas px; glyph: basket width as a fraction of the canvas; radius: corner radius fraction. */
function icon(size, glyph, radius = 0) {
  const s = (size * glyph) / 40;
  const tx = size / 2 - 28 * s, ty = size / 2 - 27.5 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#36C676"/>
      <stop offset="1" stop-color="#1A9150"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="url(#bg)"/>
  <g transform="translate(${tx} ${ty}) scale(${s})" stroke-linecap="round" stroke-linejoin="round">
    <path d="${HANDLES}" fill="none" stroke="#fff" stroke-width="3.4"/>
    <path d="${BODY}" fill="#fff" stroke="#fff" stroke-width="3.4"/>
    <path d="${SLATS}" fill="none" stroke="#1E9E55" stroke-width="3"/>
  </g>
</svg>
`;
}

function png(svg, name) {
  writeFileSync(out(name), new Resvg(svg).render().asPng());
  console.log("wrote", name);
}

png(icon(192, 0.56), "icon-192.png");
png(icon(512, 0.56), "icon-512.png");
// maskable: keep the glyph inside the 80% safe circle
png(icon(512, 0.44), "icon-maskable-512.png");
png(icon(180, 0.56), "apple-touch-icon.png");
writeFileSync(out("favicon.svg"), icon(64, 0.66, 0.225));
console.log("wrote favicon.svg");
