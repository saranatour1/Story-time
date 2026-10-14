// Draws the link-preview cards (public/og*.png, 1200×630) that X, Reddit,
// Discord, Slack, iMessage and WhatsApp show for a Story-time link. Each card
// is HTML rendered by headless Chrome. Rerun after changing the words:
//   node scripts/og-images.mjs
// CHROME=/path/to/chrome overrides where Chrome is looked for.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = resolve(import.meta.dirname, "..");
const font = pathToFileURL(
  join(root, "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2"),
);
const logo = readFileSync(join(root, "public/favicon.svg"), "utf8");

// Each card: a title, two lines under it, and a small line at the foot.
const CARDS = [
  {
    file: "og.png",
    title: "Your trip, in order.",
    lines: ["Everyone who was there adds their photos.", "Played back as a little film, on a map."],
    foot: "private by default · story-time.saranatour.dev",
  },
  {
    file: "og-share.png",
    title: "Shared with you",
    lines: ["Someone shared a trip with you.", "Open it to read the book and play the film."],
    foot: "only people with the link can see it",
  },
  {
    file: "og-invite.png",
    title: "You're invited",
    lines: ["Someone wants you in on their trip.", "Add your photos and see everyone else's."],
    foot: "one invite · one person · story-time.saranatour.dev",
  },
];

const page = ({ title, lines, foot }) => `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: Manrope; src: url("${font}") format("woff2"); font-weight: 200 800; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; background: #12100e; }
  body { position: relative; font-family: Manrope, system-ui, sans-serif; color: #fafaf9; }
  /* The frame: hairlines running off every edge, as on the landing page. */
  .v, .h { position: absolute; background: rgb(255 255 255 / 0.09); }
  .v { top: 0; bottom: 0; width: 1px; }
  .h { left: 0; right: 0; height: 1px; }
  .card { position: absolute; left: 128px; top: 104px; right: 128px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; letter-spacing: -0.01em; }
  .brand svg { width: 40px; height: 40px; }
  h1 { margin-top: 64px; font-size: 84px; font-weight: 800; letter-spacing: -0.035em; line-height: 1; }
  p { font-size: 32px; font-weight: 500; line-height: 1.55; color: #a8a29e; }
  .lines { margin-top: 40px; }
  .foot { position: absolute; left: 128px; top: 514px; font: 500 22px/1 ui-monospace, "SF Mono", Menlo, monospace; color: #78716c; letter-spacing: 0.02em; }
</style>
<div class="v" style="left:64px"></div><div class="v" style="right:64px"></div>
<div class="h" style="top:64px"></div><div class="h" style="bottom:64px"></div>
<div class="card">
  <div class="brand">${logo}Story-time</div>
  <h1>${title}</h1>
  <div class="lines">${lines.map((l) => `<p>${l}</p>`).join("")}</div>
</div>
<div class="foot">${foot}</div>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
for (const card of CARDS) {
  const html = join(dir, card.file.replace(".png", ".html"));
  writeFileSync(html, page(card));
  const out = join(root, "public", card.file);
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      "--virtual-time-budget=2000",
      `--screenshot=${out}`,
      pathToFileURL(html).href,
    ],
    { stdio: "ignore" },
  );
  console.log(`public/${card.file}`);
}
