// main.js – ES module that boots Sky Courier: Ring Run over Alder Valley.
// Wires world, flight model, aircraft, ring course, HUD, audio and shots
// into one game loop with a chase camera, state machine and shot mode.
import { createWorld, RUNWAY } from './world.js';
import { createFlight, resetFlight, updateFlight, flightForward, flightBankAngle } from './flight.js';
import { createAircraft, createShadowBlob } from './aircraft.js';
import { createRingCourse } from './rings.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { applyShotPreset } from './shots.js';

// core objects
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);
camera.position.set(0, 5, 10);

const world = createWorld(scene);
const flight = createFlight();
const aircraft = createAircraft();
scene.add(aircraft.group);
const shadowBlob = createShadowBlob();
scene.add(shadowBlob);
const course = createRingCourse(scene, world);
const hud = createHud();
const audio = createAudio();

let mode = 'menu';
let score = 0;
let elapsed = 0; // mission timer, counts only while flying
let totalElapsed = 0; // total animation time
let trauma = 0;
let shotMode = null; // null or 'cover'|'start'|'play'|'end'
let shotCamera = false;

// input handling
const keys = new Set();
let mouseDrag = false;
let dragStart = { x: 0, y: 0 };
let mouseDelta = { pitch: 0, roll: 0 };
let touchInfo = { count: 0, startDist: 0 };
let throttleDelta = 0;

function buildInput() {
  const input = { pitch: 0, roll: 0, throttleDelta: 0, brake: false };
  // arrows: pitch and roll. A/D: roll. W/S: throttle (per-second rate).
  if (keys.has('ArrowUp')) input.pitch = 1;
  if (keys.has('ArrowDown')) input.pitch = -1;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) input.roll = 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) input.roll = -1;
  if (keys.has('Space')) input.brake = true;
  // throttle via keys (rate per second; updateFlight scales by dt * 0.55)
  if (keys.has('KeyW')) throttleDelta += 1.0;
  if (keys.has('KeyS')) throttleDelta -= 1.0;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttleDelta += 2.0;
  if (keys.has('ControlLeft') || keys.has('ControlRight')) throttleDelta -= 2.0;
  // mouse drag steering
  input.pitch += mouseDelta.pitch;
  input.roll += mouseDelta.roll;
  // clamp
  input.pitch = Math.max(-1, Math.min(1, input.pitch));
  input.roll = Math.max(-1, Math.min(1, input.roll));
  input.throttleDelta = throttleDelta;
  // reset per-frame accumulators
  mouseDelta.pitch = 0;
  mouseDelta.roll = 0;
  throttleDelta = 0;
  return input;
}

// camera update
function updateCamera(dt) {
  const forward = flightForward(flight).clone().normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(flight.quat);
  const back = forward.clone().multiplyScalar(-13.5);
  const desiredPos = flight.pos.clone().add(back).addScaledVector(up, 4.2);
  // shake
  if (trauma > 0) {
    const shake = trauma * trauma * 0.6;
    desiredPos.x += (Math.random() * 2 - 1) * shake;
    desiredPos.y += (Math.random() * 2 - 1) * shake;
    desiredPos.z += (Math.random() * 2 - 1) * shake;
    trauma -= dt * 1.2;
    if (trauma < 0) trauma = 0;
  }
  // lerp position
  const lerpFactor = 1 - Math.exp(-dt * 6);
  camera.position.lerp(desiredPos, lerpFactor);
  // up smoothing: mostly world-up so the horizon never rolls hard
  const targetUp = up.clone().multiplyScalar(0.35).addScaledVector(new THREE.Vector3(0, 1, 0), 0.65);
  const camUp = camera.up.clone().lerp(targetUp, lerpFactor);
  camera.up.copy(camUp);
  // lookAt target
  const lookAt = flight.pos.clone().addScaledVector(forward, 12).addScaledVector(up, 1);
  camera.lookAt(lookAt);
  // fov adjust with speed
  const targetFov = 62 + flight.speed * 0.12;
  if (Math.abs(camera.fov - targetFov) > 0.5) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  // shot camera override (start shot: low front-quarter view of the parked plane,
  // looking slightly above it so the plane shows below the title panel)
  if (shotCamera) {
    const offset = new THREE.Vector3(12, 4.5, -16);
    const camPos = flight.pos.clone().add(offset);
    camera.position.copy(camPos);
    camera.lookAt(flight.pos.clone().add(new THREE.Vector3(0, 6, 0)));
  }
}

