const { chromium } = require("playwright");
const results = [];
const errors = [];
function check(name, cond) {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("http://127.0.0.1:8931", { waitUntil: "networkidle" });
  await page.waitForSelector("#preset-grid .seq-card");

  // ---------- keyboard navigation ----------
  await page.keyboard.press("ArrowRight");
  let focused = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`ArrowRight focuses first card ("${focused}")`, focused === "Box Breathing");
  await page.keyboard.press("ArrowRight");
  focused = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`ArrowRight moves to second card ("${focused}")`, focused === "4-7-8 Relaxing Breath");
  await page.keyboard.press("ArrowDown");
  const afterDown = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`ArrowDown moves a row down ("${afterDown}")`, !!afterDown && afterDown !== focused);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  focused = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`ArrowUp/Left returns to first card ("${focused}")`, focused === "Box Breathing");

  await page.keyboard.press("Enter");
  await page.waitForSelector("#screen-preview.active");
  check("Enter opens preview", true);
  const startFocused = await page.evaluate(() => document.activeElement?.id);
  check(`Begin auto-focused ("${startFocused}")`, startFocused === "start-btn");

  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  const restored = await page.evaluate(() => document.activeElement?.querySelector("h3")?.textContent);
  check(`Esc back restores card focus ("${restored}")`, restored === "Box Breathing");

  // Space starts a session from preview (body-focused)
  await page.keyboard.press("Enter");
  await page.waitForSelector("#screen-preview.active");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Space");
  await page.waitForSelector("#screen-session.active");
  check("Space begins session from preview", true);
  await page.waitForTimeout(700);
  await page.keyboard.press("Space");
  let label = await page.textContent("#phase-label");
  check(`Space pauses ("${label}")`, label === "paused");
  await page.keyboard.press("Space");
  label = await page.textContent("#phase-label");
  check(`Space resumes ("${label}")`, label !== "paused");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-preview.active");
  check("Esc ends session", true);

  // N opens builder from home
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  await page.keyboard.press("n");
  await page.waitForSelector("#screen-builder.active");
  const nameFocused = await page.evaluate(() => document.activeElement?.id);
  check(`N opens builder, name focused ("${nameFocused}")`, nameFocused === "builder-name");
  await page.keyboard.press("Escape"); // first Esc blurs the input…
  await page.keyboard.press("Escape"); // …second navigates back
  await page.waitForSelector("#screen-home.active");

  // ---------- style picker + all 10 styles ----------
  await page.locator("#preset-grid .seq-card").first().click();
  await page.waitForSelector("#screen-preview.active");
  const chipCount = await page.locator(".style-chip").count();
  check(`style picker shows 10 styles (${chipCount})`, chipCount === 10);

  const styles = await page.evaluate(() => window.BreathStyles.map((s) => s.id));
  for (const id of styles) {
    await page.evaluate((sid) => {
      const idx = window.BreathStyles.findIndex((s) => s.id === sid);
      document.querySelectorAll(".style-chip")[idx].click();
    }, id);
    await page.locator("#start-btn").click();
    await page.waitForSelector("#screen-session.active");
    await page.waitForTimeout(2600); // mid-inhale
    const stageChildren = await page.evaluate(() => document.getElementById("stage").children.length);
    const animCount = await page.evaluate(() =>
      document.getElementById("stage").getAnimations({ subtree: true }).length);
    check(`style "${id}": stage built (${stageChildren} nodes), animating (${animCount} anims)`,
      stageChildren > 0 && animCount > 0);
    await page.screenshot({ path: `style-${id}.png` });
    await page.locator("#end-btn").click();
    await page.waitForSelector("#screen-preview.active");
  }

  // persistence
  const persisted = await page.evaluate(() => localStorage.getItem("breathz.style"));
  check(`style choice persisted ("${persisted}")`, persisted === styles[styles.length - 1]);

  // ---------- narrow mobile (320px) ----------
  const mob = await browser.newPage({ viewport: { width: 320, height: 640 } });
  await mob.goto("http://127.0.0.1:8931", { waitUntil: "networkidle" });
  await mob.waitForSelector("#preset-grid .seq-card");
  const hasHScroll = await mob.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal scroll at 320px", !hasHScroll);
  await mob.screenshot({ path: "shot-320-home.png" });
  await mob.locator("#preset-grid .seq-card").first().click();
  await mob.waitForSelector("#screen-preview.active");
  const hs2 = await mob.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal scroll in preview at 320px", !hs2);
  await mob.screenshot({ path: "shot-320-preview.png" });

  await browser.close();
  console.log(results.join("\n"));
  console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : "\nNO CONSOLE ERRORS");
})().catch((e) => { console.error("CRASH:", e.message); console.log(results.join("\n")); process.exit(1); });
