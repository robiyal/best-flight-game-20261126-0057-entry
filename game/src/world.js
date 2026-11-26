// world.js – ES module, relies on global THREE.
// Alder Valley: procedural terrain, river, lake, town, runway, sky, clouds, mountains.
export const WORLD_SIZE = 4000;
export const RUNWAY = { x: 0, z: 300, heading: 0, length: 340, width: 26 };

function hash2(ix, iz) {
  // 32-bit integer hash, deterministic
  let h = ix * 374761393 + iz * 668265263; // large primes
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const fx1 = smooth(fx);
  const fz1 = smooth(fz);
  const h00 = hash2(ix, iz) / 0xffffffff;
  const h10 = hash2(ix + 1, iz) / 0xffffffff;
  const h01 = hash2(ix, iz + 1) / 0xffffffff;
  const h11 = hash2(ix + 1, iz + 1) / 0xffffffff;
  const ix0 = lerp(h00, h10, fx1);
  const ix1 = lerp(h01, h11, fx1);
  return lerp(ix0, ix1, fz1);
}
export function terrainHeight(x, z) {
  // base noise – three octaves of rolling hills
  let amp = 95;
  let freq = 0.0016;
  let h = 0;
  for (let i = 0; i < 3; i++) {
    h += noise2(x * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  // river valley: carve a shallow channel so water shows as a river
  const riverZ = 200 + 500 * Math.sin(x * 0.0009);
  const distToRiver = Math.abs(z - riverZ);
  const riverFalloff = Math.max(0, 1 - distToRiver / 30);
  h = lerp(h, 0, riverFalloff);
  // lake near (420, -120): a wide depression that holds water
  const lakeDx = (x - 420) / 300;
  const lakeDz = (z + 120) / 220;
  const lakeDist = Math.sqrt(lakeDx * lakeDx + lakeDz * lakeDz);
  const lakeFalloff = Math.max(0, 1 - lakeDist);
  h = lerp(h, 0, lakeFalloff * lakeFalloff);
  // runway flattening: smooth falloff within 260 units of the strip centre line
  const perpDist = Math.abs(x - RUNWAY.x);
  const runwayFalloff = Math.max(0, 1 - Math.max(perpDist - RUNWAY.width / 2, 0) / 260);
  h = lerp(h, 6, runwayFalloff);
  // town flattening
  const inTownX = Math.abs(x) < 260;
  const inTownZ = z > 480 && z < 820;
  if (inTownX && inTownZ) {
    h = lerp(h, 8, 1);
  }
  // clamp
  if (h < 0) h = 0;
  if (h > 150) h = 150;
  return h;
}
export function createWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);
  const objects = {};
  // -----------------------------------------------------------------
  // build terrain
  function buildTerrain() {
    const seg = 140;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    const normal = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const nY = Math.abs(normal.getY(i));
      let r = 0, g = 0, b = 0;
      if (y < 3) {
        r = 0.94; g = 0.86; b = 0.73; // sand
      } else if (y < 45) {
        const green = lerp(0.6, 0.4, nY); // darker on steep slopes
        r = 0.13; g = green; b = 0.13; // grass
      } else if (y < 70) {
        r = 0.45; g = 0.47; b = 0.42; // dark forest / scrub
      } else if (y < 105) {
        r = 0.55; g = 0.55; b = 0.58; // rock
      } else {
        r = 0.96; g = 0.96; b = 0.98; // snow
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    world.add(mesh);
    objects.terrain = mesh;
  }
  // -----------------------------------------------------------------
  // build water
  function buildWater() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x2e6f9e,
      transparent: true,
      opacity: 0.82,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.2;
    world.add(mesh);
    objects.water = mesh;
  }
  // -----------------------------------------------------------------
  // build runway: the group sits at the runway centre; children are relative to it
  function buildRunway() {
    const group = new THREE.Group();
    group.position.set(RUNWAY.x, 0, RUNWAY.z);
    const baseY = terrainHeight(RUNWAY.x, RUNWAY.z) + 0.3;
    const planeGeo = new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.set(0, baseY, 0);
    group.add(plane);
    // edge lines
    const edgeGeo = new THREE.BoxGeometry(0.5, 0.2, RUNWAY.length);
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leftEdge = new THREE.Mesh(edgeGeo, edgeMat);
    const rightEdge = new THREE.Mesh(edgeGeo, edgeMat);
    leftEdge.position.set(-RUNWAY.width / 2 + 0.25, baseY + 0.11, 0);
    rightEdge.position.set(RUNWAY.width / 2 - 0.25, baseY + 0.11, 0);
    group.add(leftEdge, rightEdge);
    // center dashes every 24 units
    const dashGeo = new THREE.BoxGeometry(0.5, 0.2, 12);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const dashCount = Math.floor(RUNWAY.length / 24);
    for (let i = 0; i < dashCount; i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(0, baseY + 0.11, -RUNWAY.length / 2 + 12 + i * 24);
      group.add(dash);
    }
    // threshold bars
    const threshGeo = new THREE.BoxGeometry(RUNWAY.width, 0.3, 2);
    const threshMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const thresh1 = new THREE.Mesh(threshGeo, threshMat);
    const thresh2 = new THREE.Mesh(threshGeo, threshMat);
    thresh1.position.set(0, baseY + 0.15, RUNWAY.length / 2 - 1);
    thresh2.position.set(0, baseY + 0.15, -RUNWAY.length / 2 + 1);
    group.add(thresh1, thresh2);
    // windsock pole + cone
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(RUNWAY.width / 2 + 2, baseY + 3, 0);
    group.add(pole);
    const coneGeo = new THREE.ConeGeometry(0.8, 2, 8);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xffa500 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 3, 0);
    cone.rotation.z = Math.PI / 8;
    pole.add(cone);
    objects.windsock = cone;
    world.add(group);
    objects.runway = group;
  }
  // -----------------------------------------------------------------
  // build town "Alderfield"
  function buildTown() {
    const group = new THREE.Group();
    const houseColors = [0xf5e1a4, 0xc85a17, 0x5a6e73, 0x8b9a5b];
    const townXMin = -260, townXMax = 260, townZMin = 480, townZMax = 820;
    const houseCount = 42;
    for (let i = 0; i < houseCount; i++) {
      const tx = townXMin + Math.random() * (townXMax - townXMin);
      const tz = townZMin + Math.random() * (townZMax - townZMin);
      const baseY = terrainHeight(tx, tz) + 0.1;
      const w = 12 + Math.random() * 8;
      const d = 12 + Math.random() * 8;
      const h = 8 + Math.random() * 12;
      const houseGeo = new THREE.BoxGeometry(w, h, d);
      const houseMat = new THREE.MeshLambertMaterial({ color: houseColors[i % houseColors.length] });
      const house = new THREE.Mesh(houseGeo, houseMat);
      house.position.set(tx, baseY + h / 2, tz);
      // roof as 4-sided cone (pyramid)
      const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.6, h * 0.5, 4);
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = h / 2 + (h * 0.5) / 2;
      roof.rotation.y = Math.PI / 4;
      house.add(roof);
      group.add(house);
    }
    // church tower
    const ctX = (townXMin + townXMax) / 2;
    const ctZ = (townZMin + townZMax) / 2;
    const ctBaseY = terrainHeight(ctX, ctZ);
    const towerGeo = new THREE.BoxGeometry(14, 30, 14);
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(ctX, ctBaseY + 15, ctZ);
    const towerRoofGeo = new THREE.ConeGeometry(12, 8, 4);
    const towerRoofMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const towerRoof = new THREE.Mesh(towerRoofGeo, towerRoofMat);
    towerRoof.position.y = 30 / 2 + 8 / 2;
    towerRoof.rotation.y = Math.PI / 4;
    tower.add(towerRoof);
    group.add(tower);
    world.add(group);
    objects.town = group;
  }
  // -----------------------------------------------------------------
  // build trees (instanced; trunk and foliage get different heights)
  function buildTrees() {
    const count = 350;
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 4, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const foliageGeo = new THREE.ConeGeometry(2, 6, 6);
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, count);
    const dummyTrunk = new THREE.Object3D();
    const dummyFoliage = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const x = -WORLD_SIZE / 2 + Math.random() * WORLD_SIZE;
      const z = -WORLD_SIZE / 2 + Math.random() * WORLD_SIZE;
      // avoid runway and town
      if (Math.abs(x - RUNWAY.x) < 200 && Math.abs(z - RUNWAY.z) < RUNWAY.length) continue;
      if (x > -260 && x < 260 && z > 480 && z < 820) continue;
      const y = terrainHeight(x, z);
      if (y < 8 || y > 60) continue;
      dummyTrunk.position.set(x, y + 2, z);
      dummyTrunk.updateMatrix();
      trunkMesh.setMatrixAt(placed, dummyTrunk.matrix);
      dummyFoliage.position.set(x, y + 6, z);
      dummyFoliage.updateMatrix();
      foliageMesh.setMatrixAt(placed, dummyFoliage.matrix);
      placed++;
    }
    trunkMesh.count = placed;
    foliageMesh.count = placed;
    world.add(trunkMesh);
    world.add(foliageMesh);
    objects.trees = { trunkMesh, foliageMesh };
  }
  // -----------------------------------------------------------------
  // build sky, lights, sun, clouds
  function buildSky() {
    scene.background = new THREE.Color(0x8fc3e8);
    scene.fog = new THREE.Fog(0x9fc8e8, 700, 3600);
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6f7f5a, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff2d8, 1.6);
    dir.position.set(600, 900, 300);
    scene.add(dir);
    // sun disc + glow (fog off so they stay bright)
    const sunGeo = new THREE.CircleGeometry(120, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff5a5, fog: false });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(600, 900, 300);
    sun.lookAt(0, 0, 0);
    world.add(sun);
    const glowGeo = new THREE.CircleGeometry(250, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff5a5, transparent: true, opacity: 0.25, fog: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(sun.position);
    glow.lookAt(0, 0, 0);
    world.add(glow);
    // sky dome: gradient shader sphere
    const domeGeo = new THREE.SphereGeometry(3800, 32, 15);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x5f9fd8) },
        bottomColor: { value: new THREE.Color(0xdfeefb) },
        offset: { value: 400 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max(h, 0.0), exponent ), 0.0 ) ), 1.0 );
        }
      `,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    world.add(dome);
    // clouds: flattened sphere clusters drifting slowly
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 22; i++) {
      const cloud = new THREE.Group();
      const sphereCount = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < sphereCount; s++) {
        const radius = 30 + Math.random() * 20;
        const geo = new THREE.SphereGeometry(radius, 8, 6);
        const mesh = new THREE.Mesh(geo, cloudMat);
        mesh.position.set(
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 80
        );
        mesh.scale.set(1, 0.45, 1);
        cloud.add(mesh);
      }
      const x = -WORLD_SIZE / 2 + Math.random() * WORLD_SIZE;
      const y = 180 + Math.random() * 140;
      const z = -WORLD_SIZE / 2 + Math.random() * WORLD_SIZE;
      cloud.position.set(x, y, z);
      cloudGroup.add(cloud);
    }
    world.add(cloudGroup);
    objects.clouds = cloudGroup.children;
  }
  // -----------------------------------------------------------------
  // build distant mountains
  function buildMountains() {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x6a7d8c });
    for (let i = 0; i < 10; i++) {
      const radius = 220 + Math.random() * 200;
      const height = 260 + Math.random() * 260;
      const geo = new THREE.ConeGeometry(radius, height, 4);
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / 10) * Math.PI * 2;
      const dist = WORLD_SIZE / 2 - 200;
      mesh.position.set(
        Math.cos(angle) * dist,
        height / 2 - 50,
        Math.sin(angle) * dist
      );
      mesh.rotation.y = angle + Math.PI;
      group.add(mesh);
    }
    world.add(group);
    objects.mountains = group;
  }
  // -----------------------------------------------------------------
  // assemble
  buildTerrain();
  buildWater();
  buildRunway();
  buildTown();
  buildTrees();
  buildSky();
  buildMountains();
  // -----------------------------------------------------------------
  // update function
  function update(dt, elapsed) {
    // windsock sway
    if (objects.windsock) {
      objects.windsock.rotation.z = Math.PI / 8 + Math.sin(elapsed * 0.5) * 0.2;
    }
    // clouds drift
    const speed = 10; // units per second
    for (let i = 0; i < objects.clouds.length; i++) {
      const c = objects.clouds[i];
      c.position.x += speed * dt;
      if (c.position.x > WORLD_SIZE / 2) c.position.x = -WORLD_SIZE / 2;
    }
  }
  return { update, terrainHeight, RUNWAY };
}
