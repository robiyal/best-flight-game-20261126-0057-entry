// aircraft.js – ES module, assumes global THREE.
// The Kestrel K-2: a friendly low-poly single-prop courier plane, built only
// from three.js primitives in one coherent cream-and-red style. Forward is -z.

// material palette
const creamMat = new THREE.MeshLambertMaterial({ color: 0xf2e6c9 });
const redMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
const darkGreyMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
const glassMat = new THREE.MeshPhongMaterial({
  color: 0x1d3a4d,
  shininess: 80,
  specular: 0x111111,
});

// ------------------------------------------------------------
// sub-builders
function buildFuselage() {
  const group = new THREE.Group();

  // main cylinder
  const cylGeom = new THREE.CylinderGeometry(0.9, 0.9, 5.2, 12, 1, true);
  const fuselage = new THREE.Mesh(cylGeom, creamMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = false;
  group.add(fuselage);

  // nose cone (points forward, -z: cone default +Y rotated -90 deg about X)
  const noseGeom = new THREE.ConeGeometry(0.9, 1, 12);
  const nose = new THREE.Mesh(noseGeom, redMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -2.6 - 0.5; // cylinder half-length + half cone height
  nose.castShadow = false;
  group.add(nose);

  // tail cone (points backward, +z)
  const tailGeom = new THREE.ConeGeometry(0.6, 0.8, 12);
  const tail = new THREE.Mesh(tailGeom, redMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 2.6 + 0.4;
  tail.castShadow = false;
  group.add(tail);

  return group;
}

function buildCanopy() {
  const geom = new THREE.SphereGeometry(1, 16, 16);
  const canopy = new THREE.Mesh(geom, glassMat);
  canopy.scale.set(0.8, 0.4, 0.8);
  canopy.position.y = 0.8;
  canopy.position.z = -0.5;
  canopy.castShadow = false;
  return canopy;
}

function buildWings() {
  const group = new THREE.Group();

  const halfSpan = 5.5; // total span 11
  const chord = 1.9;
  const thickness = 0.18;
  const dihedral = THREE.MathUtils.degToRad(4);

  // left half-wing: dihedral is a roll about the chord (z) axis, tip up
  const leftGeom = new THREE.BoxGeometry(halfSpan, thickness, chord);
  const leftWing = new THREE.Mesh(leftGeom, creamMat);
  leftWing.position.x = -halfSpan / 2;
  leftWing.position.z = 0;
  leftWing.rotation.z = -dihedral;
  leftWing.castShadow = false;
  group.add(leftWing);

  // right half-wing, mirrored
  const rightGeom = new THREE.BoxGeometry(halfSpan, thickness, chord);
  const rightWing = new THREE.Mesh(rightGeom, creamMat);
  rightWing.position.x = halfSpan / 2;
  rightWing.position.z = 0;
  rightWing.rotation.z = dihedral;
  rightWing.castShadow = false;
  group.add(rightWing);

  // wingtips (red boxes), raised with the dihedral
  const tipLift = halfSpan * Math.sin(dihedral) + 0.25;
  const tipGeom = new THREE.BoxGeometry(0.5, 0.2, 0.3);
  const leftTip = new THREE.Mesh(tipGeom, redMat);
  leftTip.position.set(-halfSpan - 0.25, tipLift, 0);
  leftTip.castShadow = false;
  group.add(leftTip);

  const rightTip = new THREE.Mesh(tipGeom, redMat);
  rightTip.position.set(halfSpan + 0.25, tipLift, 0);
  rightTip.castShadow = false;
  group.add(rightTip);

  // navigation lights: red left, green right
  const lightGeom = new THREE.SphereGeometry(0.15, 8, 8);
  const redLightMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000 });
  const greenLightMat = new THREE.MeshLambertMaterial({ color: 0x00ff00, emissive: 0x00ff00 });

  const leftLight = new THREE.Mesh(lightGeom, redLightMat);
  leftLight.position.set(-halfSpan - 0.25, tipLift + 0.1, 0);
  leftLight.castShadow = false;
  group.add(leftLight);

  const rightLight = new THREE.Mesh(lightGeom, greenLightMat);
  rightLight.position.set(halfSpan + 0.25, tipLift + 0.1, 0);
  rightLight.castShadow = false;
  group.add(rightLight);

  return group;
}

function buildTail() {
  const group = new THREE.Group();

  // horizontal stabilizer
  const stabGeom = new THREE.BoxGeometry(3.6, 0.12, 0.8);
  const stab = new THREE.Mesh(stabGeom, creamMat);
  stab.position.z = 2.6; // near rear
  stab.position.y = 0.2;
  stab.castShadow = false;
  group.add(stab);

  // vertical fin (red)
  const finGeom = new THREE.BoxGeometry(0.12, 1.0, 0.8);
  const fin = new THREE.Mesh(finGeom, redMat);
  fin.position.z = 2.6;
  fin.position.y = 0.7;
  fin.castShadow = false;
  group.add(fin);

  // red cheatline along each fuselage side (thin in x, long in z)
  const stripeGeom = new THREE.BoxGeometry(0.02, 0.12, 4.5);
  const stripeLeft = new THREE.Mesh(stripeGeom, redMat);
  stripeLeft.position.set(0.92, 0.1, 0);
  stripeLeft.castShadow = false;
  group.add(stripeLeft);
  const stripeRight = new THREE.Mesh(stripeGeom, redMat);
  stripeRight.position.set(-0.92, 0.1, 0);
  stripeRight.castShadow = false;
  group.add(stripeRight);

  return group;
}

function buildPropeller() {
  const propGroup = new THREE.Group();
  propGroup.position.z = -3.7; // just ahead of the nose tip

  // spinner cone (red, points forward -z)
  const spinnerGeom = new THREE.ConeGeometry(0.15, 0.3, 8);
  const spinner = new THREE.Mesh(spinnerGeom, redMat);
  spinner.rotation.x = -Math.PI / 2;
  spinner.castShadow = false;
  propGroup.add(spinner);

  // one bar = the two blades of the propeller
  const bladeGeom = new THREE.BoxGeometry(1.9, 0.12, 0.02);
  const blade = new THREE.Mesh(bladeGeom, darkGreyMat);
  blade.castShadow = false;
  propGroup.add(blade);

  return propGroup;
}

function buildLandingGear() {
  const group = new THREE.Group();

  const wheelRadius = 0.2;
  const wheelThickness = 0.05;
  // strut: vertical, long enough that the wheel bottom reaches y = -1.6
  const gearGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12);
  const wheelGeom = new THREE.TorusGeometry(wheelRadius, wheelThickness, 8, 16);

  // main left gear
  const leftGear = new THREE.Mesh(gearGeom, darkGreyMat);
  leftGear.position.set(-2, -0.9, 0);
  leftGear.castShadow = false;
  group.add(leftGear);

  // wheel: torus axis along x (axle spanwise), so it rolls forward
  const leftWheel = new THREE.Mesh(wheelGeom, darkGreyMat);
  leftWheel.rotation.y = Math.PI / 2;
  leftWheel.position.set(-2, -1.35, 0);
  leftWheel.castShadow = false;
  group.add(leftWheel);

  // main right gear
  const rightGear = new THREE.Mesh(gearGeom, darkGreyMat);
  rightGear.position.set(2, -0.9, 0);
  rightGear.castShadow = false;
  group.add(rightGear);

  const rightWheel = new THREE.Mesh(wheelGeom, darkGreyMat);
  rightWheel.rotation.y = Math.PI / 2;
  rightWheel.position.set(2, -1.35, 0);
  rightWheel.castShadow = false;
  group.add(rightWheel);

  // nose gear
  const noseGear = new THREE.Mesh(gearGeom, darkGreyMat);
  noseGear.position.set(0, -0.9, -2.2);
  noseGear.castShadow = false;
  group.add(noseGear);

  const noseWheel = new THREE.Mesh(wheelGeom, darkGreyMat);
  noseWheel.rotation.y = Math.PI / 2;
  noseWheel.position.set(0, -1.35, -2.2);
  noseWheel.castShadow = false;
  group.add(noseWheel);

  return group;
}

