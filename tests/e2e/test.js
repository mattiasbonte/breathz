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
  await page.addInitScript(() => { localStorage.setItem("breathz.preroll", "0"); localStorage.setItem("breathz.ground", "0"); }); // tests skip countdown + grounding
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
  check(`all presets render (${presetCount})`, presetCount === 23);

  // --- moods filter practices
  const moodCount = await page.locator(".mood-chip").count();
  check(`mood chips render (${moodCount})`, moodCount === 7);
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
    (await page.locator("#preset-grid .seq-card").count()) === 23);

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
  await page.locator('#preset-grid .seq-card:has-text("Box Breathing")').first().click();
  const styleIds = await page.evaluate(() => window.BreathStyles.map((s) => s.id));
  check(`18 styles present (${styleIds.length})`, styleIds.length === 18);
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

  // --- session mute + volume slider
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  check("session mute button visible", await page.locator("#session-sound").isVisible());
  await page.locator("#session-sound").click();
  check("session mute toggles + header syncs",
    (await page.getAttribute("#session-sound", "aria-pressed")) === "true" &&
    (await page.getAttribute("#sound-toggle", "aria-pressed")) === "true");
  await page.keyboard.press("m");
  check("M key mutes during session",
    (await page.getAttribute("#session-sound", "aria-pressed")) === "false");
  await page.locator(".session-sound").hover();
  await page.waitForTimeout(500);
  const sessionSlider = page.locator("#screen-session .vol-slider");
  check("volume slider appears on hover", await sessionSlider.isVisible());
  await sessionSlider.fill("0.9");
  const vol = await page.evaluate(() => localStorage.getItem("breathz.volume"));
  const unmuted = await page.getAttribute("#session-sound", "aria-pressed");
  check(`volume persists (${vol}) and dragging unmutes`, vol === "0.9" && unmuted === "true");
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");

  // --- text editor: line format, bare pattern, JSON
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  await page.locator("#new-sequence-btn").click();
  await page.waitForSelector("#screen-builder.active");
  await page.locator("#builder-mode-toggle").click();
  check("text mode shows textarea", await page.locator("#builder-text").isVisible());
  const roundtrip = await page.inputValue("#builder-text");
  check("textarea prefilled from sliders", roundtrip.includes("in 4") && roundtrip.includes("cycles: 10"));
  await page.fill("#builder-text", "name: Text Made\ncycles: 3\nin 4\nhold 7\nout 8");
  check("live summary parses text", (await page.textContent("#builder-summary")).includes("cycles"));
  await page.locator("#builder-try").click();
  await page.waitForSelector("#screen-preview.active");
  check("text sequence opens preview", (await page.textContent("#preview-name")) === "Text Made");
  const chips478 = await page.locator("#preview-pattern .chip").count();
  check(`text phases correct (${chips478})`, chips478 === 3);

  // bare pattern "4-7-8"
  await page.keyboard.press("Escape");
  await page.locator("#new-sequence-btn").click();
  await page.locator("#builder-mode-toggle").click();
  await page.fill("#builder-text", "4-7-8");
  await page.locator("#builder-try").click();
  await page.waitForSelector("#screen-preview.active");
  check("bare pattern 4-7-8 parses as in-hold-out",
    (await page.locator("#preview-pattern .chip").count()) === 3);

  // JSON paste
  await page.keyboard.press("Escape");
  await page.locator("#new-sequence-btn").click();
  await page.locator("#builder-mode-toggle").click();
  await page.fill("#builder-text",
    '{"name":"JSON Made","cycles":4,"phases":[{"kind":"in","seconds":3},{"kind":"out","seconds":5}]}');
  await page.locator("#builder-try").click();
  await page.waitForSelector("#screen-preview.active");
  check("JSON paste works", (await page.textContent("#preview-name")) === "JSON Made");

  // bad input surfaces an error
  await page.keyboard.press("Escape");
  await page.locator("#new-sequence-btn").click();
  await page.locator("#builder-mode-toggle").click();
  await page.fill("#builder-text", "in 4\nbanana 7");
  const parseErr = await page.textContent("#builder-error");
  check(`bad line surfaces error ("${parseErr.slice(0, 30)}…")`, parseErr.includes("banana"));
  await page.keyboard.press("Escape"); // blur textarea…
  await page.keyboard.press("Escape"); // …then back home
  await page.waitForSelector("#screen-home.active");

  // --- favorites & yours in the unified grid
  // star a mid-list preset -> it sorts to the front (after local sequences)
  await page.locator('#preset-grid .seq-card:has-text("Ujjayi Pace") .fav-star').click();
  await page.waitForTimeout(200);
  const names = await page.locator("#preset-grid .seq-card h3").allTextContents();
  check(`starred preset sorts to front (${names.slice(0, 2).join(" | ")})`,
    names[0] === "Tiny Test" && names[1] === "Ujjayi Pace");
  check("local sequence marked as yours",
    (await page.locator('#preset-grid .seq-card:has-text("Tiny Test") .meta').textContent()).includes("yours"));
  check("no duplicate cards for favorites",
    (await page.locator('#preset-grid .seq-card:has-text("Ujjayi Pace")').count()) === 1);
  // mood filters the whole unified grid, favorites included
  await page.locator('.mood-chip:has-text("balanced")').click();
  check("mood keeps matching favorites",
    (await page.locator('#preset-grid .seq-card:has-text("Ujjayi Pace")').count()) === 1); // Ujjayi is in balanced
  await page.locator('.mood-chip:has-text("balanced")').click();
  await page.locator('.mood-chip:has-text("anxious")').click();
  check("mood hides unrelated favorites and locals",
    (await page.locator('#preset-grid .seq-card:has-text("Ujjayi Pace")').count()) === 0 &&
    (await page.locator('#preset-grid .seq-card:has-text("Tiny Test")').count()) === 0);
  await page.locator('.mood-chip:has-text("anxious")').click(); // deselect
  // unstar via preview fav button -> returns to natural position
  await page.locator('#preset-grid .seq-card:has-text("Ujjayi Pace")').click();
  await page.waitForSelector("#screen-preview.active");
  check("preview fav button pressed", (await page.getAttribute("#fav-btn", "aria-pressed")) === "true");
  await page.locator("#fav-btn").click();
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  const namesAfter = await page.locator("#preset-grid .seq-card h3").allTextContents();
  check("unstar returns preset to natural order", namesAfter[1] !== "Ujjayi Pace");

  // --- grounding card (default behaviour) + in-session guide cues
  await page.evaluate(() => localStorage.removeItem("breathz.ground"));
  await page.locator('#preset-grid .seq-card:has-text("Breath of Fire")').click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#start-btn").click();
  await page.waitForSelector("#session-ground:not([hidden])");
  const groundName = await page.textContent("#ground-name");
  const groundLines = await page.locator("#ground-lines li").count();
  check(`grounding card shows (${groundName}, ${groundLines} lines)`,
    groundName === "Breath of Fire" && groundLines === 3);
  check("grounding card offers a way back", await page.locator("#ground-back").isVisible());
  await page.locator("#ground-back").click();
  await page.waitForSelector("#screen-preview.active");
  check("back from grounding returns to preview", true);
  await page.locator("#start-btn").click();
  await page.waitForSelector("#session-ground:not([hidden])");
  await page.locator("#ground-begin").click();
  await page.waitForSelector("#session-ground[hidden]", { state: "attached" });
  await page.waitForTimeout(700);
  const fireCue = await page.textContent("#guide-cue");
  check(`guide cue shows early ("${fireCue}")`,
    ["passive — belly springs back", "snap the navel in"].includes(fireCue));
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  await page.evaluate(() => localStorage.setItem("breathz.ground", "0"));

  // --- popularity ordering
  const topNames = await page.locator("#preset-grid .seq-card h3").allTextContents();
  const presetTop = topNames.filter((n) => n !== "Tiny Test"); // local sorts first
  check(`popular practices lead (${presetTop.slice(0, 3).join(" | ")})`,
    presetTop[0] === "Box Breathing" && presetTop[1] === "4-7-8 Relaxing Breath" && presetTop[2] === "Physiological Sigh");

  // --- pre-roll countdown (default behaviour)
  await page.evaluate(() => localStorage.setItem("breathz.preroll", "3"));
  await page.locator("#preset-grid .seq-card").first().click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(400);
  const readyLabel = await page.textContent("#phase-label");
  const readyCount = await page.textContent("#phase-count");
  check(`session opens with countdown ("${readyLabel} ${readyCount}")`,
    readyLabel === "ready" && /^[123]$/.test(readyCount.trim()));
  await page.waitForTimeout(3400);
  const breathing = await page.textContent("#phase-label");
  check(`breathing begins after countdown ("${breathing}")`,
    ["in", "hold", "out"].includes(breathing));
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  await page.evaluate(() => localStorage.setItem("breathz.preroll", "0"));

  // --- practitioners: page, by= attribution, practice log
  await page.locator("#practitioners-link").click();
  await page.waitForSelector("#screen-practitioners.active");
  check("practitioners page opens", (await page.textContent(".practitioners-body h2")) === "For practitioners");
  const exUrl = await page.textContent("#pr-example-url");
  check("example link shown", exUrl.includes("&by=Your Name"));
  await page.locator("#pr-example-open").click();
  await page.waitForSelector("#screen-preview.active");
  const byLine = await page.textContent("#preview-by");
  check(`by= shows attribution ("${byLine}")`, byLine === "prepared for you by Your Name");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  // direct hash route
  await page.goto(BASE + "/#practitioners", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-practitioners.active");
  check("hash #practitioners routes to page", true);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  // practice log (journal has entries from earlier in this run)
  check("practice log offer visible", await page.locator("#foot-log").isVisible());
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#log-open").click();
  await page.waitForSelector("#screen-journal.active");
  check("journal page lists sessions",
    (await page.locator("#journal-list li").count()) >= 1 &&
    (await page.textContent("#journal-list")).includes("Tiny Test"));
  await page.keyboard.press("c"); // C copies from the journal page too
  await page.waitForTimeout(200);
  const cLog = await page.evaluate(() => navigator.clipboard.readText());
  check("C key copies log", cLog.startsWith("my breathz practice log"));
  await page.keyboard.press("ArrowLeft"); // left backs out
  await page.waitForSelector("#screen-home.active");
  await page.keyboard.press("l"); // L reopens the log from home
  await page.waitForSelector("#screen-journal.active");
  check("keyboard: L opens log, left backs out, C copies", true);
  await page.locator("#journal-copy").click();
  const log = await page.evaluate(() => navigator.clipboard.readText());
  check("practice log copies from page",
    log.startsWith("my breathz practice log") && log.includes("Tiny Test"));
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");

  // --- programs: multi-part sessions with open holds
  await page.locator('#preset-grid .seq-card:has-text("Power Rounds")').click();
  await page.waitForSelector("#screen-preview.active");
  const segChips = await page.locator("#preview-pattern .chip.seg").count();
  check(`program preview shows parts (${segChips})`, segChips === 9);
  check("cycles input hidden for programs", await page.locator(".cycles-label").isHidden());
  const meta = await page.textContent("#preview-duration");
  check(`program duration estimated (${meta})`, meta.includes("≈"));
  // program text round-trip
  await page.locator("#edit-btn").click();
  await page.waitForSelector("#screen-builder.active");
  check("program opens in text mode", await page.locator("#builder-text").isVisible());
  check("visual toggle hidden for programs", await page.locator("#builder-mode-toggle").isHidden());
  const txt = await page.inputValue("#builder-text");
  check("program text has part headers and open hold",
    txt.includes("-- round 1") && txt.includes("hold 60 open"));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");

  // open-hold session flow via a tiny shared program link
  await page.goto(BASE + "/#p=breaths~i0.5-e0.5*2!hold~h30o!close~e0.5&n=Hold%20Test&v=orb",
    { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-preview.active");
  check("program link decodes", (await page.textContent("#preview-name")) === "Hold Test");
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  await page.waitForTimeout(2600); // past part 1 (2s), into the open hold
  const indicator = await page.textContent("#cycle-indicator");
  check(`segment title shown ("${indicator}")`, indicator.includes("hold"));
  check("release button visible", await page.locator("#hold-release").isVisible());
  const nextUp = await page.textContent("#next-up");
  check(`next part announced ("${nextUp}")`, nextUp.includes("close"));
  const countUp1 = await page.textContent("#phase-count");
  await page.waitForTimeout(1200);
  const countUp2 = await page.textContent("#phase-count");
  check(`open hold counts up (${countUp1} -> ${countUp2})`,
    /^\d+:\d\d$/.test(countUp2.trim()) && countUp2 !== countUp1);
  await page.locator("#hold-release").click();
  await page.waitForSelector("#session-done:not([hidden])", { timeout: 5000 });
  check("release advances and session completes", true);
  const doneSummary = await page.textContent("#done-summary");
  check(`program summary uses parts ("${doneSummary.slice(0, 40)}…")`, doneSummary.includes("parts"));
  await page.locator("#done-home-btn").click();
  await page.waitForSelector("#screen-home.active");

  // --- share dialog: QR + copy + native share in one place
  await page.locator("#preset-grid .seq-card").first().click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#share-btn").click();
  await page.waitForSelector(".qr-dialog[open]");
  const qrSvg = await page.locator("#qr-holder svg").count();
  const qrCaption = await page.textContent("#qr-caption");
  check(`share dialog shows QR (svg=${qrSvg}, "${qrCaption}")`, qrSvg === 1 && qrCaption.length > 0);
  await page.locator("#share-copy").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check(`share dialog copies link (${copied.slice(0, 30)}…)`, copied.includes("#s=") && copied.includes("&v="));
  await page.locator("#qr-close").click();
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");

  // --- stacked phases (physiological sigh): second inhale visibly tops up
  await page.goto(BASE + "/#s=i1.5-i1-e2&c=2&n=Sigh%20Test&v=orb", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  const scaleAt = async () => page.evaluate(() => {
    const m = getComputedStyle(document.querySelector("#stage .orb")).transform;
    return m.startsWith("matrix") ? parseFloat(m.slice(7)) : 1;
  });
  await page.waitForTimeout(1350); // near end of the big inhale
  const s1 = await scaleAt();
  await page.waitForTimeout(1000); // near end of the sip
  const s2 = await scaleAt();
  check(`double inhale grows in two steps (${s1.toFixed(2)} -> ${s2.toFixed(2)})`,
    s1 > 0.7 && s2 > s1 + 0.03);
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");

  // --- duplicate hygiene
  await page.evaluate(() => {
    const local = JSON.parse(localStorage.getItem("breathz.sequences") || "[]");
    const boxPhases = [{ kind: "inhale", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "exhale", seconds: 4 }, { kind: "hold", seconds: 4 }];
    local.push({ id: "local_dup1", source: "local", name: "Box Breathing", cycles: 10, phases: boxPhases });
    local.push({ id: "local_kept", source: "local", name: "My Box", cycles: 10, phases: boxPhases });
    localStorage.setItem("breathz.sequences", JSON.stringify(local));
  });
  await page.reload({ waitUntil: "networkidle" });
  check("identical preset copy cleaned on load",
    (await page.locator('#preset-grid .seq-card:has-text("Box Breathing")').count()) === 1);
  check("renamed copy kept",
    (await page.locator('#preset-grid .seq-card:has-text("My Box")').count()) === 1);
  await page.locator('#preset-grid .seq-card:has-text("Box Breathing")').first().click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#edit-btn").click();
  await page.waitForSelector("#screen-builder.active");
  await page.locator("#builder-save").click();
  await page.waitForSelector("#screen-preview.active");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  check("saving unchanged preset creates no duplicate",
    (await page.locator('#preset-grid .seq-card:has-text("Box Breathing")').count()) === 1);
  await page.evaluate(() => {
    const local = JSON.parse(localStorage.getItem("breathz.sequences") || "[]");
    localStorage.setItem("breathz.sequences", JSON.stringify(local.filter((s) => s.name !== "My Box")));
  });
  await page.reload({ waitUntil: "networkidle" });

  // --- program cards collapse and expand
  const prCard = page.locator('#preset-grid .seq-card:has-text("Power Rounds")');
  const collapsedChips = await prCard.locator(".chip.seg").count();
  check(`program card collapsed to one chip (${collapsedChips})`, collapsedChips === 1);
  const moreLabel = await prCard.locator(".chip-more").textContent();
  check(`summary chip labelled ("${moreLabel}")`, moreLabel === "view 9 parts");
  await prCard.locator(".chip-more").click();
  await page.waitForTimeout(150);
  const prCard2 = page.locator('#preset-grid .seq-card:has-text("Power Rounds")');
  const expandedChips = await prCard2.locator(".chip.seg").count();
  check(`expanded shows all parts (${expandedChips} chips incl. show-less)`, expandedChips === 10);
  check("still on home (expand didn't open preview)",
    await page.evaluate(() => document.getElementById("screen-home").classList.contains("active")));
  await prCard2.locator(".chip-more").click();
  await page.waitForTimeout(150);
  check("show less folds back",
    (await page.locator('#preset-grid .seq-card:has-text("Power Rounds") .chip.seg').count()) === 1);

  // --- languages: switch, persist, travel in links; intention checkbox
  await page.locator('.lang-btn:has-text("FR")').click();
  await page.waitForTimeout(300);
  check("FR: deck title translates", (await page.textContent("#deck-title")) === "Pratiques");
  check("FR: begin translates", (await page.textContent("#home-begin")) === "Commencer");
  check("FR: mood chip translates",
    (await page.locator('.mood-chip:has-text("stressé")').count()) === 1);
  check("FR: card names translate",
    (await page.locator('#preset-grid .seq-card:has-text("Respiration carrée")').count()) === 1);
  await page.locator('#preset-grid .seq-card:has-text("Respiration carrée")').first().click();
  await page.waitForSelector("#screen-preview.active");
  const frDesc = await page.textContent("#preview-desc");
  check(`FR: practice description translates ("${frDesc.slice(0, 28)}…")`, /[àéèêç]/.test(frDesc));
  check("FR: persisted", (await page.evaluate(() => localStorage.getItem("breathz.lang"))) === "fr");
  check("FR: display name translates",
    (await page.textContent("#preview-name")) === "Respiration carrée");
  // …but the share link keeps the canonical name so cross-language links work
  // intention checkbox: unchecked personal intention stays out of the link
  await page.evaluate(() => localStorage.setItem("breathz.intention", "secret wish"));
  await page.locator("#share-btn").click();
  await page.waitForSelector(".qr-dialog[open]");
  check("intention row shows", await page.locator("#share-intention-row").isVisible());
  check("personal intention unchecked by default",
    !(await page.isChecked("#share-include-intention")));
  await page.locator("#share-copy").click();
  let copied2 = await page.evaluate(() => navigator.clipboard.readText());
  check("unchecked: link has no intention, carries lang + canonical name",
    !copied2.includes("&i=") && copied2.includes("&l=fr") && copied2.includes("n=Box%20Breathing"));
  await page.check("#share-include-intention");
  await page.locator("#share-copy").click();
  copied2 = await page.evaluate(() => navigator.clipboard.readText());
  check("checked: intention travels", copied2.includes("i=secret%20wish"));
  await page.locator("#qr-close").click();
  await page.evaluate(() => localStorage.removeItem("breathz.intention"));
  // &l= in a link switches the recipient's language
  await page.goto(BASE + "/#s=i4-e6&c=3&n=Lang%20Test&l=de", { waitUntil: "networkidle" });
  await page.waitForSelector("#screen-preview.active");
  check("link language applies (DE)", (await page.textContent("#start-btn")) === "Beginnen");
  // back to EN for the rest of the suite
  await page.evaluate(() => localStorage.setItem("breathz.lang", "en"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#preset-grid .seq-card");

  // --- practitioner page translates
  await page.evaluate(() => localStorage.setItem("breathz.lang", "fr"));
  await page.goto(BASE + "/#practitioners", { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" }); // re-boot so the stored language applies
  await page.waitForSelector("#screen-practitioners.active");
  check("FR practitioner page", (await page.textContent(".practitioners-body h2")) === "Pour les praticiens");
  await page.evaluate(() => localStorage.setItem("breathz.lang", "en"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#preset-grid .seq-card");

  // --- vision backdrop: image as atmosphere behind any style, breath-coupled
  await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, "#f59e0b"); grad.addColorStop(1, "#7c3aed");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    localStorage.setItem("breathz.visionImage", c.toDataURL("image/jpeg", 0.8));
  });
  await page.locator('#preset-grid .seq-card:has-text("Coherent Breathing")').click();
  await page.waitForSelector("#screen-preview.active");
  await page.locator("#start-btn").click();
  await page.waitForSelector("#screen-session.active");
  check("backdrop visible behind non-vision style",
    await page.locator("#vision-backdrop").isVisible());
  check("backdrop layers carry the image",
    await page.evaluate(() => document.getElementById("vb-clear").style.backgroundImage.startsWith("url")));
  await page.waitForTimeout(1600);
  const clarity1 = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("vb-clear")).opacity));
  check(`vision clarity breath-coupled (${clarity1.toFixed(2)})`, clarity1 > 0.06);
  await page.keyboard.press("v");
  check("V key hides the backdrop", await page.locator("#vision-backdrop").isHidden());
  check("preference persisted off",
    (await page.evaluate(() => localStorage.getItem("breathz.visionBackdrop"))) === "0");
  await page.locator("#vision-toggle").click();
  check("toggle button restores it", await page.locator("#vision-backdrop").isVisible());
  await page.locator("#end-btn").click();
  await page.waitForSelector("#screen-preview.active");

  // --- vision framing: drag the preview to pick the visible part of the image
  await page.locator("#intention-toggle").click();
  await page.waitForSelector("#intention-panel:not([hidden])");
  check("framing control shown when image set", await page.locator("#vision-pos").isVisible());
  await page.locator("#vision-pos-frame").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // frame adopts the image's aspect ratio
  await page.evaluate(() => {
    const z = document.getElementById("vision-zoom");
    z.value = "1.8";
    z.dispatchEvent(new Event("input", { bubbles: true }));
    z.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300); // backdrop size settles after the aspect probe
  check("zoom persists", (await page.evaluate(() => localStorage.getItem("breathz.visionZoom"))) === "1.80");
  check("backdrop zooms in", await page.evaluate(() =>
    document.getElementById("vb-clear").style.backgroundSize.includes("180")));
  const winW = await page.evaluate(() => parseFloat(document.getElementById("vision-pos-win").style.width));
  check(`crop window shrinks when zoomed (${winW.toFixed(0)}%)`, winW > 10 && winW < 100);
  const frameBox = await page.locator("#vision-pos-frame").boundingBox();
  await page.mouse.click(frameBox.x + frameBox.width * 0.8, frameBox.y + frameBox.height * 0.25);
  await page.waitForTimeout(150);
  const focus = await page.evaluate(() => localStorage.getItem("breathz.visionFocus"));
  const [ffx, ffy] = (focus || "50,50").split(",").map(Number);
  check(`pan moves the crop window on both axes (${focus})`, ffx > 55 && ffy < 45);
  check("backdrop layer follows the framing", await page.evaluate(() => {
    const want = localStorage.getItem("breathz.visionFocus").split(",").map(Number);
    const got = document.getElementById("vb-clear").style.backgroundPosition.split(" ").map(parseFloat);
    return Math.abs(got[0] - want[0]) < 0.5 && Math.abs(got[1] - want[1]) < 0.5;
  }));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#screen-home.active");
  await page.evaluate(() => { localStorage.removeItem("breathz.visionImage"); localStorage.removeItem("breathz.visionBackdrop"); localStorage.removeItem("breathz.visionFocus"); localStorage.removeItem("breathz.visionZoom"); });

  // --- pwa bits
  const swCount = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length);
  check(`service worker registered (${swCount})`, swCount >= 1);

  // --- mobile 320px: no horizontal scroll
  const mob = await browser.newPage({ viewport: { width: 320, height: 640 } });
  await mob.addInitScript(() => { localStorage.setItem("breathz.preroll", "0"); localStorage.setItem("breathz.ground", "0"); });
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
