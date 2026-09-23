#!/usr/bin/env node
// Glass Palette Lights: the playing song's colour and beat on Govee lights, over your own network.
//
//   node lights.js            run it (the installers keep it running in the background for you)
//
// It finds Govee lights on the local network by itself (Govee's LAN API: one multicast "scan", each light answers
// with its address), then colours the ones you tick in Spotify > Settings > Glass Palette. No account, no key, no
// cloud: every packet stays on your network. Turn on "LAN Control" for each light in the Govee Home app first; a
// light with it off does not answer the scan and cannot be driven.
//
// The theme sends it three things, and only when you switch the lights on in the theme's settings:
//   POST /color  {r, g, b}                          the song's colour
//   POST /beats  {id, tempo, beats: [{t, s}]}       the track's beat map (seconds, strength)
//   POST /sync   {playing, positionMs, sentAt}      where playback is, so pulses land on the beat
// and you drive it from the settings panel with POST /scan, /use {id, use}, /flash {id}, /enable, /disable.
// GET /status says what it knows.
//
// What it will never do: switch a light on or off (the Govee app and the wall switch own that), talk to anything
// outside your network, or answer anyone but Spotify's own page. It listens on 127.0.0.1 only, and refuses a
// request from any web page other than Spotify's, so a website in your browser cannot flash your lights.
// Node 18 or newer, standard library only.
"use strict";
const http = require("http");
const dgram = require("dgram");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VERSION = "1.0.0";
const PORT = +(process.env.GP_LIGHTS_PORT || 8197);
const SCAN_TO = process.env.GP_LIGHTS_SCAN_TO || "239.255.255.250";   // tests point this at a stand-in light
const BIND = process.env.GP_LIGHTS_BIND || "0.0.0.0";                  // where the lights' answers arrive (UDP 4002)
const SCAN_PORT = 4001, CONTROL_PORT = 4003;
const REPLY_PORT = +(process.env.GP_LIGHTS_REPLY_PORT || 4002);   // Govee's; tests move it beside a running copy
const SPOTIFY = /^https:\/\/xpui\.app\.spotify\.com$/;
const DIR = process.platform === "win32"
  ? path.join(process.env.APPDATA || os.homedir(), "glass-palette-lights")
  : path.join(os.homedir(), ".config", "glass-palette-lights");
const CONFIG = process.env.GP_LIGHTS_CONFIG || path.join(DIR, "config.json");

// ---- settings you can change in config.json (the file is written with these the first time it runs) ----------
const DEFAULTS = {
  enabled: true,
  brightness: 70,          // 1 to 100, the level the lights sit at while a song plays
  beatPulse: true,         // lift the brightness a little on each beat
  beatDepth: 18,           // how much, in brightness points; bars get the full lift, other beats half
  beatOffsetMs: 0,         // move pulses earlier (+) or later (-), for speakers that play behind the app
  fadeMs: 700,             // how long a change of colour takes
  night: true,             // warmer and dimmer at night: less blue light in the evening
  nightFrom: "20:30",      // on this computer's clock; it eases in over an hour and out over an hour
  nightTo: "07:00",
  nightWarmth: 0.55,       // 0 to 1: how far colours lean toward warm
  nightDim: 0.2,           // 0 to 1: how much dimmer
  lights: {},              // filled in by the scan: { "<id>": { sku, ip, use } }
};
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + " " + m);
let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG, "utf8")) }; } catch (e) { /* first run */ }
const save = () => {
  try { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n"); }
  catch (e) { log("could not save " + CONFIG + ": " + e.message); }
};
save();

// ---- talking to lights ------------------------------------------------------------------------------------------
// Only these commands are ever sent. "turn" (power) is deliberately not among them.
const ALLOWED = new Set(["scan", "devStatus", "colorwc", "brightness"]);
const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
const send = (ip, port, cmd, data) => new Promise((done) => {
  if (!ALLOWED.has(cmd)) throw new Error("refusing to send " + cmd);
  udp.send(Buffer.from(JSON.stringify({ msg: { cmd, data } })), port, ip, () => done());
});
let scanning = false, lastScan = 0;
const scan = () => new Promise(async (done) => {
  scanning = true; lastScan = Date.now();
  const before = Object.keys(cfg.lights).length;
  // One scan from every network card, so a computer on Wi-Fi and Ethernet at once still finds lights on either.
  // One at a time: a send is queued, so switching the card before the last one left would send them all from one.
  const cards = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address);
  for (const a of SCAN_TO === "239.255.255.250" && cards.length ? cards : [null]) {
    try { if (a) udp.setMulticastInterface(a); await send(SCAN_TO, SCAN_PORT, "scan", { account_topic: "reserve" }); }
    catch (e) { log("scan via " + a + ": " + e.message); }
  }
  setTimeout(() => {
    scanning = false;
    const n = Object.keys(cfg.lights).length;
    if (n !== before) log("scan: " + n + " light(s) known");
    done();
  }, 2500);
});
udp.on("message", (buf, from) => {
  let m; try { m = JSON.parse(buf.toString()).msg; } catch (e) { return; }
  if (!m || !m.data) return;
  if (m.cmd === "scan" && m.data.device) {
    const id = String(m.data.device), known = cfg.lights[id];
    cfg.lights[id] = { sku: String(m.data.sku || "Govee"), ip: String(m.data.ip || from.address), use: known ? known.use !== false : true, seen: Date.now() };
    if (!known || known.ip !== cfg.lights[id].ip) save();
  }
});

