// Glass Palette settings. Every knob the theme has, in one place, inside Spotify's own Settings page, plus the two
// optional local services (the Govee light server and the Razer Chroma bridge) with a live connection test.
// Nothing here is required: the theme runs with no services and every knob has a sane default.
// Storage is localStorage, so settings are per machine, which is the point: a wall screen and a desk want
// different sizes, and a touchscreen wants different targets than a mouse.
(function officeGlassSettings() {
  if (!document.head || !document.body || !window.Spicetify || !Spicetify.Platform || !Spicetify.Platform.History) { setTimeout(officeGlassSettings, 400); return; }

  const root = document.documentElement;
  const get = (k, d) => { const v = localStorage.getItem('office-glass-' + k); return v === null ? d : v; };
  const set = (k, v) => { if (v === null || v === '') localStorage.removeItem('office-glass-' + k); else localStorage.setItem('office-glass-' + k, v); };
  const pct = (v) => Math.round(v * 100) + '%';

  // ---- the knobs ------------------------------------------------------------------------------------------------
  // apply() runs on load and on every change, so nothing here needs a restart.
  // Presets first. Almost nobody wants to tune six numbers; they want to say what they are sitting in front of.
  const PRESETS = [
    { id: 'desk', name: 'Desk monitor', note: 'A mouse, close up', values: { 'ui-scale': '0.85', touch: '0', motion: '' } },
    { id: 'touch', name: 'Touchscreen', note: 'Fingers, big targets', values: { 'ui-scale': '1', touch: '1', motion: 'always' } },
    { id: 'tv', name: 'TV or big screen', note: 'Read from the sofa', values: { 'ui-scale': '1.25', touch: '0', motion: 'always' } },
  ];

  const KNOBS = [
    { group: 'Look', key: 'ui-scale', label: 'Size', hint: 'How big everything the theme draws is.',
      type: 'range', min: 0.7, max: 1.3, step: 0.05, def: 1, fmt: pct },
    { group: 'Look', key: 'touch', label: 'Touch mode', hint: 'Big targets, drag to scroll, one tap plays.',
      tip: 'A USB touchscreen reports no touch points on macOS, so it cannot be detected automatically.',
      type: 'select', def: '', options: [['', 'Work it out'], ['1', 'Yes, a touchscreen'], ['0', 'No, a mouse']] },
    { group: 'Look', key: 'motion', label: 'Movement', hint: 'The stage breathes on the beat.',
      tip: 'Auto follows your system’s reduce-motion setting.',
      type: 'select', def: '', options: [['', 'Follow the system'], ['always', 'Always on'], ['never', 'Hold still']] },
    { group: 'Look', key: 'swell', label: 'How much it breathes', hint: 'Small is the point.',
      type: 'range', min: 0, max: 0.02, step: 0.0005, def: 0.0045, fmt: (v) => v === 0 ? 'off' : (v * 100).toFixed(2) + '%' },
    { group: 'Look', key: 'scene', label: 'Artist photo behind the stage', hint: 'Greyed and tinted by the song.',
      type: 'range', min: 0, max: 0.4, step: 0.02, def: 0.16, fmt: (v) => v === 0 ? 'off' : pct(v) },
    // Off by default: Spotify rebuilds the whole full-screen layout around a Canvas and the stage has to fight it.
    // The still artwork is the design. The right panel keeps its video either way.
    { group: 'Look', key: 'canvas', label: 'Play the song’s video on the stage', hint: 'Off keeps the artwork square and still.',
      type: 'switch', def: '0' },

    { group: 'Colour', key: 'colour-pick', label: 'Colour', hint: 'Follow each song, or hold one colour everywhere, your lights included.',
      tip: 'Like a car’s ambient light: pick once and the glass, the type and the lights all stay on it.', type: 'colour', def: '' },

    { group: 'Wallpaper', key: 'wall', label: 'The picture behind the glass', hint: 'Any picture. One strong colour on a dark ground tints best.',
      tip: 'The theme finds the picture’s main colour and turns it to each song’s. It is kept on this machine and never uploaded.',
      type: 'wallpaper', def: '' },

    { group: 'Lyrics', key: 'lyric-lead-ms', label: 'Lyrics run early by', hint: 'Turn this up if the words arrive late.',
      tip: 'A Connect speaker plays ahead of the app, so Spotify’s own timing lags what you hear.',
      type: 'range', min: -500, max: 1200, step: 50, def: 350, fmt: (v) => v + ' ms' },
    { group: 'Lyrics', key: 'lyric-canvas', label: 'The song’s video behind the lyrics', hint: 'When the song has a Canvas. Off keeps the wallpaper.',
      type: 'switch', def: '1' },
    { group: 'Lyrics', key: 'beat-offset-ms', label: 'Beat runs early by', hint: 'Only if the swell feels off the beat.',
      type: 'range', min: -300, max: 300, step: 10, def: 0, fmt: (v) => v + ' ms' },

    { group: 'Room lights and keyboard', key: 'govee-url', label: 'Light server', hint: 'Optional. Leave it alone if you do not run one.',
      type: 'service', def: 'http://127.0.0.1:8197', check: (j) => j && typeof j.enabled === 'boolean', ok: 'lights answering' },
    { group: 'Room lights and keyboard', key: 'lights-feed', label: 'Send the song to your lights', hint: 'Its colour and beat, to the light server on this computer only.',
      tip: 'Off by default. Only ever sent to 127.0.0.1 or localhost, never across the network or the internet.', type: 'switch', def: '0' },
    { group: 'Room lights and keyboard', key: 'lights-list', label: 'Your lights', hint: 'Tick the ones that should follow the song.', type: 'lights' },
    { group: 'Room lights and keyboard', key: 'chroma-url', label: 'Razer keyboard', hint: 'Optional. Needs the bridge from the project running.',
      type: 'service', def: 'http://127.0.0.1:8198', check: (j) => j && j.app === 'glass-palette-chroma-bridge', ok: 'bridge running' },
  ];

  const WALL_OK = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
  const num = (k, d) => { const v = parseFloat(get(k, d)); return isNaN(v) ? d : v; };
  const apply = () => {
    root.style.setProperty('--og-ui', num('ui-scale', 1));
    root.style.setProperty('--og-scene-op', num('scene', 0.16));
    root.classList.toggle('office-glass-nocanvas', get('canvas', '1') !== '1');
    // Your own wallpaper: only ever a base64 image we encoded ourselves, so nothing else can reach the stylesheet.
    const wall = get('wall', '');
    const had = root.style.getPropertyValue('--og-wall');
    if (WALL_OK.test(wall)) root.style.setProperty('--og-wall', 'url("' + wall + '")'); else root.style.removeProperty('--og-wall');
    if (root.style.getPropertyValue('--og-wall') !== had && window.__ogMeasureWall) window.__ogMeasureWall();
    // Same rule runtime.js starts up with, so switching the knob back to "Work it out" actually re-decides rather
    // than leaving whichever answer was last forced. Set it, never merely add to it.
    const t = get('touch', '');
    root.classList.toggle('office-glass-touch', t === '1' || (t !== '0' && matchMedia('(pointer: coarse)').matches));
  };
  apply();
  window.__officeGlassApplyPrefs = apply;

  // (touch behaviour: drag to scroll, tap to play, the cursor. See src/touch.js.)

  // ---- the panel ------------------------------------------------------------------------------------------------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

  const serviceRow = (k) => {
    const wrap = el('div', 'og-set-service');
    const input = el('input', 'og-set-input');
    input.type = 'text'; input.spellcheck = false; input.value = get(k.key, k.def); input.placeholder = k.def;
    const btn = el('button', 'og-set-test', 'Test');
    const dot = el('span', 'og-set-dot');
    const note = el('span', 'og-set-note', 'not tested');
    const test = async () => {
      const url = (input.value || k.def).replace(/\/+$/, '');
      dot.className = 'og-set-dot og-wait'; note.textContent = 'asking…';
      try {
        const r = await fetch(url + '/status', { signal: AbortSignal.timeout(2500) });
        const j = await r.json();
        if (!k.check(j)) throw new Error('answered, but not what we expected');
        dot.className = 'og-set-dot og-ok'; note.textContent = k.ok;
      } catch (e) {
        dot.className = 'og-set-dot og-bad';
        note.textContent = /abort|timeout|failed/i.test(e.message) ? 'nothing answering' : e.message;
      }
    };
    input.addEventListener('change', () => { set(k.key, input.value.trim() === k.def ? '' : input.value.trim()); test(); });
    btn.addEventListener('click', test);
    wrap.append(input, btn, dot, note);
    setTimeout(test, 300);
    return wrap;
  };

  // Govee lights found by Glass Palette Lights (extras/lights): tick which ones follow the song, flash one to see
  // which it is. Talks only to the light server's own address, and only when this panel is open or you press a button.
  const lightsRow = () => {
    const wrap = el('div', 'og-set-lights');
    const bar = el('div', 'og-set-lights-bar');
    const find = el('button', 'og-set-test', 'Find lights');
    const note = el('span', 'og-set-note', 'asking…');
    const list = el('div', 'og-set-lights-list');
    bar.append(note, find); wrap.append(bar, list);
    const base = () => get('govee-url', 'http://127.0.0.1:8197').replace(/\/+$/, '');
    const call = async (p, body) => {
      const init = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
      const r = await fetch(base() + p, { ...init, signal: AbortSignal.timeout(6000) });
      return r.json();
    };
    const show = (s) => {
      list.replaceChildren();
      find.hidden = !(s && s.app === 'glass-palette-lights');
      if (!s) { note.textContent = 'No light server answering. extras/lights in the project sets one up.'; return; }
      if (s.app !== 'glass-palette-lights') { note.textContent = 'This light server manages its own lights.'; return; }
      note.textContent = s.lights.length ? s.lights.length + (s.lights.length === 1 ? ' light' : ' lights')
        : 'None found. Turn on LAN Control for each light in the Govee Home app, then Find lights.';
      for (const l of s.lights) {
        const row = el('label', 'og-set-light');
        const box = el('input'); box.type = 'checkbox'; box.checked = l.use;
        box.addEventListener('change', async () => { try { show(await call('/use', { id: l.id, use: box.checked })); } catch (e) { show(null); } });
        const name = el('div', 'og-set-light-name', l.sku);
        const sub = el('div', 'og-set-light-sub', '…' + String(l.id).slice(-5) + '  ' + l.ip);
        const fl = el('button', 'og-set-test', 'Flash');
        fl.addEventListener('click', (e) => { e.preventDefault(); call('/flash', { id: l.id }).catch(() => {}); });
        row.append(box, name, sub, fl);
        list.appendChild(row);
      }
    };
    find.addEventListener('click', async () => {
      find.disabled = true; note.textContent = 'Looking on your network…';
      try { show(await call('/scan', {})); } catch (e) { show(null); }
      find.disabled = false;
    });
    setTimeout(async () => { try { show(await call('/status')); } catch (e) { show(null); } }, 400);
    return wrap;
  };

  // A picture from your own disk, read in the page (FileReader, no upload), shrunk to what the stage can show and
  // re-encoded as WebP so it fits in localStorage: at most 1800 x 1200, quality stepped down until it is under about
  // 1.2 MB of text. The preview beside it is the same picture under the same tint, so it changes with the song.
  const wallRow = (k) => {
    const wrap = el('div', 'og-set-wall');
    const thumb = el('div', 'og-set-wall-thumb');
    const side = el('div', 'og-set-wall-side');
    const pick = el('button', 'og-set-test', 'Choose a picture');
    const back = el('button', 'og-set-test', 'Use the default');
    const note = el('span', 'og-set-note');
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const paint = (msg) => {
      const mine = WALL_OK.test(get(k.key, ''));
      back.hidden = !mine;
      const hue = root.dataset.ogWallHue;
      note.textContent = msg || ((mine ? 'Your picture' : 'The default') + (hue ? ', main colour ' + hue + '°' : ', no strong colour'));
    };
    pick.addEventListener('click', () => file.click());
    back.addEventListener('click', () => { set(k.key, null); apply(); setTimeout(paint, 700); paint('Back to the default…'); });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { paint('That is not a picture.'); return; }
      paint('Reading…');
      const fr = new FileReader();
      fr.onerror = () => paint('Could not read that file.');
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => paint('Could not open that picture.');
        img.onload = () => {
          const sc = Math.min(1, 1800 / img.naturalWidth, 1200 / img.naturalHeight);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let uri = '';
          for (const q of [0.82, 0.7, 0.55, 0.4]) { uri = c.toDataURL('image/webp', q); if (uri.length < 1200000) break; }
          if (!WALL_OK.test(uri) || uri.length >= 1200000) { paint('That picture is too big to keep. Try a smaller one.'); return; }
          try { set(k.key, uri); } catch (e) { paint('No room to keep it on this machine.'); return; }
          apply(); paint('Measuring its colour…'); setTimeout(paint, 700);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    side.append(el('div', 'og-set-wall-buttons'), note);
    side.firstChild.append(pick, back);
    wrap.append(thumb, side, file);
    paint(); setTimeout(paint, 1500);
    return wrap;
  };

  const controlFor = (k) => {
    if (k.type === 'service') return serviceRow(k);
    if (k.type === 'wallpaper') return wallRow(k);
    if (k.type === 'lights') return lightsRow(k);
    if (k.type === 'colour') {
      const wrap = el('div', 'og-set-colours');
      const SW = [['', 'Follow the song'], ['#ff453a', 'Red'], ['#ff8a3d', 'Amber'], ['#ffc83d', 'Gold'], ['#32d583', 'Green'],
                  ['#22d3ee', 'Cyan'], ['#3b82f6', 'Blue'], ['#8b5cf6', 'Violet'], ['#ec4899', 'Pink']];
      // any colour: the browser's own picker, under a "+" so it never reads as a black swatch before it is used
      const any = el('label', 'og-set-colour-custom'); any.title = 'Any colour'; any.setAttribute('aria-label', 'Any colour');
      const custom = el('input'); custom.type = 'color'; any.append(el('span', null, '+'), custom);
      const paint = () => {
        const v = get(k.key, '');
        for (const b of wrap.querySelectorAll('.og-set-swatch')) b.classList.toggle('on', b.dataset.v === v);
        const mine = !!v && !SW.some(([x]) => x === v);
        any.classList.toggle('on', mine); any.style.setProperty('--sw', mine ? v : 'transparent');
        if (v) custom.value = v;
      };
      const choose = (v) => { set(k.key, v); apply(); if (window.__ogReapplyColour) window.__ogReapplyColour(); paint(); };
      for (const [v, name] of SW) {
        const b = el('button', 'og-set-swatch' + (v ? '' : ' og-set-swatch-song'));
        b.dataset.v = v; b.title = name; b.setAttribute('aria-label', name);
        if (v) b.style.setProperty('--sw', v);
        b.addEventListener('click', () => choose(v));
        wrap.appendChild(b);
      }
      custom.addEventListener('input', () => choose(custom.value.toLowerCase()));
      wrap.appendChild(any);
      paint();
      return wrap;
    }
    if (k.type === 'switch') {
      const b = el('button', 'og-set-switch');
      const paint = () => { const on = get(k.key, k.def) === '1'; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); };
      b.setAttribute('role', 'switch');
      b.addEventListener('click', () => { set(k.key, get(k.key, k.def) === '1' ? '0' : '1'); paint(); apply(); });
      paint(); return b;
    }
    if (k.type === 'select') {
      const s = el('select', 'og-set-select');
      for (const [v, label] of k.options) { const o = el('option', null, label); o.value = v; s.appendChild(o); }
      s.value = get(k.key, k.def);
      s.addEventListener('change', () => { set(k.key, s.value); apply(); });
      return s;
    }
    const wrap = el('div', 'og-set-range');
    const r = el('input', null); r.type = 'range'; r.min = k.min; r.max = k.max; r.step = k.step; r.value = num(k.key, k.def);
    const out = el('span', 'og-set-value', (k.fmt || String)(+r.value));
    r.addEventListener('input', () => { out.textContent = (k.fmt || String)(+r.value); set(k.key, r.value); apply(); });
    wrap.append(r, out);
    return wrap;
  };

  const build = () => {
    const sec = el('section', 'og-settings');
    const head = el('div', 'og-set-head');
    head.append(el('h2', 'og-set-title', 'Glass Palette'),
                el('p', 'og-set-sub', 'A frosted-glass theme for Spotify. These settings live on this machine only.'));
    const reset = el('button', 'og-set-reset', 'Start over');
    reset.addEventListener('click', () => {
      for (const k of KNOBS) set(k.key, null);
      apply(); sec.replaceWith(build());
    });
    head.appendChild(reset);
    sec.appendChild(head);

    // one tap for "this is the screen I am sitting in front of"
    const matches = (p) => Object.keys(p.values).every((k) => String(get(k, KNOBS.find((x) => x.key === k).def)) === p.values[k]);
    sec.appendChild(el('h3', 'og-set-group', 'What are you watching this on?'));
    const row = el('div', 'og-set-presets');
    for (const p of PRESETS) {
      const b = el('button', 'og-set-preset' + (matches(p) ? ' on' : ''));
      b.append(el('span', 'og-set-preset-name', p.name), el('span', 'og-set-preset-note', p.note));
      b.addEventListener('click', () => { for (const k in p.values) set(k, p.values[k]); apply(); sec.replaceWith(build()); });
      row.appendChild(b);
    }
    sec.appendChild(row);
    sec.appendChild(el('p', 'og-set-aside', 'Everything below is already set for you. Change it only if something feels off.'));

    let group = null, list = null;
    for (const k of KNOBS) {
      if (k.group !== group) { group = k.group; sec.appendChild(el('h3', 'og-set-group', group)); list = el('div', 'og-set-list'); sec.appendChild(list); }
      const row = el('div', 'og-set-row');
      const text = el('div', 'og-set-text');
      text.append(el('span', 'og-set-label', k.label), el('span', 'og-set-hint', k.hint));
      if (k.tip) text.title = k.tip;                                     // the long why, only for whoever wants it
      row.append(text, controlFor(k));
      list.appendChild(row);
    }
    const foot = el('p', 'og-set-foot');
    foot.innerHTML = 'Full documentation and updates: <a href="https://github.com/matthewwoolley4/glass-palette" target="_blank" rel="noopener">github.com/matthewwoolley4/glass-palette</a>';
    sec.appendChild(foot);
    return sec;
  };

  // Spotify's settings page is a column of sections under an <h1>. Find it structurally, never by its hashed class
  // names: those change with every Spotify build and a theme that depends on them breaks on update day.
  const mount = () => {
    if (!/preferences|settings/.test(Spicetify.Platform.History.location.pathname)) return;
    if (document.querySelector('.og-settings')) return;
    const h1 = [...document.querySelectorAll('.main-view-container h1')][0];
    if (!h1) return;
    const titleBlock = h1.parentElement, column = titleBlock && titleBlock.parentElement;
    if (!column) return;
    titleBlock.after(build());
  };

  const observer = new MutationObserver(() => mount());
  observer.observe(document.body, { childList: true, subtree: true });
  Spicetify.Platform.History.listen(() => setTimeout(mount, 120));
  setTimeout(mount, 400);

  // a way in that does not require knowing the settings page exists
  if (Spicetify.Menu && Spicetify.Menu.Item) {
    try {
      new Spicetify.Menu.Item('Glass Palette settings', false, () => {
        Spicetify.Platform.History.push('/preferences');
        setTimeout(() => { const s = document.querySelector('.og-settings'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 700);
      }).register();
    } catch (e) { /* older Spicetify: the settings page still carries the panel */ }
  }
})();
