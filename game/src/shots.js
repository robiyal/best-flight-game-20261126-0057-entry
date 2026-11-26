// Screenshot presets: deterministic starting states for the maker's own screenshots.
// These only position the plane and the course inside the game's own code — the screenshots
// remain real renders of the game running in a browser. Forward is -z; identity
// quaternion faces -z, a yaw of PI faces +z.
import { RUNWAY } from './world.js';

export const SHOT_NAMES = ['cover', 'start', 'play', 'end'];

// flight: the object from createFlight (pos, quat, speed, throttle, fuel).
// course: the object from createRingCourse (reset, setPassed, rings, nextIndex, passedCount).
// Returns the mode main.js should enter for this shot: 'menu' | 'flying' | 'landed'.
export function applyShotPreset(flight, course, name) {
  if (name === 'start') {
    // Parked on the runway, title screen up, nose pointing -z down the strip.
    course.reset();
    flight.pos.set(RUNWAY.x, 7.6, RUNWAY.z + 120);
    flight.quat.setFromEuler(new THREE.Euler(0, 0, 0));
    flight.speed = 0;
    flight.throttle = 0;
    flight.fuel = 100;
    flight.verticalSpeed = 0;
    flight.grounded = true;
    return 'menu';
  }
  if (name === 'end') {
    // Just landed after a full run: all rings green, plane on the runway.
    course.setPassed(course.total);
    flight.pos.set(RUNWAY.x, 7.6, RUNWAY.z - 40);
    flight.quat.setFromEuler(new THREE.Euler(0, 0, 0));
    flight.speed = 0;
    flight.throttle = 0;
    flight.fuel = 62;
    flight.verticalSpeed = 0;
    flight.grounded = true;
    return 'landed';
  }
  if (name === 'play') {
    // Low over the lake between rings 7 and 8, banked toward ring 8.
    course.setPassed(7);
    flight.pos.set(480, 75, -300);
    // Face ring 8 at (420, 60, -120): mostly +z, slight bank.
    flight.quat.setFromEuler(new THREE.Euler(-0.02, 2.81, -0.22));
    flight.speed = 62;
    flight.throttle = 0.62;
    flight.fuel = 71;
    flight.verticalSpeed = 1.5;
    flight.grounded = false;
    return 'flying';
  }
  // Default 'cover': chasing the first ring over the valley, HUD lit, ring ahead.
  // Start close enough that the ring reads large in frame.
  course.reset();
  flight.pos.set(0, 75, 300);
  flight.quat.setFromEuler(new THREE.Euler(-0.02, 0, 0.06));
  flight.speed = 58;
  flight.throttle = 0.6;
  flight.fuel = 88;
  flight.verticalSpeed = 0.5;
  flight.grounded = false;
  return 'flying';
}
