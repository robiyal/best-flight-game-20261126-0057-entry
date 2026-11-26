// rings.js – ES module, relies on global THREE.
// The 12-ring Alder Valley Ring Run: scenic tour from the runway, over the
// river and the lake, through the mountain gap, and back to land.
export const RING_COUNT = 12;

export function createRingCourse(scene, world) {
  const rawCenters = [
    [0, 55, 120],
    [-120, 70, -80],
    [-260, 85, -320],
    [-180, 110, -620],
    [60, 130, -820],
    [320, 120, -700],
    [520, 95, -420],
    [420, 60, -120],
    [180, 70, 60],
    [-40, 80, -140],
    [-160, 65, 80],
    [0, 50, 210],
  ];

  // adjust y to be above terrain
  const centers = rawCenters.map((c) => {
    const x = c[0];
    const z = c[2];
    const terrainY = world.terrainHeight(x, z);
    const minY = terrainY + 18;
    const y = Math.max(c[1], minY);
    return new THREE.Vector3(x, y, z);
  });

  // material colors
  const ORANGE_EMISSIVE = 0xff7a1a;
  const ORANGE_COLOR = 0xff8c2e;
  const GREEN_EMISSIVE = 0x2ecc71;
  const GREEN_COLOR = 0x27ae60;

  // ring storage
  const rings = [];

  // helper to build a single ring group
  function buildRing(index) {
    const center = centers[index];
    const nextCenter = index < centers.length - 1 ? centers[index + 1] : new THREE.Vector3(0, 0, -1);
    const geom = new THREE.TorusGeometry(9, 0.75, 12, 28);
    const mat = new THREE.MeshLambertMaterial({
      color: ORANGE_COLOR,
      emissive: ORANGE_EMISSIVE,
      emissiveIntensity: 0.9,
    });
    const torus = new THREE.Mesh(geom, mat);
    // Orient the ring so its hole faces along the course direction: the
    // torus axis is its local +z, so rotate +z onto the direction of travel.
    const lookAt = new THREE.Vector3().subVectors(nextCenter, center).normalize();
    torus.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lookAt);

    // beacon beam (vertical cylinder, rises from the ring centre)
    const beamGeom = new THREE.CylinderGeometry(0.35, 0.35, 60, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffb36b,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.position.y = 30; // half height above ring centre
    beam.visible = false;

    const group = new THREE.Group();
    group.add(torus);
    group.add(beam);
    group.position.copy(center);
    scene.add(group);

    return {
      center,
      mesh: group,
      torus,
      beam,
      material: mat,
      passed: false,
    };
  }

  for (let i = 0; i < RING_COUNT; i++) {
    rings.push(buildRing(i));
  }

  // particle burst pool
  const BURST_COUNT = 4;
  const PARTICLES_PER_BURST = 70;
  const bursts = [];

  function createBurst() {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLES_PER_BURST * 3);
    const velocities = new Float32Array(PARTICLES_PER_BURST * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9,
      color: 0xffd34d,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.visible = false;
    scene.add(points);
    return { points, positions, velocities, life: 0 };
  }

  for (let i = 0; i < BURST_COUNT; i++) {
    bursts.push(createBurst());
  }

  function spawnBurst(center) {
    const burst = bursts.find((b) => b.life <= 0);
    if (!burst) return;
    const { positions, velocities } = burst;
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      const idx = i * 3;
      positions[idx] = center.x;
      positions[idx + 1] = center.y;
      positions[idx + 2] = center.z;
      // random direction on sphere
      const phi = Math.random() * Math.PI * 2;
      const costheta = Math.random() * 2 - 1;
      const theta = Math.acos(costheta);
      const speed = 8 + Math.random() * 18; // 8..26
      velocities[idx] = Math.sin(theta) * Math.cos(phi) * speed;
      velocities[idx + 1] = Math.cos(theta) * speed;
      velocities[idx + 2] = Math.sin(theta) * Math.sin(phi) * speed;
    }
    burst.points.geometry.attributes.position.needsUpdate = true;
    burst.life = 1.1;
    burst.points.visible = true;
  }

  function updateBursts(dt) {
    const drag = Math.pow(0.5, dt); // simple exponential drag
    const gravity = -9.81 * 0.3 * dt; // gentle fall
    for (const b of bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.points.visible = false;
        continue;
      }
      const { positions, velocities } = b;
      for (let i = 0; i < PARTICLES_PER_BURST; i++) {
        const idx = i * 3;
        velocities[idx] *= drag;
        velocities[idx + 1] = velocities[idx + 1] * drag + gravity;
        velocities[idx + 2] *= drag;
        positions[idx] += velocities[idx] * dt;
        positions[idx + 1] += velocities[idx + 1] * dt;
        positions[idx + 2] += velocities[idx + 2] * dt;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      const opacity = Math.max(0, b.life / 1.1);
      b.points.material.opacity = opacity;
    }
  }

  let nextIndex = 0;
  let passedCount = 0;

  function markPassed(ring) {
    ring.passed = true;
    ring.material.color.setHex(GREEN_COLOR);
    ring.material.emissive.setHex(GREEN_EMISSIVE);
    ring.material.emissiveIntensity = 0.9;
    ring.torus.scale.set(1, 1, 1);
  }

  function reset() {
    for (const r of rings) {
      r.passed = false;
      r.material.color.setHex(ORANGE_COLOR);
      r.material.emissive.setHex(ORANGE_EMISSIVE);
      r.material.emissiveIntensity = 0.9;
      r.torus.scale.set(1, 1, 1);
      r.beam.visible = false;
    }
    nextIndex = 0;
    passedCount = 0;
    for (const b of bursts) {
      b.life = 0;
      b.points.visible = false;
    }
  }

  // Mark the first `count` rings as already passed (screenshot presets).
  function setPassed(count) {
    reset();
    const n = Math.max(0, Math.min(RING_COUNT, count));
    for (let i = 0; i < n; i++) {
      markPassed(rings[i]);
    }
    nextIndex = n;
    passedCount = n;
  }

  function checkPass(pos) {
    if (nextIndex >= RING_COUNT) return false;
    const targetRing = rings[nextIndex];
    if (targetRing.passed) return false;
    const distSq = pos.distanceToSquared(targetRing.center);
    if (distSq < 8.5 * 8.5) {
      markPassed(targetRing);
      spawnBurst(targetRing.center);
      nextIndex++;
      passedCount++;
      return true;
    }
    return false;
  }

  function update(dt, elapsed) {
    // pulse next ring
    if (nextIndex < RING_COUNT) {
      const ring = rings[nextIndex];
      const intensity = 1.2 + 0.5 * Math.sin(elapsed * 4);
      const scale = 1 + 0.03 * Math.sin(elapsed * 4);
      ring.material.emissiveIntensity = intensity;
      ring.torus.scale.set(scale, scale, scale);
      ring.beam.visible = true;
    }
    // hide beam on previous ring(s)
    for (let i = 0; i < nextIndex; i++) {
      rings[i].beam.visible = false;
      if (!rings[i].passed) {
        rings[i].material.emissiveIntensity = 0.9;
        rings[i].torus.scale.set(1, 1, 1);
      }
    }
    updateBursts(dt);
  }

  return {
    rings,
    total: RING_COUNT,
    get nextIndex() { return nextIndex; },
    get passedCount() { return passedCount; },
    reset,
    setPassed,
    checkPass,
    update,
  };
}
