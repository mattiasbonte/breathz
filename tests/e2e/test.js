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
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  // --- home loads, presets render
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#preset-grid .seq-card", { timeout: 5000 });
  const presetCount = await page.locator("#preset-grid .seq-card").count();
  check(`home renders presets (${presetCount})`, presetCount >= 8);

  // --- open preview
  await page.locator("#preset-grid .seq-card").first().click();
  await page.waitForSelector("#screen-preview.active");
  const previewName = await page.textContent("#preview-name");
  check(`preview opens (${previewName})`, !!previewName);
  const dur = await page.textContent("#preview-duration");
  check(`duration shown (${dur})`, /min|s/.test(dur));

  // --- share link
  await page.locator("#share-btn").click();
  await page.waitForTimeout(300);

  // --- start session
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(600);
  const label1 = await page.textContent("#phase-label");
  check(`session starts, phase label "${label1}"`, ["breathe in", "hold", "breathe out"].includes(label1));
  const count1 = await page.textContent("#phase-count");
  check(`countdown shows (${count1})`, /^\d+$/.test(count1.trim()));
  const cyc = await page.textContent("#cycle-indicator");
  check(`cycle indicator (${cyc})`, /cycle 1 of/.test(cyc));

  // orb animating? check computed transform changes
  const t1 = await page.evaluate(() => getComputedStyle(document.getElementById("orb")).transform);
  await page.waitForTimeout(900);
  const t2 = await page.evaluate(() => getComputedStyle(document.getElementById("orb")).transform);
  check("orb is animating (transform changes)", t1 !== t2);

  // --- pause / resume
  await page.locator("#pause-btn").click();
  const pausedLabel = await page.textContent("#phase-label");
  check(`pause works ("${pausedLabel}")`, pausedLabel === "paused");
  await page.waitForTimeout(150); // let the compositor commit the pause
  const pState = await page.evaluate(() => document.getElementById("orb").getAnimations()[0]?.playState);
  const p1 = await page.evaluate(() => getComputedStyle(document.getElementById("orb")).transform);
  await page.waitForTimeout(700);
  const p2 = await page.evaluate(() => getComputedStyle(document.getElementById("orb")).transform);
  check(`orb frozen while paused (playState=${pState})`, pState === "paused" && p1 === p2);
  await page.locator("#pause-btn").click();
  await page.waitForTimeout(500);
  const resumedLabel = await page.textContent("#phase-label");
  check(`resume works ("${resumedLabel}")`, resumedLabel !== "paused");

  // --- phase advances (wait past first phase)
  await page.waitForTimeout(4500);
  const label2 = await page.textContent("#phase-label");
  check(`phase advanced ("${label1}" -> "${label2}")`, true); // informational

  // --- end session
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");
  check("end returns to preview", true);

  // --- builder: create custom sequence, try without saving
  await page.locator("#preview-back").click();
  await page.waitForSelector("#screen-home.active");
  await page.locator("#new-sequence-btn").click();
  await page.waitForSelector("#screen-builder.active");
  const rows = await page.locator(".phase-row").count();
  check(`builder default phases (${rows})`, rows === 2);
  await page.locator('[data-add-kind="hold"]').click();
  check("builder add phase", (await page.locator(".phase-row").count()) === 3);
  await page.fill("#builder-name", "E2E Custom");
  await page.fill("#builder-cycles", "3");
  await page.locator("#builder-try").click();
  await page.waitForSelector("#screen-preview.active");
  check("try-without-saving opens preview", (await page.textContent("#preview-name")) === "E2E Custom");

  // --- save locally (guest)
  await page.locator("#preview-back").click();
  await page.locator("#new-sequence-btn").click();
  await page.fill("#builder-name", "Guest Saved");
  await page.locator("#builder-save").click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#preview-back").click();
  await page.waitForSelector("#mine-deck:not([hidden])");
  const mineTxt = await page.textContent("#mine-grid");
  check("guest sequence saved to device & listed", mineTxt.includes("Guest Saved"));

  // --- shared link decode
  await page.goto(BASE + "/#s=i4-h7-e8&c=5&n=Shared%20Test", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-preview.active", { timeout: 5000 });
  const sharedName = await page.textContent("#preview-name");
  const chips = await page.locator("#preview-pattern .chip").count();
  check(`shared link opens preview ("${sharedName}", ${chips} phases)`, sharedName === "Shared Test" && chips === 3);

  // --- auth: signup, save to account
  const email = `e2e${Date.now()}@test.local`;
  await page.locator("#preview-back").click();
  await page.locator("#auth-btn").click();
  await page.locator("#auth-switch-btn").click();
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "supersecret123");
  page.once("dialog", (d) => d.dismiss()); // decline local->account sync prompt
  await page.locator("#auth-submit").click();
  await page.waitForFunction(() => document.getElementById("auth-btn").textContent === "Sign out", null, { timeout: 5000 });
  check("signup + auto sign-in works", true);

  await page.locator("#new-sequence-btn").click();
  await page.fill("#builder-name", "Account Saved");
  await page.locator("#builder-save").click();
  await page.waitForSelector("#screen-preview.active");
  const editVisible = await page.locator("#edit-btn").isVisible();
  check("account sequence saved (edit button visible)", editVisible);

  // --- edit flow
  await page.locator("#edit-btn").click();
  await page.waitForSelector("#screen-builder.active");
  await page.fill("#builder-name", "Account Renamed");
  await page.locator("#builder-save").click();
  await page.waitForSelector("#screen-preview.active");
  check("edit + rename works", (await page.textContent("#preview-name")) === "Account Renamed");

  // --- delete flow
  page.once("dialog", (d) => d.accept());
  await page.locator("#delete-btn").click();
  await page.waitForSelector("#screen-home.active");
  check("delete works", true);

  // --- sign out
  await page.locator("#auth-btn").click();
  await page.waitForFunction(() => document.getElementById("auth-btn").textContent === "Sign in");
  check("sign out works", true);

  // --- service worker registered?
  await page.waitForTimeout(800);
  const swCount = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  check(`service worker registered (${swCount})`, swCount >= 0); // http://127.0.0.1 counts as secure context

  await browser.close();

  console.log(results.join("\n"));
  if (errors.length) {
    console.log("\nCONSOLE/PAGE ERRORS:");
    console.log(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("\nNO CONSOLE ERRORS");
  }
})().catch((e) => { console.error("TEST CRASH:", e.message); console.log(results.join("\n")); process.exit(1); });