// ---- colour ------------------------------------------------------------------------------------------------------
let target = null, shown = null, playing = false;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mins = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
// 0 by day, 1 at night, easing over the hour after nightFrom and the hour before nightTo.
const nightAmount = (d = new Date()) => {
  if (!cfg.night) return 0;
  const now = d.getHours() * 60 + d.getMinutes(), from = mins(cfg.nightFrom), to = mins(cfg.nightTo);
  const since = (now - from + 1440) % 1440, until = (to - now + 1440) % 1440, span = (to - from + 1440) % 1440;
  if (since > span) return 0;
  return clamp(Math.min(since / 60, until / 60, 1), 0, 1);
};
// The lights take a colour at full strength and a brightness separately, so push the colour to its brightest form.
const forLights = (c, night) => {
  let { r, g, b } = c;
  if (night > 0) {
    const w = cfg.nightWarmth * night;                         // toward a warm amber, and blue cut the most
    r = r + (255 - r) * w * 0.6; g = g * (1 - w * 0.35); b = b * (1 - w * 0.85);
  }
  const top = Math.max(r, g, b, 1);
  return { r: Math.round(r * 255 / top), g: Math.round(g * 255 / top), b: Math.round(b * 255 / top) };
};
const baseBrightness = () => Math.round(clamp(cfg.brightness * (1 - cfg.nightDim * nightAmount()), 1, 100));
const used = () => Object.entries(cfg.lights).filter(([, l]) => l.use !== false);
const paint = (c) => { for (const [, l] of used()) send(l.ip, CONTROL_PORT, "colorwc", { color: c, colorTemInKelvin: 0 }); };
const level = (v) => { for (const [, l] of used()) send(l.ip, CONTROL_PORT, "brightness", { value: v }); };

let fade = null;
const fadeTo = (c) => {
  clearInterval(fade);
  const from = shown || c, steps = Math.max(1, Math.round(cfg.fadeMs / 100));
  let i = 0;
  fade = setInterval(() => {
    i++;
    const k = i / steps, mix = (a, b) => Math.round(a + (b - a) * k);
    shown = { r: mix(from.r, c.r), g: mix(from.g, c.g), b: mix(from.b, c.b) };
    paint(shown);
    if (i >= steps) clearInterval(fade);
  }, 100);
};
const refresh = () => { if (cfg.enabled && target) fadeTo(forLights(target, nightAmount())); };
setInterval(refresh, 5 * 60 * 1000);                           // the evening warmth creeps in even during one song

// ---- the beat ----------------------------------------------------------------------------------------------------
let beats = null, anchor = null, nextBeat = 0, pulseOff = null;
const position = () => anchor && (playing ? anchor.positionMs + (Date.now() - anchor.at) : anchor.positionMs);
setInterval(() => {
  if (!cfg.enabled || !cfg.beatPulse || !playing || !beats || !anchor) return;
  const pos = position() + cfg.beatOffsetMs;
  while (nextBeat < beats.length && beats[nextBeat].t * 1000 < pos - 150) nextBeat++;     // skip what already passed
  const b = beats[nextBeat];
  if (!b || b.t * 1000 > pos) return;
  nextBeat++;
  const base = baseBrightness();
  level(clamp(Math.round(base + cfg.beatDepth * (b.s >= 1 ? 1 : 0.5)), 1, 100));
  clearTimeout(pulseOff); pulseOff = setTimeout(() => level(base), 120);
}, 15);
const reseek = () => { nextBeat = 0; };

