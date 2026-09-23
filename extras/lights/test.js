// Glass Palette Lights, tested against a stand-in light on this machine: no real light is touched.
//   node extras/lights/test.js
// The stand-in answers the scan and records every packet it is sent, so the test can check what a real light
// would have received: colours, brightness, pulses on the beat, the flash, and never a power command.
"use strict";
const dgram = require("dgram"), { spawn } = require("child_process"), os = require("os"), path = require("path"), fs = require("fs");
const PORT = 18297, SPOTIFY = "https://xpui.app.spotify.com";
const cfgFile = path.join(os.tmpdir(), "gp-lights-test-" + process.pid + ".json");
const now = new Date(), hhmm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
fs.writeFileSync(cfgFile, JSON.stringify({ nightFrom: hhmm(new Date(now - 3 * 3600e3)), nightTo: hhmm(new Date(+now + 3 * 3600e3)), fadeMs: 200 }));
const got = [], all = [];
const light = dgram.createSocket("udp4");
light.on("message", (b, from) => {
  const m = JSON.parse(b).msg; got.push(m); all.push(m);
  if (m.cmd === "scan") light.send(JSON.stringify({ msg: { cmd: "scan", data: { ip: "127.0.0.1", device: "AA:BB:CC:DD:EE:FF:00:11", sku: "H6000" } } }), 4002, "127.0.0.1");
});
const control = dgram.createSocket("udp4");
control.on("message", (b) => { const m = JSON.parse(b).msg; got.push(m); all.push(m); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (p, body, origin = SPOTIFY) => {
  const r = await fetch("http://127.0.0.1:" + PORT + p, body === undefined ? { headers: { origin } } : { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { code: r.status, json: await r.json().catch(() => null) };
};
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };
(async () => {
  await new Promise((r) => light.bind(4001, "127.0.0.1", r));
  await new Promise((r) => control.bind(4003, "127.0.0.1", r));
  const srv = spawn(process.execPath, [path.join(__dirname, "lights.js")], { env: { ...process.env, GP_LIGHTS_PORT: PORT, GP_LIGHTS_SCAN_TO: "127.0.0.1", GP_LIGHTS_BIND: "127.0.0.1", GP_LIGHTS_CONFIG: cfgFile }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => out += d); srv.stderr.on("data", (d) => out += d);
  try {
    await sleep(3500);
    let s = await call("/status");
    check("answers /status as the lights server", s.json && s.json.app === "glass-palette-lights" && typeof s.json.enabled === "boolean");
    check("the scan found the stand-in light", s.json && s.json.lights.length === 1, JSON.stringify(s.json && s.json.lights));
    const other = await call("/color", { r: 0, g: 0, b: 255 }, "https://example.com");
    check("refuses a page that is not Spotify", other.code === 403);
    got.length = 0;
    await call("/color", { r: 0, g: 0, b: 255 });
    await sleep(600);
    const colours = got.filter((m) => m.cmd === "colorwc").map((m) => m.data.color);
    const last = colours[colours.length - 1];
    check("the song's colour reaches the light, faded in steps", colours.length >= 2, colours.length + " colour packets");
    check("at night blue is warmed (red added, blue kept brightest but cut)", last && last.r > 60 && last.g < 10, JSON.stringify(last));
    check("brightness is dimmed for the night", got.some((m) => m.cmd === "brightness" && m.data.value < 70));
    got.length = 0;
    const beats = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.5, s: i % 4 ? 0.5 : 1 }));
    await call("/beats", { id: "x", tempo: 120, beats });
    await call("/sync", { playing: true, positionMs: 0, sentAt: Date.now() });
    await sleep(2100);
    const pulses = got.filter((m) => m.cmd === "brightness");
    check("pulses on the beat while playing (about 4 in 2 s, each up and back)", pulses.length >= 6 && pulses.length <= 12, pulses.length + " brightness packets");
    await call("/sync", { playing: false, positionMs: 2100, sentAt: Date.now() });
    await sleep(300); got.length = 0; await sleep(1100);
    check("no pulses while paused", !got.some((m) => m.cmd === "brightness"));
    await call("/flash", { id: "AA:BB:CC:DD:EE:FF:00:11" });
    await sleep(2300);
    check("flash blinks the light white and back", got.filter((m) => m.cmd === "colorwc" && m.data.color.r === 255 && m.data.color.g === 255 && m.data.color.b === 255).length === 3);
    await call("/use", { id: "AA:BB:CC:DD:EE:FF:00:11", use: false });
    got.length = 0; await call("/color", { r: 255, g: 0, b: 0 }); await sleep(500);
    check("an unticked light is left alone", got.length === 0, got.length + " packets");
    check("never sent a power command, in " + all.length + " packets", all.length > 20 && all.every((m) => ["scan", "colorwc", "brightness", "devStatus"].includes(m.cmd)));
    s = await call("/status");
    check("remembers the untick in its settings file", JSON.parse(fs.readFileSync(cfgFile, "utf8")).lights["AA:BB:CC:DD:EE:FF:00:11"].use === false);
  } finally {
    srv.kill(); light.close(); control.close(); try { fs.unlinkSync(cfgFile); } catch (e) {}
  }
  if (failed) console.log("\nserver said:\n" + out);
  console.log(failed ? `FAIL: ${failed} check(s)` : "PASS: every check");
  process.exit(failed ? 1 : 0);
})();
