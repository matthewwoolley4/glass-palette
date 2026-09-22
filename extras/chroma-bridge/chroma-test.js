// Paints the whole Razer keyboard one bright colour for a few seconds through the Chroma REST API, then releases it.
// usage: node chroma-test.js [seconds]
const secs = +(process.argv[2] || 5), SDK = "http://localhost:54235/razer/chromasdk";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const init = await (await fetch(SDK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Glass Palette test", description: "static colour test", author: { name: "Glass Palette", contact: "local" }, device_supported: ["keyboard"], category: "application" }) })).json();
  console.log("init", JSON.stringify(init));
  if (!init.uri) return;
  await sleep(1500);
  const r1 = await fetch(init.uri + "/keyboard", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ effect: "CHROMA_STATIC", param: { color: 0x0000FF } }) });   // BGR: red
  console.log("static red", r1.status, await r1.text());
  const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { await fetch(init.uri + "/heartbeat", { method: "PUT" }); await sleep(900); }
  const r2 = await fetch(init.uri + "/keyboard", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ effect: "CHROMA_STATIC", param: { color: 0x00FF00 } }) });   // green
  console.log("static green", r2.status, await r2.text());
  await sleep(3000);
  const r3 = await fetch(init.uri, { method: "DELETE" }); console.log("released", r3.status);
})().catch((e) => console.log("ERR", e.message));
