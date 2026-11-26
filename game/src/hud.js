// HUD: DOM flight instruments, score readouts and full screens for Sky Courier.
// One clear job: keep every number on screen truthful and readable at a glance.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    alt: $('hud-alt'), spd: $('hud-spd'), hdg: $('hud-hdg'), vs: $('hud-vs'),
    score: $('hud-score'), rings: $('hud-rings'), time: $('hud-time'),
    fuel: $('hud-fuel'), thr: $('hud-thr'), nextDist: $('hud-next-dist'),
    msg: $('hud-msg'),
    menu: $('screen-menu'), crash: $('screen-crash'), land: $('screen-land'), pause: $('screen-pause'),
    crashReason: $('crash-reason'), crashScore: $('crash-score'), crashRings: $('crash-rings'),
    landScore: $('land-score'), landTime: $('land-time'), landFuel: $('land-fuel'),
    status: $('status'),
  };

  let msgTimer = null;
  let muted = false;

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function headingDegrees(quat) {
    const x = quat.x, y = quat.y, z = quat.z, w = quat.w;
    // Rotate vector (0,0,-1) by quaternion: forward =
    // (-2(xz + wy), 2(wx - yz), 2(x^2 + y^2) - 1).
    const fwdX = -2 * (x * z + w * y);
    const fwdZ = 2 * (x * x + y * y) - 1;
    let deg = Math.atan2(fwdX, -fwdZ) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }

  function update(f, course, elapsed) {
    el.alt.textContent = String(Math.max(0, Math.round((f.pos.y - 6) * 3.28)));
    el.spd.textContent = String(Math.round(f.speed * 1.9));
    el.hdg.textContent = String(headingDegrees(f.quat)).padStart(3, '0');
    el.vs.textContent = String(Math.round(f.verticalSpeed * 3.28 * 60));
    el.score.textContent = String(f.score || 0);
    el.rings.textContent = course.passedCount + ' / ' + course.total;
    el.time.textContent = formatTime(elapsed);
    el.fuel.style.width = Math.max(0, Math.min(100, f.fuel)) + '%';
    el.thr.style.width = Math.round(f.throttle * 100) + '%';
    if (course.nextIndex < course.total) {
      const ring = course.rings[course.nextIndex];
      const dx = ring.center.x - f.pos.x;
      const dy = ring.center.y - f.pos.y;
      const dz = ring.center.z - f.pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      el.nextDist.textContent = Math.round(dist * 3.28) + ' FT';
    } else {
      el.nextDist.textContent = 'LAND NOW';
    }
  }

  function hideAllScreens() {
    el.menu.classList.add('hidden');
    el.crash.classList.add('hidden');
    el.land.classList.add('hidden');
    el.pause.classList.add('hidden');
  }

  function showScreen(name, data) {
    hideAllScreens();
    if (name === null) {
      el.hud.classList.remove('hidden');
      el.status.textContent = 'Flying.';
      return;
    }
    if (name === 'menu') {
      el.menu.classList.remove('hidden');
      el.hud.classList.add('hidden');
      el.status.textContent = 'Sky Courier menu. Press Enter to take off.';
    } else if (name === 'crash') {
      el.crash.classList.remove('hidden');
      el.hud.classList.remove('hidden');
      el.crashReason.textContent = data && data.reasonText ? data.reasonText : 'You clipped the terrain.';
      el.crashScore.textContent = String(data ? data.score : 0);
      el.crashRings.textContent = (data ? data.rings : 0) + ' / 12';
      el.status.textContent = 'Crashed. Press R to fly again.';
    } else if (name === 'landed') {
      el.land.classList.remove('hidden');
      el.hud.classList.remove('hidden');
      el.landScore.textContent = String(data ? data.score : 0);
      el.landTime.textContent = formatTime(data ? data.time : 0);
      el.landFuel.textContent = String(data ? Math.round(data.fuel) : 0);
      el.status.textContent = 'Mission complete. Press R to fly again.';
    } else if (name === 'paused') {
      el.pause.classList.remove('hidden');
      el.status.textContent = 'Paused.';
    }
  }

  function setMessage(text, ms) {
    el.msg.textContent = text;
    el.msg.classList.remove('hidden');
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.msg.classList.add('hidden'); el.msg.textContent = ''; }, ms || 2600);
  }

  function setMuted(m) { muted = !!m; }

  // Buttons are wired by main.js; hud only owns the DOM.
  return { update, showScreen, setMessage, setMuted, isMuted: () => muted, formatTime };
}
