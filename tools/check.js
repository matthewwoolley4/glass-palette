// Glass Palette health check. Talks to a running Spotify over its Chrome debug port and reports whether the theme is
// live and smooth: theme CSS and runtime present, song colour flowing, frame timing, long tasks, console errors.
//   Start Spotify with a debug port first:
//     Windows:  Spotify.exe --remote-debugging-port=9223
//     macOS:    open -a Spotify --args --remote-debugging-port=9222
//   then:  node tools/check.js [port]
"use strict";
const port = process.argv[2] || (process.platform === "win32" ? 9223 : 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find((t) => t.type === "page" && /xpui/i.test(t.url));
  if (!page) { console.log("no Spotify page on port", port); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Runtime.enable");
  const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  const state = JSON.parse(await ev(`JSON.stringify({
    spicetify: !!window.Spicetify, themeCss: !!document.getElementById('office-glass'), userCss: !!document.querySelector('link.userCSS'),
    runtime: !!window.__officeGlassTimer, fullScreen: document.documentElement.classList.contains('office-glass-fs'),
    songColour: getComputedStyle(document.documentElement).getPropertyValue('--gs').trim(),
    manrope: /Manrope/.test(getComputedStyle(document.body).fontFamily), visible: document.visibilityState,
    track: (Spicetify.Player.data && Spicetify.Player.data.item && Spicetify.Player.data.item.name) || null,
    beats: !!(window.__officeBeats && window.__officeBeats.beats && window.__officeBeats.beats.length),
    motion: (function () { const m = localStorage.getItem('office-glass-motion'); const sys = matchMedia('(prefers-reduced-motion: reduce)').matches; return m === 'always' ? 'forced on' : m === 'never' ? 'forced off' : sys ? 'OFF (system reduce motion)' : 'on'; })(),
    swellRunning: !!window.__officeGlassRaf,
    uiScale: getComputedStyle(document.documentElement).getPropertyValue('--og-ui').trim(),
    touch: document.documentElement.classList.contains('office-glass-touch'),
    win: [innerWidth, innerHeight], ua: (navigator.userAgent.match(/Spotify\\/[\\d.]+/) || [''])[0]
  })`));
  let frames = null;
  if (state.visible === "visible") {
    frames = JSON.parse(await ev(`(async () => { const d = []; let last = performance.now(); const t0 = last; const longs = [];
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }); po.observe({ type: 'longtask' });
      await new Promise((done) => { const f = (t) => { d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
      po.disconnect(); return JSON.stringify({ frames: d.length, avgMs: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2), slow: d.filter((x) => x > 20).length, longTasks: longs }); })()`));
  } else await sleep(3000);
  ws.close();
  const ok = state.spicetify && (state.themeCss || state.userCss) && state.runtime && state.manrope;
  console.log(ok ? "OK  Glass Palette is live" : "FAIL  Glass Palette is not fully live");
  console.log(`    Spotify ${state.ua || "?"}  window ${state.win.join("x")}  ${state.visible}${state.fullScreen ? "  full screen" : ""}`);
  console.log(`    css ${state.themeCss || state.userCss}  runtime ${state.runtime}  Manrope ${state.manrope}  song colour ${state.songColour || "none"}  beat map ${state.beats}`);
  console.log(`    motion ${state.motion}  beat loop ${state.swellRunning ? "running" : "idle"}  ui scale ${state.uiScale || 1}  touch mode ${state.touch}`);
  console.log(`    playing: ${state.track || "nothing"}`);
  if (frames) console.log(`    frames ${frames.frames} in 3 s, avg ${frames.avgMs} ms, slow ${frames.slow}, long tasks ${frames.longTasks.length ? frames.longTasks.join(",") + " ms" : "none"}`);
  else console.log("    (window hidden: frame timing skipped)");
  const ours = errors.filter((e) => /office|glass|theme\.js/i.test(e));
  console.log(`    console errors in 3 s: ${errors.length} total, ${ours.length} from the theme${ours.length ? ":\n      " + ours.slice(0, 5).join("\n      ") : ""}`);
  process.exit(ok ? 0 : 2);
})().catch((e) => { console.log("ERR", e.message); process.exit(1); });
