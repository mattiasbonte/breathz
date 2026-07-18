/* Builds dist/breathz.html — the whole app inlined into one self-contained
   document, for single-file hosts (e.g. an R2 bucket). No service worker in
   this build; everything else works identically. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

let html = readFileSync("index.html", "utf8");
const css = readFileSync("css/app.css", "utf8");
const styles = readFileSync("js/styles.js", "utf8");
const model = readFileSync("js/model.js", "utf8");
const qr = readFileSync("js/qr.js", "utf8");
const app = readFileSync("js/app.js", "utf8");
const favicon = readFileSync("icons/favicon.svg").toString("base64");

const replaced = [];
function swap(from, to, label) {
  if (!html.includes(from)) throw new Error(`missing marker: ${label}`);
  // replacement as a function: String.replace treats $', $&, $` in a plain
  // replacement string as patterns — the QR lib's literal `'$'` once spliced
  // the rest of the document into the middle of the inlined script
  html = html.replace(from, () => to);
  replaced.push(label);
}

// A literal "</script" inside inlined JS (the QR library has them in strings)
// terminates the <script> element at HTML-parse time and corrupts the page.
// Backslash-escaping is a no-op inside JS strings and keeps the HTML intact.
function inlineSafe(js) {
  return js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

const png192 = readFileSync("icons/icon-192.png").toString("base64");
const png512 = readFileSync("icons/icon-512.png").toString("base64");

swap('<link rel="stylesheet" href="css/app.css">', `<style>\n${css}\n</style>`, "css");
swap('<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">',
  `<link rel="icon" href="data:image/svg+xml;base64,${favicon}" type="image/svg+xml">`, "favicon");
// keep home-screen icons working from the single file: touch icon and a full
// manifest embedded as data URIs (otherwise "add to home screen" falls back
// to a letter tile)
swap('<link rel="apple-touch-icon" href="icons/icon-192.png">',
  `<link rel="apple-touch-icon" href="data:image/png;base64,${png192}">`, "touch-icon");
const manifest = {
  name: "breathz — breathe with intention",
  short_name: "breathz",
  display: "standalone",
  background_color: "#0a0e1f",
  theme_color: "#0a0e1f",
  icons: [
    { src: `data:image/png;base64,${png192}`, sizes: "192x192", type: "image/png" },
    { src: `data:image/png;base64,${png512}`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};
swap('<link rel="manifest" href="manifest.webmanifest">',
  `<link rel="manifest" href="data:application/manifest+json;base64,${Buffer.from(JSON.stringify(manifest)).toString("base64")}">`,
  "manifest");
swap('<script src="js/qr.js"></script>', `<script>\n${inlineSafe(qr)}\n</script>`, "qr.js");
swap('<script src="js/styles.js"></script>', `<script>\n${inlineSafe(styles)}\n</script>`, "styles.js");
swap('<script src="js/model.js"></script>', `<script>\n${inlineSafe(model)}\n</script>`, "model.js");
swap('<script src="js/app.js"></script>', `<script>\n${inlineSafe(app)}\n</script>`, "app.js");
// no sw.js next to a single file — skip registration cleanly
html = html.replace('navigator.serviceWorker.register("sw.js")', "Promise.resolve()");

// guard: every <script> must close exactly once at HTML-parse level
const opens = (html.match(/<script[\s>]/g) || []).length;
const closes = (html.match(/<\/script>/g) || []).length;
if (opens !== closes) {
  throw new Error(`script tag imbalance: ${opens} opens vs ${closes} closes — inlined JS is corrupting the HTML`);
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/breathz.html", html);
console.log(`dist/breathz.html — ${(html.length / 1024).toFixed(0)} KB (${replaced.join(", ")})`);
