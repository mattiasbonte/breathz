/* breathz E2E — static app. Serve the repo root on 127.0.0.1:8931 first:
   python3 -m http.server 8931   (from the repo root) */
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8931";
const results = [];
const errors = [];

function check(name, cond) {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  // --- home: breathing-first hero
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#preset-grid .seq-card");
  const heroName = await page.textContent("#home-seq-name");
  check(`hero shows default practice ("${heroName}")`, heroName === "Box Breathing");
  const heroAnims = await page.evaluate(() =>
    document.getElementById("home-stage").getAnimations({ subtree: true }).length);
  check(`hero demo is breathing (${heroAnims} anims)`, heroAnims > 0);
  const presetCount = await page.locator("#preset-grid .seq-card").count();
  check(`all presets render (${presetCount})`, presetCount === 11);

  // --- moods filter practices
  const moodCount = await page.locator(".mood-chip").count();
  check(`mood chips render (${moodCount})`, moodCount === 6);
  await page.locator('.mood-chip:has-text("anxious")').click();
  const filtered = await page.locator("#preset-grid .seq-card").count();
  const deckTitle = await page.textContent("#deck-title");
  check(`mood filters practices (${filtered}, "${deckTitle}")`,
    filtered === 3 && deckTitle.includes("anxious"));
  const firstCard = await page.locator("#preset-grid .seq-card h3").first().textContent();
  check(`physiological sigh recommended first ("${firstCard}")`, firstCard === "Physiological Sigh");
  const note = await page.textContent("#mood-note");
  check("mood note shown", note.length > 10);
  await page.locator('.mood-chip:has-text("anxious")').click(); // deselect
  check("deselect restores all practices",
    (await page.locator("#preset-grid .seq-card").count()) === 11);

  // --- home Begin goes straight into a session
  await page.locator("#home-begin").click();
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(500);
  const label = await page.textContent("#phase-label");
  check(`home Begin starts session ("${label}")`, ["in", "hold", "out"].includes(label));
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");

  // --- preview: demo runs, edit always available
  const previewAnims = await page.evaluate(() =>
    document.getElementById("demo-stage").getAnimations({ subtree: true }).length);
  check(`preview demo breathing (${previewAnims})`, previewAnims > 0);
  check("edit available on preset", await page.locator("#edit-btn").isVisible());
  check("delete hidden on preset", await page.locator("#delete-btn").isHidden());

  // --- style selection is reflected in share encoding
  await page.evaluate(() => {
    const idx = window.BreathStyles.findIndex((s) => s.id === "tide");
    document.querySelectorAll(".style-chip")[idx].click();
  });
  const styleNow = await page.evaluate(() => localStorage.getItem("breathz.style"));
  check(`style picker persists (${styleNow})`, styleNow === "tide");

  // --- builder: create tiny sequence to reach the done screen fast
  await page.locator("#preview-back").click();
  await page.waitForSelector("#screen-home.active");
  await page.locator("#new-sequence-btn").click();
  await page.waitForSelector("#screen-builder.active");
  await page.fill("#builder-name", "Tiny Test");
  await page.fill("#builder-cycles", "1");
  await page.evaluate(() => {
    document.querySelectorAll(".phase-row input[type=range]").forEach((r) => {
      r.value = 0.5; r.dispatchEvent(new Event("input"));
    });
  });
  await page.locator("#builder-save").click();
  await page.waitForSelector("#screen-preview.active");
  check("custom sequence saved locally", (await page.textContent("#preview-name")) === "Tiny Test");
  check("delete visible on own sequence", await page.locator("#delete-btn").isVisible());

  // --- session finishes -> mood journal
  await page.locator("#start-btn").click();
  await page.waitForSelector("#session-done:not([hidden])", { timeout: 8000 });
  const summary = await page.textContent("#done-summary");
  check(`done screen with summary ("${summary.slice(0, 42)}…")`, summary.includes("Tiny Test"));
  check("mood question shown", await page.locator("#mood-row").isVisible());
  await page.locator('.mood-btn[data-mood="calmer"]').click();
  check("mood thanks shown", await page.locator("#mood-thanks").isVisible());
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem("breathz.journal")));
  check(`journal recorded with mood (${journal?.[0]?.mood})`,
    journal?.length === 1 && journal[0].mood === "calmer" && journal[0].seq === "Tiny Test");

  // --- last practice becomes home hero
  await page.locator("#done-home-btn").click();
  await page.waitForSelector("#screen-home.active");
  check("hero updates to last practice",
    (await page.textContent("#home-seq-name")) === "Tiny Test");

  // --- shared link (fresh navigation) applies style + opens preview
  await page.goto(BASE + "/#s=i4-h7-e8&c=5&n=Shared%20Test&v=bloom", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-preview.active");
  check("shared link opens preview", (await page.textContent("#preview-name")) === "Shared Test");
  const appliedStyle = await page.textContent(".style-chip.selected");
  check(`shared link applies style ("${appliedStyle}")`, appliedStyle === "Bloom");

  // --- keyboard essentials
  await page.locator("#preview-back").click();
  await page.waitForSelector("#screen-home.active");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Space"); // begins home practice
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  check(`space pauses ("${await page.textContent("#phase-label")}")`,
    (await page.textContent("#phase-label")) === "paused");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-preview.active");
  await page.keyboard.press("ArrowLeft");
  await page.waitForSelector("#screen-home.active");
  check("keyboard: space begin/pause, esc end, left back", true);

  // arrows move between cards
  await page.keyboard.press("ArrowRight");
  const focused = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`arrows focus cards ("${focused}")`, !!focused);

  // --- all 10 styles animate in a session
  await page.evaluate(() => localStorage.removeItem("breathz.lastSeq"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#preset-grid .seq-card").first().click();
  const styleIds = await page.evaluate(() => window.BreathStyles.map((s) => s.id));
  check(`11 styles present (${styleIds.length})`, styleIds.length === 11);
  for (const id of styleIds) {
    await page.evaluate((sid) => {
      const idx = window.BreathStyles.findIndex((s) => s.id === sid);
      document.querySelectorAll(".style-chip")[idx].click();
    }, id);
    await page.locator("#start-btn").click();
    await page.waitForSelector("#screen-session.active");
    await page.waitForTimeout(1200);
    const anims = await page.evaluate(() =>
      document.getElementById("stage").getAnimations({ subtree: true }).length);
    check(`style "${id}" animates (${anims})`, anims > 0);
    await page.locator("#end-btn").click();
    await page.waitForSelector("#screen-preview.active");
  }

  // --- per-practice default animations
  await page.locator("#preview-back").click();
  await page.waitForSelector("#screen-home.active");
  for (const [practice, styleId, styleName] of [
    ["Box Breathing", "box", "Box Trace"],
    ["Triangle Breathing", "triangle", "Triangle"],
    ["Coherent Breathing", "sway", "Sway"],
    ["Ujjayi Pace", "tide", "Tide"],
  ]) {
    await page.locator(`#preset-grid .seq-card:has-text("${practice}")`).click();
    await page.waitForSelector("#screen-preview.active");
    const sel = await page.textContent(".style-chip.selected");
    check(`"${practice}" defaults to ${styleId} ("${sel}")`, sel === styleName);
    await page.locator("#preview-back").click();
    await page.waitForSelector("#screen-home.active");
  }

  // triangle style: dot actually traces during a triangle session
  await page.locator('#preset-grid .seq-card:has-text("Triangle Breathing")').click();
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(1500);
  const triDot = await page.evaluate(() => {
    const dot = document.querySelector("#stage .tri-dot");
    return dot ? getComputedStyle(dot).transform : null;
  });
  check(`triangle dot animating (${!!triDot})`, !!triDot && triDot !== "none");
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");

  // --- pwa bits
  const swCount = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length);
  check(`service worker registered (${swCount})`, swCount >= 1);

  // --- mobile 320px: no horizontal scroll
  const mob = await browser.newPage({ viewport: { width: 320, height: 640 } });
  await mob.goto(BASE, { waitUntil: "networkidle" });
  await mob.waitForSelector("#preset-grid .seq-card");
  const hs = await mob.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal scroll at 320px", !hs);

  await browser.close();
  console.log(results.join("\n"));
  console.log(errors.length ? "\nCONSOLE/PAGE ERRORS:\n" + errors.join("\n") : "\nNO CONSOLE ERRORS");
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error("TEST CRASH:", e.message); console.log(results.join("\n")); process.exit(1); });
