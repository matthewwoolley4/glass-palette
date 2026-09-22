// Glass Palette: Razer Chroma bridge. Mirrors the room lights on a Razer keyboard through Razer Synapse's Chroma
// REST API (localhost:54235). Colour and live brightness come from the Govee DJ light server's read-only /status
// (colour of the playing song, brightness that breathes and pulses on the beat). WASD stay warm white.
//
// usage:  node chroma-bridge.js [statusUrl] [sshHost]
//   statusUrl  default http://127.0.0.1:8197/status  (the light server)
//   sshHost    no default. Pass a host only when the light server lives on ANOTHER machine: the bridge then opens
//              "ssh -N -L 8197:127.0.0.1:8197 <sshHost>" itself when the status URL is not answering. Left out,
//              the bridge just waits for the status URL and never touches ssh. $GLASS_PALETTE_SSH_HOST sets it
//              too, which is the tidier way to keep a standing host out of the command line.
// Needs Node 18+, Razer Synapse with Chroma Connect, and Chroma apps allowed to control the keyboard.
"use strict";
const { spawn } = require("child_process");
const STATUS = process.argv[2] || "http://127.0.0.1:8197/status";
const SSH_HOST = process.argv[3] || process.env.GLASS_PALETTE_SSH_HOST || "-";   // "-": never shell out to ssh unasked
const SDK = "http://localhost:54235/razer/chromasdk";
const POLL_MS = 90, HEARTBEAT_MS = 1000;
const RIM = { r: 246, g: 241, b: 232 };                               // the theme's warm white
const WASD = [[2, 3], [3, 2], [3, 3], [3, 4]];                        // Chroma key grid rows/cols: W, A, S, D
const bgr = (c) => ((c.b & 255) << 16) | ((c.g & 255) << 8) | (c.r & 255);
const scale = (c, k) => ({ r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let tunnel = null;
async function ensureTunnel() {
  try { const r = await fetch(STATUS, { signal: AbortSignal.timeout(1500) }); if (r.ok) return true; } catch (e) { /* not up */ }
  if (SSH_HOST === "-" || tunnel) return false;
  log("opening SSH tunnel to", SSH_HOST);
  tunnel = spawn("ssh", ["-N", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15", "-L", "8197:127.0.0.1:8197", SSH_HOST], { stdio: "ignore" });
  tunnel.on("exit", () => { tunnel = null; });
  await sleep(2500);
  return false;
}

let session = null;                                                    // { uri }
async function openSession() {
  const r = await fetch(SDK, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Glass Palette", description: "The room's lights, on the keyboard", author: { name: "Glass Palette", contact: "local" }, device_supported: ["keyboard"], category: "application" }),
  });
  const j = await r.json();
  if (!j.uri) throw new Error("Chroma SDK refused: " + JSON.stringify(j));
  session = { uri: j.uri };
  await sleep(1200);                                                   // the SDK needs a moment before the first effect
  log("Chroma session", j.sessionid);
}
let hbFails = 0;
async function heartbeat() {                                            // three missed beats in a row = the session is gone
  if (!session) return;
  // The body is not optional. Chroma is served by Windows' HTTP.SYS, which answers a PUT with no Content-Length
  // "411 Length Required" before Razer ever sees it. Without it the session died every four seconds and the
  // keyboard never held a frame ("razer is not working yet").
  try { const r = await fetch(session.uri + "/heartbeat", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" }); if (!r.ok) throw new Error("hb " + r.status); hbFails = 0; }
  catch (e) { if (++hbFails >= 3) { session = null; hbFails = 0; log("session lost, reopening"); } }
}

// the lights: colour of the song (white periods become the theme's warm white), intensity from the live level
function readLook(st) {
  const lc = st.lastColor || {};
  const colour = lc.white || lc.kelvin || (lc.r === undefined) ? RIM : { r: lc.r, g: lc.g, b: lc.b };
  const levels = Object.values(st.level || {}); const base = st.base || 60;
  const lvl = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : base;
  const intensity = Math.max(0.28, Math.min(1, 0.55 + 0.45 * (lvl / base)));   // the beat lifts it to full, breathing dips it a little
  return { colour, intensity, playing: !!st.playing };
}

let lastFrame = "";
async function paint(look) {
  if (!session) return;
  const body = scale(look.colour, look.intensity), wasd = scale(RIM, Math.min(1, look.intensity + 0.15));
  const color = Array.from({ length: 6 }, () => Array(22).fill(bgr(body)));
  const key = Array.from({ length: 6 }, () => Array(22).fill(0));
  for (const [r, c] of WASD) key[r][c] = 0x01000000 | bgr(wasd);
  const frame = JSON.stringify({ effect: "CHROMA_CUSTOM_KEY", param: { color, key } });
  if (frame === lastFrame) return;                                     // nothing changed: no traffic
  lastFrame = frame;
  const r = await fetch(session.uri + "/keyboard", { method: "PUT", headers: { "content-type": "application/json" }, body: frame });
  if (!r.ok) throw new Error("keyboard effect HTTP " + r.status);
  painted++; lastError = null;
}

// One bridge at a time, and it says so out loud. Chroma hands the keyboard to whichever app asked last, so a second
// copy silently steals the session from the first and both then spend their lives reopening it and painting nothing.
// A stale copy from the night before is exactly how this looked like "Razer doesn't work".
// The same little server answers /status, which is what the theme's settings page asks to draw the green dot.
let painted = 0, lastError = null;
function claimSingleInstance() {
  return new Promise((resolve) => {
    const srv = require("http").createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, app: "glass-palette-chroma-bridge", session: !!session, painted, status: STATUS, lastError }));
    });
    srv.once("error", () => { log("another Glass Palette bridge is already running: stop that one first (it owns the keyboard)"); process.exit(1); });
    srv.listen(8198, "127.0.0.1", () => resolve(srv));
  });
}

(async () => {
  await claimSingleInstance();
  log("Glass Palette Chroma bridge: status", STATUS);
  setInterval(heartbeat, HEARTBEAT_MS);
  let fails = 0;
  for (;;) {
    try {
      if (!(await ensureTunnel())) { await sleep(1500); continue; }   // the lights first, then the keyboard
      if (!session) await openSession();
      const st = await (await fetch(STATUS, { signal: AbortSignal.timeout(1500) })).json();
      await paint(readLook(st));
      fails = 0;
    } catch (e) {
      if (++fails % 20 === 1) log("retrying:", e.message);
      if (/Chroma|keyboard effect/.test(e.message)) session = null;
      await sleep(1000);
    }
    await sleep(POLL_MS);
  }
})();
process.on("SIGINT", async () => { try { if (session) await fetch(session.uri, { method: "DELETE" }); } catch (e) { /* leaving */ } if (tunnel) tunnel.kill(); process.exit(0); });