// start game
function startGame() {
  audio.unlock();
  audio.click();
  resetFlight(flight, 'air');
  flight.throttle = 0.6;
  score = 0;
  flight.score = 0;
  elapsed = 0;
  course.reset();
  mode = 'flying';
  hud.showScreen(null);
  hud.setMessage('Rotate at 40 knots — fly through the rings!', 5000);
}

// restart game
function restartGame() {
  audio.unlock();
  resetFlight(flight, 'air');
  course.reset();
  score = 0;
  flight.score = 0;
  flight.fuel = 100;
  elapsed = 0;
  mode = 'flying';
  hud.showScreen(null);
  hud.setMessage('', 0);
}

// crash handling
function onCrash(reason) {
  mode = 'crashed';
  trauma = 1;
  audio.crash();
  const reasonText = reason === 'crashed-water'
    ? 'You ditched in the lake.'
    : 'You clipped the terrain.';
  hud.showScreen('crash', { reasonText, score, rings: course.passedCount });
}

// landing handling
function onLanded() {
  if (course.passedCount === course.total) {
    const timeBonus = Math.max(0, 300 - Math.floor(elapsed));
    const fuelBonus = Math.round(flight.fuel) * 2;
    const ringBonus = 500;
    const totalScore = score + ringBonus + fuelBonus + timeBonus;
    score = totalScore;
    flight.score = totalScore;
    mode = 'landed';
    audio.land();
    hud.showScreen('landed', { score: totalScore, time: Math.round(elapsed), fuel: Math.round(flight.fuel), rings: course.total });
  } else {
    flight.fuel = 100;
    hud.setMessage('Refuelled — back in the air!', 3000);
    // keep flying, grounded flag handled by flight logic
  }
}

// autopilot for shot mode: gently steer toward the next ring so the
// framing stays cinematic and stable while screenshots are taken.
function applyAutopilot(dt) {
  if (mode !== 'flying') return;
  const nextRing = course.rings[course.nextIndex];
  if (!nextRing) return;
  const m = new THREE.Matrix4().lookAt(flight.pos, nextRing.center, new THREE.Vector3(0, 1, 0));
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
  flight.quat.slerp(targetQuat, 1 - Math.exp(-dt * 1.5));
  flight.throttle = 0.55;
}

