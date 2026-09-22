// Glass Palette: everything a finger needs that a mouse does not.
// A USB touchscreen on macOS reports maxTouchPoints 0 and sends plain mouse events, so the browser's own touch
// scrolling never runs: dragging a list selects text instead of moving it, and Spotify has no other way to scroll
// without a wheel. Nothing here is guesswork about the hardware; it all keys off the theme's touch mode, which the
// settings page owns.
(function officeGlassTouchBehaviour() {
  if (!document.body) { setTimeout(officeGlassTouchBehaviour, 300); return; }
  const root = document.documentElement;
  const on = () => root.classList.contains('office-glass-touch');
  // classList.add/remove re-writes the class attribute even when nothing changed, and a re-write is a mutation
  // record like any other. Anything watching root's class must therefore only write when the answer actually
  // differs, or the observer feeds itself microtasks forever and the renderer never paints again.
  const setClass = (name, want) => { if (root.classList.contains(name) !== want) root.classList.toggle(name, want); };

  // ---- drag to scroll ----------------------------------------------------------------------------------------
  // Things a drag must not be stolen from: the real draggable controls. `[draggable="true"]` used to be in here, on
  // the reasoning that anything the app marks draggable wants its own gesture. Spotify marks nearly every row in
  // every list draggable, including all 23 rows of the left library, so that one selector silently switched
  // drag-to-scroll off almost everywhere it was needed ("i cant finger scroll the left menu").
  // Measured: a finger drag on a library row moved a scroller with 16,016 px of range by exactly 0 px.
  const KEEP = 'input[type="range"], [role="slider"], .progress-bar, .volume-bar, .x-progressBar-progressBar';
  const scrollerFrom = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight - e.clientHeight > 4) return e;
    }
    return null;
  };

  let drag = null, glideRaf = 0, quietClicksUntil = 0;
  const stopGlide = () => { if (glideRaf) cancelAnimationFrame(glideRaf); glideRaf = 0; };
  const glide = (sc, v) => {                                             // v is px per ms, sign follows the finger
    let vel = -v * 16;                                                   // to px per frame, and the list follows the finger
    const step = () => {
      vel *= 0.94;
      if (Math.abs(vel) < 0.35) { glideRaf = 0; return; }
      const before = sc.scrollTop;
      sc.scrollTop += vel;
      if (sc.scrollTop === before) { glideRaf = 0; return; }             // hit the end: stop rather than spin
      glideRaf = requestAnimationFrame(step);
    };
    glideRaf = requestAnimationFrame(step);
  };

  document.addEventListener('pointerdown', (ev) => {
    if (!on() || ev.button !== 0 || !ev.isPrimary) return;
    if (ev.target.closest && ev.target.closest(KEEP)) return;
    const sc = scrollerFrom(ev.target);
    if (!sc) return;
    stopGlide();
    drag = { sc, id: ev.pointerId, y: ev.clientY, top: sc.scrollTop, moved: 0, lastY: ev.clientY, t: performance.now(), v: 0 };
  }, true);

  document.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 5) return;                         // a tap is allowed a few pixels of wobble
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    setClass('office-glass-dragging', true);
    drag.sc.scrollTop = drag.top - dy;
    const now = performance.now(), dt = now - drag.t;
    if (dt > 10) { drag.v = (ev.clientY - drag.lastY) / dt; drag.t = now; drag.lastY = ev.clientY; }
    ev.preventDefault();
  }, true);

  const endDrag = (ev) => {
    if (!drag || (ev.pointerId !== undefined && ev.pointerId !== drag.id)) return;
    const { sc, v, moved } = drag;
    drag = null;
    setClass('office-glass-dragging', false);
    if (moved <= 5) return;                                              // that was a tap after all
    quietClicksUntil = performance.now() + 350;                          // a scroll must never also open or play something
    if (performance.now() - 0 && Math.abs(v) > 0.05) glide(sc, v);
  };
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  // Letting the rows out of KEEP is only half of it. The browser still starts its own HTML5 drag on a draggable
  // element as soon as the pointer moves, and once that begins the element follows the finger and the list does not
  // move at all. In touch mode, scrolling wins: a finger that cannot scroll the library has no other way to reach
  // anything in it, while dragging a row somewhere is still available from the row's own right-click menu. A mouse
  // is untouched, so ordinary drag and drop still works exactly as Spotify intends.
  document.addEventListener('dragstart', (ev) => { if (on()) ev.preventDefault(); }, true);

  // registered before the tap-to-play handler below, so a drag is swallowed before anything acts on it
  document.addEventListener('click', (ev) => {
    if (performance.now() < quietClicksUntil) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);

  // ---- one tap plays a song ----------------------------------------------------------------------------------
  // Spotify plays a track row on double-click and only selects it on a single one. With a finger that reads as the
  // app ignoring you ("struggling ... selecting songs").
  document.addEventListener('click', (ev) => {
    if (!on() || ev.detail > 1 || ev.__ogReplay) return;
    const row = ev.target.closest && ev.target.closest('.main-trackList-trackListRow');
    if (!row) return;
    if (ev.target.closest('button, a, input, [role="button"], [role="checkbox"]')) return;
    const dbl = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, clientX: ev.clientX, clientY: ev.clientY, detail: 2 });
    dbl.__ogReplay = true;
    ev.target.dispatchEvent(dbl);
  }, true);

  // ---- the progress bar does not rewind ----------------------------------------------------------------------
  // Spotify glides the fill over a second on every update. On a song change, or any jump backward, that reads as a
  // slow glitchy rewind. Snap it for those, then give the glide back.
  if (window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener) {
    let snapTimer = null, lastPos = 0;
    const snap = () => {
      setClass('office-glass-snap', true);
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => setClass('office-glass-snap', false), 1300);
    };
    Spicetify.Player.addEventListener('songchange', snap);
    Spicetify.Player.addEventListener('onprogress', (e) => {
      const p = (e && e.data) || 0;
      if (p < lastPos - 3000) snap();
      lastPos = p;
    });
  }

  // ---- the mouse arrow stays out of the way ------------------------------------------------------------------
  // macOS has no touch mode: every tap drags the arrow to your finger and leaves it sitting there. Hide it, and
  // bring it back only while a real mouse is moving, which a tap never looks like (a run of small movements).
  let moves = 0, hideTimer = null;
  document.addEventListener('mousemove', () => {
    if (!on()) { setClass('office-glass-nocursor', false); return; }
    if (drag) return;
    if (++moves < 4) return;
    setClass('office-glass-nocursor', false);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { moves = 0; setClass('office-glass-nocursor', true); }, 3000);
  }, { passive: true, capture: true });
  document.addEventListener('pointerdown', () => { moves = 0; }, { passive: true, capture: true });
  // Touch mode can be switched on from the settings page long after this ran, so the cursor has to be re-armed when
  // it is. Poll rather than observe: an observer on the same attribute we write is the loop described above, and a
  // check this cheap every couple of seconds costs nothing measurable.
  const armCursor = () => setClass('office-glass-nocursor', on() && !drag && moves < 4);
  armCursor();
  setInterval(armCursor, 2000);
})();
