// Renders the PWA icons from an inline SVG using the preinstalled Chromium (run once; PNGs are committed).
import { chromium } from "playwright";
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0A0A0A"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <rect x="56" y="56" width="400" height="400" rx="88" fill="#4A5728"/>
    <path d="M136 150h240v52h-94v170h-52V202h-94z" fill="#F5F3F0"/>
    <rect x="136" y="330" width="56" height="42" fill="#C8B89A"/>
    <rect x="320" y="330" width="56" height="42" fill="#C8B89A"/>
  </g></svg>`;
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [["icon-192", 192, 0], ["icon-512", 512, 0], ["icon-maskable-512", 512, 60], ["apple-touch-icon", 180, 20]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<style>html,body{margin:0}</style><img src="data:image/svg+xml,${encodeURIComponent(svg(pad))}" width=${size} height=${size}>`);
  await p.screenshot({ path: `public/icons/${name}.png` });
}
await b.close();
console.log("icons written");