// main loop
const clock = new THREE.Clock();
let firstRenderDone = false;
function animate() {
  const dtRaw = clock.getDelta();
  const dt = Math.min(dtRaw, 0.05);
  totalElapsed += dt;

  const input = buildInput();

  if (mode === 'flying') {
    const result = updateFlight(flight, input, dt, world);
    if (result === 'crashed-terrain' || result === 'crashed-water') {
      onCrash(result);
    } else if (result === 'landed') {
      onLanded();
    }
    // ring pass check
    if (mode === 'flying' && course.checkPass(flight.pos)) {
      const speed = flight.speed;
      score += 100;
      if (speed > 60) score += 25;
      flight.score = score;
      trauma = Math.min(1, trauma + 0.55);
      audio.ring();
      if (course.passedCount === course.total) {
        hud.setMessage('All rings flown — land on the runway!', 4000);
      } else {
        hud.setMessage('Ring ' + course.passedCount + ' / ' + course.total + '!', 1600);
      }
    }
    elapsed += dt;
  }

  // autopilot for shot mode
  if (shotMode) {
    applyAutopilot(dt);
  }

  aircraft.update(dt, flight);
  aircraft.group.position.copy(flight.pos);
  aircraft.group.quaternion.copy(flight.quat);
  world.update(dt, totalElapsed);
  course.update(dt, totalElapsed);
  // shadow blob
  const groundY = world.terrainHeight(flight.pos.x, flight.pos.z);
  const altitude = flight.pos.y - groundY;
  shadowBlob.position.set(flight.pos.x, groundY + 0.15, flight.pos.z);
  const blobScale = THREE.MathUtils.clamp(1.6 - altitude / 220, 0.25, 1.6);
  shadowBlob.scale.set(blobScale, blobScale, blobScale);
  shadowBlob.material.opacity = THREE.MathUtils.clamp(1 - altitude / 260, 0, 1);
  shadowBlob.visible = altitude <= 260;

  updateCamera(dt);
  hud.update(flight, course, elapsed);
  audio.setEngine(flight.throttle, flight.speed, mode === 'flying');
  renderer.render(scene, camera);

  if (!firstRenderDone) {
    firstRenderDone = true;
    // shot handling
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      shotMode = shot;
      const returnedMode = applyShotPreset(flight, course, shot);
      mode = returnedMode;
      if (returnedMode === 'landed') {
        // keep the HUD numbers consistent with the mission-complete panel
        score = 1840;
        flight.score = 1840;
        elapsed = 212;
        hud.showScreen('landed', { score: 1840, time: 212, fuel: 62, rings: 12 });
      } else if (returnedMode === 'menu') {
        hud.showScreen('menu');
        shotCamera = (shot === 'start');
      } else if (returnedMode === 'flying') {
        hud.showScreen(null);
      }
      // keep the HUD numbers truthful in shot mode
      if (returnedMode === 'flying') {
        score = course.passedCount * 100;
        flight.score = score;
      }
    }
    window.__gameReady = true;
  }

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// key handling
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Enter', 'KeyR', 'KeyP', 'KeyM'].includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'menu') startGame();
  if (e.code === 'KeyR' && mode !== 'menu') restartGame();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'flying') {
      mode = 'paused';
      hud.showScreen('paused');
    } else if (mode === 'paused') {
      mode = 'flying';
      hud.showScreen(null);
    }
  }
  if (e.code === 'KeyM') {
    const muted = !audio.muted();
    audio.setMuted(muted);
    hud.setMuted(muted);
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

// pointer handling: drag steers (pointer events cover mouse and touch)
renderer.domElement.addEventListener('pointerdown', (e) => {
  mouseDrag = true;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!mouseDrag) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  mouseDelta.roll += dx * 0.0022;
  mouseDelta.pitch -= dy * 0.0022;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
});
renderer.domElement.addEventListener('pointerup', () => {
  mouseDrag = false;
});
renderer.domElement.addEventListener('pointercancel', () => {
  mouseDrag = false;
});

// two-finger touch adjusts throttle (pinch in/out)
renderer.domElement.addEventListener('touchstart', (e) => {
  touchInfo.count = e.touches.length;
  if (touchInfo.count === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchInfo.startDist = Math.hypot(dx, dy);
  }
});
renderer.domElement.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const delta = (dist - touchInfo.startDist) * 0.001;
    throttleDelta += delta;
    touchInfo.startDist = dist;
  }
});
renderer.domElement.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) touchInfo.count = e.touches.length;
  if (e.touches.length === 0) {
    mouseDrag = false;
  }
});

// buttons
const startBtn = document.getElementById('start-btn');
if (startBtn) {
  startBtn.addEventListener('click', startGame);
}
const retryBtn = document.getElementById('retry-btn');
if (retryBtn) {
  retryBtn.addEventListener('click', restartGame);
}
const againBtn = document.getElementById('again-btn');
if (againBtn) {
  againBtn.addEventListener('click', restartGame);
}
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
  resumeBtn.addEventListener('click', () => {
    if (mode === 'paused') {
      mode = 'flying';
      hud.showScreen(null);
    }
  });
}

// expose for debugging
window.__game = { get mode() { return mode; }, flight, course };

document.title = 'Sky Courier — Ring Run over Alder Valley';
