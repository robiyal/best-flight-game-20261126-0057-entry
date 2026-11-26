// flight.js – ES module, relies on global THREE.
// Arcade flight model: throttle, lift, stall, banked turns, landings, crashes.
// Forward is -z; identity quaternion faces -z (down the valley toward ring 1).
const MAX_SPEED = 96;
const STALL_SPEED = 24;

// utility
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// create a fresh flight object
export function createFlight() {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    speed: 0,
    throttle: 0,
    fuel: 100,
    verticalSpeed: 0,
    grounded: false,
    crashed: false,
    score: 0,
    _prevGrounded: false, // internal flag for landed event
  };
}

// reset flight to runway or air start
export function resetFlight(f, start) {
  f.quat.set(0, 0, 0, 1); // identity: facing -z
  f.grounded = false;
  f.crashed = false;
  f._prevGrounded = false;
  f.verticalSpeed = 0;
  if (start === 'runway') {
    // Parked on the runway: terrain there is flattened to height 6, so 7.6
    // puts the wheels (1.6 below the origin) on the strip. Far end of the
    // strip, nose pointing -z down the runway toward the valley.
    f.pos.set(0, 7.6, 420);
    f.speed = 0;
    f.throttle = 0;
    f.fuel = 100;
  } else {
    // Airborne start just past the runway, heading -z toward ring 1.
    f.pos.set(0, 90, 620);
    f.speed = 55;
    f.throttle = 0.6;
    f.fuel = 100;
  }
}

// main update loop
export function updateFlight(f, input, dt, world) {
  if (f.crashed) return null;
  dt = Math.min(dt, 0.05);

  // throttle handling (input.throttleDelta is a per-second rate)
  f.throttle = clamp(
    f.throttle + input.throttleDelta * dt * 0.55,
    0,
    1
  );
  if (f.fuel <= 0) {
    f.throttle += (0 - f.throttle) * dt * 0.5;
  }

  // speed target with dive bonus
  let forward = flightForward(f);
  const pitchAngle = Math.asin(clamp(forward.y, -1, 1)); // positive = nose up
  let targetSpeed = f.throttle * MAX_SPEED;
  if (pitchAngle < 0) targetSpeed += -pitchAngle * 5; // dive bonus

  // accelerate toward target (the exponential approach already models drag:
  // no extra quadratic term, or the plane could never reach cruise speed)
  const accelFactor = 1 - Math.exp(-dt * 0.55);
  f.speed += (targetSpeed - f.speed) * accelFactor;

  // brake
  if (input.brake) {
    f.speed *= Math.max(0, 1 - dt * 1.2);
  }

  // attitude control (recompute forward after rotating: it was pre-rotation)
  applyControls(f, input, dt, pitchAngle);
  forward = flightForward(f);

  // lift, gravity, velocity vector
  const velocity = applyLiftAndGravity(f, dt, forward);

  // integrate position
  f.pos.addScaledVector(velocity, dt);
  f.verticalSpeed = velocity.y;

  // water crash check (before terrain)
  const groundY = world.terrainHeight(f.pos.x, f.pos.z);
  if (groundY < 2.5 && f.pos.y < 2.2) {
    f.crashed = true;
    return 'crashed-water';
  }

  // terrain collision / landing
  const groundResult = checkGround(f, world, groundY, dt);
  if (groundResult) {
    return groundResult;
  }

  // world bounds
  checkBounds(f, dt);

  // fuel consumption
  let drain = 0;
  if (!(f.grounded && f.speed < 5)) {
    drain = 0.25 + f.throttle * 1.15;
  }
  f.fuel = Math.max(0, f.fuel - drain * dt);
  if (f.fuel <= 0) {
    f.throttle = 0;
  }

  return null;
}

// ----- helper functions (non-exported) -----