function buildExhaustStubs() {
  const group = new THREE.Group();

  // stubs point backward along z from the nose sides
  const stubGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8);
  const leftStub = new THREE.Mesh(stubGeom, redMat);
  leftStub.rotation.x = Math.PI / 2;
  leftStub.position.set(-0.4, -0.2, -2.3);
  leftStub.castShadow = false;
  group.add(leftStub);

  const rightStub = new THREE.Mesh(stubGeom, redMat);
  rightStub.rotation.x = Math.PI / 2;
  rightStub.position.set(0.4, -0.2, -2.3);
  rightStub.castShadow = false;
  group.add(rightStub);

  return group;
}

// ------------------------------------------------------------
// public factory
export function createAircraft() {
  const aircraft = new THREE.Group(); // overall group, forward = -z

  const fuselage = buildFuselage();
  aircraft.add(fuselage);

  const canopy = buildCanopy();
  aircraft.add(canopy);

  const wings = buildWings();
  aircraft.add(wings);

  const tail = buildTail();
  aircraft.add(tail);

  const propeller = buildPropeller();
  aircraft.add(propeller);

  const gear = buildLandingGear();
  aircraft.add(gear);

  const exhaust = buildExhaustStubs();
  aircraft.add(exhaust);

  // update function
  function update(dt, f) {
    // spin propeller
    propeller.rotation.z += dt * (4 + f.speed * 0.55 + f.throttle * 22);
  }

  return { group: aircraft, propeller, update };
}

// ------------------------------------------------------------
// shadow helper
export function createShadowBlob() {
  const geom = new THREE.CircleGeometry(3, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const blob = new THREE.Mesh(geom, mat);
  blob.rotation.x = -Math.PI / 2; // lay flat on XZ plane
  blob.castShadow = false;
  blob.receiveShadow = false;
  return blob;
}
