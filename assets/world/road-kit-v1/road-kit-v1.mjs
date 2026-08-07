const DEFAULT_BASE_URL = "./";

function configureTexture(THREE, texture, repeatX = 1, repeatY = 1) {
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(Math.max(0.25, repeatX), Math.max(0.25, repeatY));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function flatMesh(THREE, geometry, material, y = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function addStraightMarkings(THREE, group, length, width, mode, material) {
  if (mode === "none") return;
  const dashLength = 2.2;
  const gap = 2.2;
  const count = Math.floor(length / (dashLength + gap));
  for (let i = 0; i < count; i += 1) {
    const dash = flatMesh(
      THREE,
      new THREE.PlaneGeometry(0.09, dashLength),
      material,
      0.022
    );
    dash.position.z = -length / 2 + gap / 2 + dashLength / 2 + i * (dashLength + gap);
    group.add(dash);
  }
  if (mode === "edge-and-center") {
    for (const x of [-width / 2 + 0.28, width / 2 - 0.28]) {
      const edge = flatMesh(THREE, new THREE.PlaneGeometry(0.08, length), material, 0.021);
      edge.position.x = x;
      group.add(edge);
    }
  }
}

export async function createRoadKit(THREE, options = {}) {
  if (!THREE) throw new Error("createRoadKit requires the active THREE namespace");
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const loader = options.textureLoader ?? new THREE.TextureLoader();
  const load = (path) => loader.loadAsync(`${baseUrl}${path}`);

  const [asphaltBase, asphaltPatched, sidewalk, curb] = await Promise.all([
    load("textures/asphalt-base-512-v1.png"),
    load("textures/asphalt-patched-512-v1.png"),
    load("textures/sidewalk-pavers-512-v1.png"),
    load("textures/curb-concrete-512-v1.png")
  ]);

  const sourceTextures = { asphaltBase, asphaltPatched, sidewalk, curb };
  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4d0bc,
    roughness: 0.92,
    metalness: 0
  });

  function materialFrom(source, width, length, color = 0xffffff) {
    const map = source.clone();
    map.needsUpdate = true;
    configureTexture(THREE, map, width / 4, length / 4);
    return new THREE.MeshStandardMaterial({ map, color, roughness: 0.95, metalness: 0 });
  }

  function createSurroundingGround({
    length = 190,
    roadWidth = 14,
    sidewalkWidth = 2,
    totalWidth = 72,
    tint = 0x817968
  } = {}) {
    const group = new THREE.Group();
    group.name = "ground-surrounding-lots";
    const occupiedWidth = roadWidth + (sidewalkWidth + 0.18) * 2;
    const lotWidth = Math.max(2, (totalWidth - occupiedWidth) / 2);
    const innerEdge = occupiedWidth / 2;
    const groundMaterial = materialFrom(curb, lotWidth, length, tint);

    for (const side of [-1, 1]) {
      const lot = flatMesh(
        THREE,
        new THREE.PlaneGeometry(lotWidth, length),
        groundMaterial,
        -0.025
      );
      lot.name = side < 0 ? "ground-lot-left" : "ground-lot-right";
      lot.position.x = side * (innerEdge + lotWidth / 2);
      group.add(lot);
    }

    // Broad, low-contrast repairs break up the repeated texture without reading
    // as gameplay-relevant markings. They remain fixed for every participant.
    const repairMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d5b50,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const repairs = [
      [-1, 0.24, 77, 6.8, 16], [1, 0.72, 62, 8.5, 11],
      [-1, 0.68, 28, 9.2, 14], [1, 0.28, 13, 6.2, 18],
      [-1, 0.42, -25, 7.5, 12], [1, 0.62, -47, 10.5, 15]
    ];
    repairs.forEach(([side, across, z, width, depth], index) => {
      const repair = flatMesh(THREE, new THREE.PlaneGeometry(width, depth), repairMaterial, -0.012);
      repair.name = `ground-repair-${index + 1}`;
      repair.position.x = side * (innerEdge + lotWidth * across);
      repair.position.z = z;
      repair.rotation.z = (index % 2 ? -1 : 1) * 0.035;
      group.add(repair);
    });
    group.userData.groundMeshCount = 2;
    group.userData.repairMeshCount = repairs.length;
    return group;
  }

  function addSidewalks(group, width, length) {
    const sidewalkWidth = 2;
    const sidewalkMaterial = materialFrom(sidewalk, sidewalkWidth, length);
    const curbMaterial = materialFrom(curb, 0.18, length);
    for (const side of [-1, 1]) {
      const walk = flatMesh(
        THREE,
        new THREE.PlaneGeometry(sidewalkWidth, length),
        sidewalkMaterial,
        0.04
      );
      walk.position.x = side * (width / 2 + sidewalkWidth / 2 + 0.18);
      group.add(walk);

      const curbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.15, length),
        curbMaterial
      );
      curbMesh.position.set(side * (width / 2 + 0.09), 0.075, 0);
      curbMesh.castShadow = false;
      curbMesh.receiveShadow = true;
      group.add(curbMesh);
    }
  }

  function createStraight({
    length = 24,
    width = 8,
    surface = "base",
    sidewalks = true,
    markings = "center"
  } = {}) {
    const group = new THREE.Group();
    group.name = `road-straight-${width}x${length}`;
    const texture = surface === "patched" ? asphaltPatched : asphaltBase;
    group.add(flatMesh(THREE, new THREE.PlaneGeometry(width, length), materialFrom(texture, width, length)));
    addStraightMarkings(THREE, group, length, width, markings, lineMaterial);
    if (sidewalks) addSidewalks(group, width, length);
    group.userData.roadPorts = [
      { id: "z-", position: [0, 0, -length / 2], heading: Math.PI },
      { id: "z+", position: [0, 0, length / 2], heading: 0 }
    ];
    return group;
  }

  function createAlley({ length = 18, width = 3.8, surface = "base" } = {}) {
    return createStraight({ length, width, surface, sidewalks: false, markings: "none" });
  }

  function createCurve90({ innerRadius = 8, width = 8, surface = "base" } = {}) {
    const group = new THREE.Group();
    group.name = "road-curve-90";
    const outerRadius = innerRadius + width;
    const texture = surface === "patched" ? asphaltPatched : asphaltBase;
    const road = flatMesh(
      THREE,
      new THREE.RingGeometry(innerRadius, outerRadius, 40, 1, 0, Math.PI / 2),
      materialFrom(texture, outerRadius, outerRadius)
    );
    group.add(road);
    group.userData.roadPorts = [
      { id: "z-", position: [innerRadius + width / 2, 0, 0], heading: -Math.PI / 2 },
      { id: "x+", position: [0, 0, innerRadius + width / 2], heading: 0 }
    ];
    return group;
  }

  function createIntersection({ type = "cross", size = 20, surface = "base" } = {}) {
    const group = new THREE.Group();
    group.name = `road-intersection-${type}`;
    const texture = surface === "patched" ? asphaltPatched : asphaltBase;
    group.add(flatMesh(THREE, new THREE.PlaneGeometry(size, size), materialFrom(texture, size, size)));
    const ports = [
      { id: "z-", position: [0, 0, -size / 2], heading: Math.PI },
      { id: "z+", position: [0, 0, size / 2], heading: 0 },
      { id: "x+", position: [size / 2, 0, 0], heading: Math.PI / 2 }
    ];
    if (type === "cross") ports.push({ id: "x-", position: [-size / 2, 0, 0], heading: -Math.PI / 2 });
    group.userData.roadPorts = ports;
    return group;
  }

  function dispose() {
    Object.values(sourceTextures).forEach((texture) => texture.dispose());
    lineMaterial.dispose();
  }

  return {
    textures: sourceTextures,
    createStraight,
    createSurroundingGround,
    createAlley,
    createCurve90,
    createIntersection,
    dispose
  };
}