function applyControls(f, input, dt, pitchAngle) {
  const speedFactor = clamp(f.speed / 45, 0.25, 1);
  const pitchRate = 0.85 * speedFactor;
  const rollRate = 1.7 * speedFactor;

  // pitch input: positive = pull up (rotate about local X)
  if (input.pitch !== 0) {
    const angle = input.pitch * pitchRate * dt;
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    f.quat.multiply(q); // local X
  }

  // roll input: positive = bank left (rotate about local Z)
  if (input.roll !== 0) {
    const angle = input.roll * rollRate * dt;
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    f.quat.multiply(q); // local Z
  }

  // auto-level roll
  if (input.roll === 0) {
    const bank = flightBankAngle(f);
    const maxDelta = 0.5 * dt;
    const delta = clamp(-bank, -maxDelta, maxDelta);
    if (Math.abs(delta) > 1e-5) {
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), delta);
      f.quat.multiply(q);
    }
  }

  // auto-level pitch
  if (input.pitch === 0) {
    const maxDelta = 0.15 * dt;
    const delta = clamp(-pitchAngle, -maxDelta, maxDelta);
    if (Math.abs(delta) > 1e-5) {
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), delta);
      f.quat.multiply(q);
    }
  }

  // banked turn (yaw from current bank)
  const bank = flightBankAngle(f);
  const yawRate = -bank * 0.45 * speedFactor * dt;
  if (Math.abs(yawRate) > 1e-6) {
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRate);
    f.quat.premultiply(q); // world Y
  }
}

function applyLiftAndGravity(f, dt, forward) {
  const vel = new THREE.Vector3();

  if (f.speed > STALL_SPEED) {
    vel.copy(forward).multiplyScalar(f.speed);
  } else {
    // reduced forward component
    vel.copy(forward).multiplyScalar(f.speed);
    // sink
    vel.y -= (STALL_SPEED - f.speed) * 0.55;
    // nose drops in a stall
    const angle = -0.25 * dt * (1 - f.speed / STALL_SPEED);
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    f.quat.multiply(q);
  }

  return vel;
}

function checkGround(f, world, groundY, dt) {
  const landingHeight = groundY + 1.6;
  if (f.pos.y <= landingHeight) {
    const onRunway =
      Math.abs(f.pos.x - world.RUNWAY.x) < world.RUNWAY.width / 2 &&
      Math.abs(f.pos.z - world.RUNWAY.z) < world.RUNWAY.length / 2;

    const bank = Math.abs(flightBankAngle(f));
    const gentle =
      f.speed < 34 &&
      f.verticalSpeed > -6 &&
      bank < 0.35;

    if (onRunway && gentle) {
      // snap to runway
      f.pos.y = landingHeight;
      f.speed *= Math.max(0, 1 - dt * 2);
      if (!f._prevGrounded) {
        f.grounded = true;
        f._prevGrounded = true;
        return 'landed';
      }
      f.grounded = true;
      return null;
    }
    // Hard impact: fast, steep, or badly banked arrival = crash.
    if (f.verticalSpeed < -8 || f.speed > 45 || bank > 0.6) {
      f.crashed = true;
      return 'crashed-terrain';
    }
    // Gentle ground roll (e.g. rolling off the runway end on flat grass):
    // stay on the ground, bleed speed, no crash.
    f.pos.y = landingHeight;
    f.speed *= Math.max(0, 1 - dt * 2);
    f.grounded = true;
    f._prevGrounded = true;
    return null;
  }
  f._prevGrounded = false; // still airborne
  f.grounded = false;
  return null;
}

function checkBounds(f, dt) {
  // soft ceiling
  if (f.pos.y > 260) {
    f.pos.y = 260;
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.2 * dt);
    f.quat.multiply(q);
  }

  // world edge steering
  const edge = 1900;
  if (Math.abs(f.pos.x) > edge || Math.abs(f.pos.z) > edge) {
    const toCenter = new THREE.Vector3(-f.pos.x, 0, -f.pos.z).normalize();
    const forward = flightForward(f);
    const forwardXZ = forward.clone();
    forwardXZ.y = 0;
    forwardXZ.normalize();

    const dot = forwardXZ.dot(toCenter);
    const cross = forwardXZ.clone().cross(toCenter).y;
    const angleDiff = Math.atan2(cross, dot);
    const yawDelta = angleDiff * 0.3 * dt;
    if (Math.abs(yawDelta) > 1e-6) {
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDelta);
      f.quat.premultiply(q);
    }

    // clamp position inside hard limits
    const limit = 1950;
    f.pos.x = Math.max(-limit, Math.min(limit, f.pos.x));
    f.pos.z = Math.max(-limit, Math.min(limit, f.pos.z));
  }
}

// exported helpers
export function flightForward(f) {
  const v = new THREE.Vector3(0, 0, -1);
  v.applyQuaternion(f.quat);
  v.normalize();
  return v;
}

export function flightBankAngle(f) {
  const up = new THREE.Vector3(0, 1, 0);
  up.applyQuaternion(f.quat);
  // bank = angle of the plane's up vector away from world up, in the x/y plane
  return Math.atan2(up.x, up.y);
}
