// Glass Palette: the room-lights feed. Sends the song's colour, its beat map and where playback is to a light
// server on THIS machine (extras/lights), and does nothing at all unless "Send the song to your lights" is on in
// the settings panel. The address must be 127.0.0.1, localhost or [::1]: the song you are playing never leaves the
// computer through this, whatever is typed into the Light server box.
(function ogLights() {
  const get = (k, d) => { const v = localStorage.getItem('office-glass-' + k); return v === null ? d : v; };
  const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;
  const url = () => { const u = get('govee-url', 'http://127.0.0.1:8197').replace(/\/+$/, ''); return LOCAL.test(u) ? u : null; };
  const on = () => get('lights-feed', '0') === '1' && !window.__goveeDjFeeds;   // a lights extension that feeds its own server wins
  const post = (u, p, body) => fetch(u + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) }).catch(() => null);

  let sentColor = '', sentBeats = null, sentPlaying = null, lastSync = 0, lastPos = 0, lastAt = 0;
  const colour = () => {
    const m = getComputedStyle(document.documentElement).getPropertyValue('--gs').match(/\d+(\.\d+)?/g);
    return m && m.length >= 3 ? { r: Math.round(+m[0]), g: Math.round(+m[1]), b: Math.round(+m[2]) } : null;
  };
  const tick = () => {
    const u = url();
    if (!u || !on()) { sentColor = ''; sentBeats = null; sentPlaying = null; return; }
    let playing = false, pos = 0;
    try { playing = Spicetify.Player.isPlaying(); pos = Spicetify.Player.getProgress(); } catch (e) { return; }
    const c = colour();
    if (c && JSON.stringify(c) !== sentColor) { sentColor = JSON.stringify(c); post(u, '/color', c); }
    const b = window.__officeBeats;
    if (b && b.id && b.id !== sentBeats) { sentBeats = b.id; post(u, '/beats', { id: b.id, tempo: b.tempo, beats: b.beats }); lastSync = 0; }
    // where playback is: on a change of play state, after a seek (the position jumped), and every few seconds
    const now = Date.now(), expected = lastPos + (playing ? now - lastAt : 0), lead = parseFloat(get('beat-offset-ms', 0)) || 0;
    if (playing !== sentPlaying || Math.abs(pos - expected) > 800 || now - lastSync > 4000) {
      sentPlaying = playing; lastSync = now;
      post(u, '/sync', { playing, positionMs: pos + lead, sentAt: now });
    }
    lastPos = pos; lastAt = now;
  };
  clearInterval(window.__ogLightsTimer);
  window.__ogLightsTimer = setInterval(tick, 400);
})();