// ---- the flash: which light is which ----------------------------------------------------------------------------
const flash = (id) => {
  const l = cfg.lights[id]; if (!l) return false;
  const back = shown || { r: 255, g: 180, b: 90 };
  let n = 0;
  const t = setInterval(() => {
    send(l.ip, CONTROL_PORT, "colorwc", { color: n % 2 ? back : { r: 255, g: 255, b: 255 }, colorTemInKelvin: 0 });
    send(l.ip, CONTROL_PORT, "brightness", { value: n % 2 ? baseBrightness() : 100 });
    if (++n >= 6) clearInterval(t);
  }, 350);
  return true;
};

// ---- HTTP, for Spotify's page only -------------------------------------------------------------------------------
const status = () => ({
  app: "glass-palette-lights", version: VERSION, enabled: cfg.enabled, playing, scanning,
  color: target, night: +nightAmount().toFixed(2), brightness: baseBrightness(), hasBeats: !!beats,
  lights: Object.entries(cfg.lights).map(([id, l]) => ({ id, sku: l.sku, ip: l.ip, use: l.use !== false, seen: l.seen || 0 })),
});
const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  const ok = !origin || SPOTIFY.test(origin);
  const head = { "content-type": "application/json", "cache-control": "no-store" };
  if (origin && ok) Object.assign(head, {
    "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type", "access-control-allow-private-network": "true", vary: "origin",
  });
  const reply = (code, body) => { res.writeHead(code, head); res.end(JSON.stringify(body)); };
  if (!ok) return reply(403, { error: "only Spotify's own page may use this" });
  if (req.method === "OPTIONS") { res.writeHead(204, head); return res.end(); }
  if (req.method === "GET" && req.url === "/status") return reply(200, status());
  if (req.method !== "POST") return reply(404, { error: "not here" });
  // A POST from a page must come from Spotify; one with no Origin at all (curl on this machine) is allowed.
  let body = "";
  req.on("data", (d) => { body += d; if (body.length > 400000) req.destroy(); });
  req.on("end", async () => {
    let j = {}; try { j = body ? JSON.parse(body) : {}; } catch (e) { return reply(400, { error: "not JSON" }); }
    switch (req.url) {
      case "/color": {
        const n = (v) => clamp(Math.round(+v || 0), 0, 255);
        target = { r: n(j.r), g: n(j.g), b: n(j.b) };
        if (cfg.enabled) { level(baseBrightness()); refresh(); }
        return reply(200, { ok: true });
      }
      case "/beats": {
        beats = Array.isArray(j.beats) ? j.beats.filter((b) => b && isFinite(b.t)).map((b) => ({ t: +b.t, s: +b.s || 0.5 })).sort((a, b) => a.t - b.t) : null;
        reseek();
        return reply(200, { ok: true, beats: beats ? beats.length : 0 });
      }
      case "/sync": {
        const was = playing;
        playing = !!j.playing;
        if (isFinite(j.positionMs)) {
          const at = isFinite(j.sentAt) ? +j.sentAt : Date.now();
          anchor = { positionMs: +j.positionMs, at };
          reseek();
        }
        if (was && !playing && cfg.enabled) level(baseBrightness());
        return reply(200, { ok: true });
      }
      case "/scan": await scan(); return reply(200, status());
      case "/use": {
        if (!cfg.lights[j.id]) return reply(404, { error: "no such light" });
        cfg.lights[j.id].use = !!j.use; save();
        if (j.use && cfg.enabled && shown) { const l = cfg.lights[j.id]; send(l.ip, CONTROL_PORT, "colorwc", { color: shown, colorTemInKelvin: 0 }); }
        return reply(200, status());
      }
      case "/flash": return reply(flash(j.id) ? 200 : 404, { ok: !!cfg.lights[j.id] });
      case "/enable": cfg.enabled = true; save(); refresh(); return reply(200, status());
      case "/disable": cfg.enabled = false; save(); return reply(200, status());
      default: return reply(404, { error: "not here" });
    }
  });
});

udp.bind(REPLY_PORT, BIND, () => {
  server.listen(PORT, "127.0.0.1", () => {
    log(`Glass Palette Lights ${VERSION} on http://127.0.0.1:${PORT}, settings in ${CONFIG}`);
    scan();
    setInterval(() => { if (Date.now() - lastScan > 4 * 60 * 1000) scan(); }, 60 * 1000);   // lights change address
  });
});
udp.on("error", (e) => {
  log(e.code === "EADDRINUSE" ? "Port " + REPLY_PORT + " is taken: another Govee app or a second copy of this is running. Stop it and try again." : "UDP: " + e.message);
  process.exit(1);
});
server.on("error", (e) => {
  log(e.code === "EADDRINUSE" ? "Port " + PORT + " is taken: Glass Palette Lights is probably already running." : "HTTP: " + e.message);
  process.exit(1);
});

