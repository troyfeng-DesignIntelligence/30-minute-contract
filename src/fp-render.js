import * as THREE from "../node_modules/three/build/three.module.js";
import { createFirstPersonAssetLayers, normalizeArtLevel } from "./fp-asset-layers.js";

const TONES = Object.freeze({
  normal: { speed: 15, bob: 0.004, lean: 0, blur: .7, blurOpacity: .13 },
  rush: { speed: 22, bob: 0.009, lean: 0.006, blur: 1.55, blurOpacity: .25 },
  sprint: { speed: 29, bob: 0.014, lean: 0.011, blur: 2.8, blurOpacity: .38 }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const RENDER_PROFILES = Object.freeze({
  legacy: Object.freeze({
    version: "legacy-render-v1",
    background: 0x90c8c0,
    fog: 0x91c7be,
    fogDensity: 0.017,
    exposure: 1.08,
    hemiSky: 0xfff4cd,
    hemiGround: 0x274b50,
    hemiIntensity: 2.5,
    sunColor: 0xffecc0,
    sunIntensity: 3.4
  }),
  county: Object.freeze({
    version: "county-town-decayed-surreal-v2",
    background: 0x95998f,
    fog: 0x92988e,
    fogDensity: 0.0155,
    exposure: 0.91,
    hemiSky: 0xd8d3c2,
    hemiGround: 0x444b42,
    hemiIntensity: 1.95,
    sunColor: 0xd9bd8e,
    sunIntensity: 1.48
  })
});

function renderProfileFor(value) {
  return value === "legacy" ? RENDER_PROFILES.legacy : RENDER_PROFILES.county;
}

function seeded(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapRoadZ(value) {
  const near = 11;
  const far = -145;
  const span = near - far;
  let wrapped = value;
  while (wrapped > near) wrapped -= span;
  while (wrapped < far) wrapped += span;
  return wrapped;
}

function makeLabelTexture(text, foreground = "#fff7de", background = "#173a3d") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 640 * ratio;
  canvas.height = 150 * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, 640, 150);
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(18, 18, 604, 108, 22);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.24)";
  context.lineWidth = 3;
  context.stroke();
  context.font = "800 42px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  context.fillStyle = foreground;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text || "目的地", 320, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  });
}

function fallbackWorld(renderStyleVersion = RENDER_PROFILES.county.version) {
  const noop = () => {};
  const resolved = () => Promise.resolve();
  return {
    setCourierPosition: noop,
    setActiveMerchant: noop,
    setCustomer: noop,
    showRoute: noop,
    clearRoute: noop,
    setCruising: noop,
    setSpeedTone: noop,
    setArrivalTarget: noop,
    animatePath: resolved,
    waitAtMerchant: resolved,
    playIncident: resolved,
    playDelivery: resolved,
    cruise: resolved,
    getVisualRuntime: () => ({ requestedArtLevel: "procedural", renderStyleVersion, layers: {} }),
    destroy: noop
  };
}

export function createFirstPersonWorld(canvas, options = {}) {
  const artLevel = normalizeArtLevel(options.artLevel);
  const renderProfile = renderProfileFor(options.renderStyle);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const performanceStartedAtMs = performance.now();
  const renderPerformance = {
    firstFrameAtMs: null,
    visibleFrameCount: 0,
    intervalSampleCount: 0,
    intervalTotalMs: 0,
    minimumInstantaneousFps: Number.POSITIVE_INFINITY,
    minimumWindowFps: Number.POSITIVE_INFINITY,
    longFramesOver50Ms: 0,
    lastVisibleFrameAtMs: null,
    windowStartedAtMs: performanceStartedAtMs,
    windowFrameCount: 0,
    contextLossCount: 0,
    contextRestoreCount: 0,
    contextLossEvents: [],
    contextRestoreEvents: []
  };

  function resetVisibleFrameBoundary() {
    renderPerformance.lastVisibleFrameAtMs = null;
    renderPerformance.windowStartedAtMs = performance.now();
    renderPerformance.windowFrameCount = 0;
  }

  function sampleRenderPerformance(frameAtMs) {
    if (document.visibilityState !== "visible") return;
    if (renderPerformance.firstFrameAtMs === null) {
      renderPerformance.firstFrameAtMs = frameAtMs - performanceStartedAtMs;
    }
    renderPerformance.visibleFrameCount += 1;
    renderPerformance.windowFrameCount += 1;
    if (renderPerformance.lastVisibleFrameAtMs !== null) {
      const intervalMs = frameAtMs - renderPerformance.lastVisibleFrameAtMs;
      if (intervalMs > 0) {
        renderPerformance.intervalSampleCount += 1;
        renderPerformance.intervalTotalMs += intervalMs;
        renderPerformance.minimumInstantaneousFps = Math.min(
          renderPerformance.minimumInstantaneousFps,
          1000 / intervalMs
        );
        if (intervalMs > 50) renderPerformance.longFramesOver50Ms += 1;
      }
    }
    renderPerformance.lastVisibleFrameAtMs = frameAtMs;
    const windowDurationMs = frameAtMs - renderPerformance.windowStartedAtMs;
    if (windowDurationMs >= 1000) {
      const windowFps = Math.max(0, renderPerformance.windowFrameCount - 1) * 1000 / windowDurationMs;
      renderPerformance.minimumWindowFps = Math.min(renderPerformance.minimumWindowFps, windowFps);
      renderPerformance.windowStartedAtMs = frameAtMs;
      renderPerformance.windowFrameCount = 0;
    }
  }

  function performanceSnapshot() {
    const now = performance.now();
    const activeWindowDurationMs = now - renderPerformance.windowStartedAtMs;
    const activeWindowFps = activeWindowDurationMs >= 250 && renderPerformance.windowFrameCount > 1
      ? (renderPerformance.windowFrameCount - 1) * 1000 / activeWindowDurationMs
      : null;
    const completedWindowFps = Number.isFinite(renderPerformance.minimumWindowFps)
      ? renderPerformance.minimumWindowFps
      : null;
    const windowFpsCandidates = [completedWindowFps, activeWindowFps].filter(Number.isFinite);
    const minimumFps = windowFpsCandidates.length
      ? Math.min(...windowFpsCandidates)
      : (Number.isFinite(renderPerformance.minimumInstantaneousFps)
        ? renderPerformance.minimumInstantaneousFps
        : 0);
    return {
      measurement: "visible_request_animation_frame_intervals",
      measurementDurationMs: Math.round((now - performanceStartedAtMs) * 100) / 100,
      firstFrameAtMs: renderPerformance.firstFrameAtMs === null
        ? null
        : Math.round(renderPerformance.firstFrameAtMs * 100) / 100,
      visibleFrameCount: renderPerformance.visibleFrameCount,
      averageFps: renderPerformance.intervalTotalMs > 0
        ? Math.round((renderPerformance.intervalSampleCount * 1000 / renderPerformance.intervalTotalMs) * 100) / 100
        : 0,
      minimumFps: Math.round(minimumFps * 100) / 100,
      minimumOneSecondFps: Number.isFinite(completedWindowFps)
        ? Math.round(completedWindowFps * 100) / 100
        : null,
      minimumInstantaneousFps: Number.isFinite(renderPerformance.minimumInstantaneousFps)
        ? Math.round(renderPerformance.minimumInstantaneousFps * 100) / 100
        : 0,
      longFramesOver50Ms: renderPerformance.longFramesOver50Ms,
      contextLossCount: renderPerformance.contextLossCount,
      contextRestoreCount: renderPerformance.contextRestoreCount,
      contextLossEvents: renderPerformance.contextLossEvents.map((event) => ({ ...event })),
      contextRestoreEvents: renderPerformance.contextRestoreEvents.map((event) => ({ ...event })),
      reducedMotion
    };
  }

  document.addEventListener("visibilitychange", resetVisibleFrameBoundary);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(renderProfile.background);
  scene.fog = new THREE.FogExp2(renderProfile.fog, renderProfile.fogDensity);
  canvas.parentElement?.setAttribute("data-render-style", renderProfile.version);

  const camera = new THREE.PerspectiveCamera(64, 1, 0.08, 180);
  camera.position.set(0, 1.48, 5.5);
  camera.lookAt(0, 1.24, -20);
  scene.add(camera);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (error) {
    options.onContextError?.(error);
    const fallback = fallbackWorld(renderProfile.version);
    options.onVisualReady?.(fallback.getVisualRuntime());
    return fallback;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = renderProfile.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(renderProfile.hemiSky, renderProfile.hemiGround, renderProfile.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(renderProfile.sunColor, renderProfile.sunIntensity);
  sun.position.set(-16, 25, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -12;
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.00035;
  scene.add(sun);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 190),
    new THREE.MeshStandardMaterial({ color: 0x27393a, roughness: 0.96 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -66);
  road.receiveShadow = true;
  scene.add(road);

  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xd6d2b8, roughness: 1 });
  const proceduralWorldObjects = [road];
  [-8.2, 8.2].forEach((x) => {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 190), sidewalkMaterial);
    walk.position.set(x, 0.02, -66);
    walk.receiveShadow = true;
    scene.add(walk);
    proceduralWorldObjects.push(walk);
  });

  const fallbackLotMaterial = new THREE.MeshStandardMaterial({ color: 0x6e6859, roughness: 1, metalness: 0 });
  for (const side of [-1, 1]) {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(26.8, 190), fallbackLotMaterial);
    lot.name = side < 0 ? "procedural-ground-lot-left" : "procedural-ground-lot-right";
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(side * 22.58, -0.025, -66);
    lot.receiveShadow = true;
    scene.add(lot);
    proceduralWorldObjects.push(lot);
  }

  const movingObjects = [];
  const proceduralEnvironmentObjects = [];
  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xc7c2a5, transparent: true, opacity: .62 });
  for (let index = 0; index < 28; index += 1) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 3.4), laneMaterial);
    mark.position.set(0, 0.025, 7 - index * 6);
    mark.userData.baseZ = mark.position.z;
    movingObjects.push(mark);
    scene.add(mark);
  }

  const random = seeded(7719);
  const facadeColors = [0xf0c46f, 0xd77d68, 0x83b7ad, 0xe3dec2, 0x9b8fbd, 0x74a1ad];
  for (let index = 0; index < 15; index += 1) {
    const baseZ = 2 - index * 10.4;
    [-1, 1].forEach((side, sideIndex) => {
      const group = new THREE.Group();
      const width = 3.8 + random() * 2.4;
      const height = 3.1 + random() * 6.2;
      const depth = 5.2 + random() * 2.6;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: facadeColors[(index + sideIndex * 2) % facadeColors.length], roughness: 0.86 })
      );
      building.position.y = height / 2;
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + .15, .22, depth + .15),
        new THREE.MeshStandardMaterial({ color: 0x24484a, roughness: .92 })
      );
      roof.position.y = height + .11;
      roof.castShadow = true;
      group.add(roof);
      for (let floor = 1.25; floor < height - .4; floor += 1.55) {
        for (let wx = -width / 2 + .75; wx < width / 2; wx += 1.25) {
          const windowMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(.52, .7),
            new THREE.MeshBasicMaterial({ color: (index + floor) % 2 ? 0xb9d8ce : 0xffdfa0 })
          );
          windowMesh.position.set(wx, floor, side < 0 ? depth / 2 + .006 : -depth / 2 - .006);
          windowMesh.rotation.y = side < 0 ? 0 : Math.PI;
          group.add(windowMesh);
        }
      }
      group.position.set(side * (10.6 + width * .25), 0, baseZ);
      group.userData.baseZ = baseZ;
      movingObjects.push(group);
      proceduralEnvironmentObjects.push(group);
      scene.add(group);

      if (index % 2 === 0) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(.09, .13, .75, 7),
          new THREE.MeshStandardMaterial({ color: 0x74543b, roughness: 1 })
        );
        trunk.position.y = .46;
        tree.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.IcosahedronGeometry(.6, 1),
          new THREE.MeshStandardMaterial({ color: index % 4 ? 0x4b9667 : 0x70ad71, roughness: .9 })
        );
        crown.position.y = 1.25;
        crown.castShadow = true;
        tree.add(crown);
        tree.position.set(side * 7.8, 0, baseZ + 3.5);
        tree.userData.baseZ = baseZ + 3.5;
        movingObjects.push(tree);
        proceduralEnvironmentObjects.push(tree);
        scene.add(tree);
      }
    });
  }

  const cars = [];
  const proceduralTrafficObjects = [];
  for (let index = 0; index < 7; index += 1) {
    const car = new THREE.Group();
    const color = [0xed735f, 0xe8d8bd, 0x6c9fb1, 0xf0c75e][index % 4];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, .55, 2.15),
      new THREE.MeshStandardMaterial({ color, roughness: .7 })
    );
    body.position.y = .42;
    body.castShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(.92, .42, 1.05),
      new THREE.MeshStandardMaterial({ color: 0xb8d0ca, roughness: .4, metalness: .08 })
    );
    cabin.position.set(0, .78, -.05);
    car.add(cabin);
    car.position.set(index % 2 ? -2.6 : 2.5, 0, -14 - index * 18);
    car.userData.baseZ = car.position.z;
    car.userData.speedRatio = index % 2 ? .42 : 1.25;
    car.userData.visualDistance = 0;
    cars.push(car);
    proceduralTrafficObjects.push(car);
    scene.add(car);
  }

  const cockpit = new THREE.Group();
  camera.add(cockpit);
  const cockpitDark = new THREE.MeshStandardMaterial({ color: 0x142b2e, roughness: .64, metalness: .24 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2021, roughness: .98 });
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.45, 12), cockpitDark);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, -.54, -1.05);
  cockpit.add(handlebar);
  [-.78, .78].forEach((x) => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .34, 12), gripMaterial);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(x, -.54, -1.05);
    cockpit.add(grip);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .5, 8), cockpitDark);
    stem.rotation.z = x < 0 ? -.44 : .44;
    stem.position.set(x * .92, -.28, -1.17);
    cockpit.add(stem);
    const mirror = new THREE.Mesh(
      new THREE.CircleGeometry(.095, 24),
      new THREE.MeshStandardMaterial({ color: 0x8db7b5, roughness: .22, metalness: .35 })
    );
    mirror.position.set(x * 1.04, -.08, -1.18);
    cockpit.add(mirror);
    const mirrorRim = new THREE.Mesh(
      new THREE.TorusGeometry(.1, .011, 8, 24),
      gripMaterial
    );
    mirrorRim.position.copy(mirror.position);
    mirrorRim.position.z += .004;
    cockpit.add(mirrorRim);
  });
  const phoneBack = new THREE.Mesh(
    new THREE.BoxGeometry(.32, .46, .06),
    new THREE.MeshStandardMaterial({ color: 0x10191b, roughness: .48, metalness: .16 })
  );
  phoneBack.position.set(0, -.56, -1.16);
  phoneBack.rotation.x = -.22;
  cockpit.add(phoneBack);
  const phoneScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(.27, .38),
    new THREE.MeshBasicMaterial({ color: 0x315b5d })
  );
  phoneScreen.position.set(0, -.56, -1.128);
  phoneScreen.rotation.x = -.22;
  cockpit.add(phoneScreen);
  const cowl = new THREE.Mesh(
    new THREE.BoxGeometry(.9, .18, .34),
    new THREE.MeshStandardMaterial({ color: 0xf0a14d, roughness: .72 })
  );
  cowl.position.set(0, -.9, -1.02);
  cowl.rotation.x = .18;
  cockpit.add(cowl);
  const proceduralCockpitObjects = [...cockpit.children];

  const stopFacade = new THREE.Group();
  stopFacade.visible = false;
  const stopBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 5.2, 2.5),
    new THREE.MeshStandardMaterial({ color: 0xf0bd69, roughness: .86 })
  );
  stopBuilding.position.y = 2.6;
  stopBuilding.castShadow = true;
  stopFacade.add(stopBuilding);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(6.3, .34, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xf6e6bb, roughness: .9 })
  );
  awning.position.set(0, 2.05, 1.72);
  stopFacade.add(awning);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x295153, roughness: .52 })
  );
  door.position.set(0, 1.1, 1.256);
  stopFacade.add(door);
  const signMaterial = new THREE.SpriteMaterial({ map: makeLabelTexture("目的地"), transparent: true, depthTest: false });
  const stopSign = new THREE.Sprite(signMaterial);
  stopSign.position.set(0, 4.25, 1.5);
  stopSign.scale.set(5.5, 1.29, 1);
  stopSign.renderOrder = 20;
  stopFacade.add(stopSign);
  stopFacade.position.set(0, 0, -11.4);
  scene.add(stopFacade);

  // Kept only as a resilient fallback. The normal customer destination is the
  // reviewed fixed gate GLB loaded by fp-asset-layers.
  const destinationFallback = new THREE.Group();
  destinationFallback.visible = false;
  const destinationWall = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 4.3, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xaaa18e, roughness: .93 })
  );
  destinationWall.position.y = 2.15;
  destinationFallback.add(destinationWall);
  const destinationDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x343a39, roughness: .64, metalness: .3 })
  );
  destinationDoor.position.set(0, 1.55, .606);
  destinationFallback.add(destinationDoor);
  const destinationFallbackSign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeLabelTexture("送到这里"), transparent: true, depthTest: false
  }));
  destinationFallbackSign.position.set(0, 3.72, .75);
  destinationFallbackSign.scale.set(2.7, .64, 1);
  destinationFallbackSign.renderOrder = 20;
  destinationFallback.add(destinationFallbackSign);
  destinationFallback.position.set(0, 0, -11.4);
  scene.add(destinationFallback);

  const assetLayers = createFirstPersonAssetLayers({
    scene,
    camera,
    cockpit,
    seed: Number(options.seed) || 1,
    merchantIds: Array.isArray(options.merchantIds) ? options.merchantIds : [],
    artLevel,
    movingObjects,
    cars,
    makeLabelTexture,
    procedural: {
      world: proceduralWorldObjects,
      environment: proceduralEnvironmentObjects,
      traffic: proceduralTrafficObjects,
      cockpit: proceduralCockpitObjects,
      merchant: stopFacade,
      destination: destinationFallback
    },
    onTelemetry: options.onAssetTelemetry,
    onVisualReady: (runtime) => options.onVisualReady?.({ ...runtime, renderStyleVersion: renderProfile.version })
  });

  const customer = new THREE.Group();
  customer.visible = false;
  const customerBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(.25, .8, 5, 9),
    new THREE.MeshStandardMaterial({ color: 0x6de0c5, roughness: .8 })
  );
  customerBody.position.y = .85;
  customer.add(customerBody);
  const customerHead = new THREE.Mesh(
    new THREE.SphereGeometry(.24, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0c89d, roughness: .8 })
  );
  customerHead.position.y = 1.75;
  customer.add(customerHead);
  customer.position.set(1.15, 0, -8.1);
  scene.add(customer);

  let travelDistance = 0;
  let moving = false;
  let currentTone = "normal";
  let currentTarget = { type: "merchant", label: "目的地" };
  let cameraShake = 0;
  let deliveryPulseUntil = 0;
  let contextLossTimer = 0;
  let readyNotified = false;

  const peripheralBlur = document.createElement("div");
  peripheralBlur.className = "peripheral-speed-blur";
  peripheralBlur.setAttribute("aria-hidden", "true");
  peripheralBlur.append(document.createElement("i"), document.createElement("i"));
  canvas.insertAdjacentElement("afterend", peripheralBlur);

  function updatePeripheralBlur() {
    const tone = TONES[currentTone];
    const mobileScale = window.innerWidth < 640 ? .68 : 1;
    const active = moving && !reducedMotion;
    peripheralBlur.style.setProperty("--speed-blur", `${tone.blur * mobileScale}px`);
    peripheralBlur.style.setProperty("--speed-blur-opacity", `${tone.blurOpacity * mobileScale}`);
    peripheralBlur.dataset.tone = currentTone;
    peripheralBlur.classList.toggle("is-active", active);
  }

  function setStopLabel(label) {
    const old = stopSign.material.map;
    stopSign.material.map = makeLabelTexture(label);
    stopSign.material.needsUpdate = true;
    old?.dispose();
  }

  function setArrivalTarget(type, label) {
    currentTarget = { type, label };
    stopFacade.visible = false;
    assetLayers.hideMerchant();
    assetLayers.hideDestination();
    destinationFallback.visible = false;
    customer.visible = false;
  }

  function revealArrival() {
    if (currentTarget.type === "cruise") {
      stopFacade.visible = false;
      assetLayers.hideMerchant();
      assetLayers.hideDestination();
      destinationFallback.visible = false;
      customer.visible = false;
      return;
    }
    if (currentTarget.type === "customer") {
      stopFacade.visible = false;
      assetLayers.hideMerchant();
      const destinationAssetVisible = assetLayers.revealDestination("送到这里");
      destinationFallback.visible = !destinationAssetVisible;
      customer.visible = true;
      return;
    }
    assetLayers.hideDestination();
    destinationFallback.visible = false;
    setStopLabel(currentTarget.label || "商家");
    const merchantAssetVisible = assetLayers.revealMerchant();
    stopBuilding.material.color.set(0xf0bd69);
    stopFacade.visible = !merchantAssetVisible;
    customer.visible = false;
  }

  function setSpeedTone(speedId) {
    currentTone = TONES[speedId] ? speedId : "normal";
    updatePeripheralBlur();
  }

  function setCourierPosition() {}
  function setActiveMerchant(merchantId, merchantLabel = "") {
    if (!merchantId) {
      stopFacade.visible = false;
      assetLayers.hideMerchant();
      assetLayers.hideDestination();
      destinationFallback.visible = false;
      return;
    }
    assetLayers.setActiveMerchant(merchantId, merchantLabel);
  }
  function setCustomer(destination) {
    if (!destination) customer.visible = false;
  }
  function showRoute() {}
  function clearRoute() {
    stopFacade.visible = false;
    assetLayers.hideMerchant();
    assetLayers.hideDestination();
    destinationFallback.visible = false;
    customer.visible = false;
  }

  function setCruising(active) {
    if (active) {
      setArrivalTarget("cruise", "巡行");
      setSpeedTone("normal");
    }
    moving = Boolean(active);
    updatePeripheralBlur();
  }

  function animatePath(from, to, durationMs, speedId = "normal", onProgress) {
    setSpeedTone(speedId);
    stopFacade.visible = false;
    assetLayers.hideDestination();
    destinationFallback.visible = false;
    customer.visible = false;
    moving = true;
    updatePeripheralBlur();
    const started = performance.now();
    return new Promise((resolve) => {
      function step(now) {
        const raw = clamp((now - started) / Math.max(1, durationMs), 0, 1);
        onProgress?.(raw);
        if (raw < 1) requestAnimationFrame(step);
        else {
          moving = false;
          updatePeripheralBlur();
          revealArrival();
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function waitAtMerchant(durationMs, onProgress) {
    revealArrival();
    const started = performance.now();
    return new Promise((resolve) => {
      function step(now) {
        const raw = clamp((now - started) / Math.max(1, durationMs), 0, 1);
        onProgress?.(raw);
        if (raw < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function playIncident() {
    cameraShake = reducedMotion ? .025 : .09;
    canvas.parentElement?.classList.add("incident-flash");
    window.setTimeout(() => canvas.parentElement?.classList.remove("incident-flash"), 650);
    return new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 260 : 720));
  }

  function playDelivery() {
    deliveryPulseUntil = performance.now() + (reducedMotion ? 260 : 650);
    customer.visible = true;
    return new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 220 : 440));
  }

  function cruise(durationMs = 1200) {
    setArrivalTarget("cruise", "巡行");
    return animatePath(null, null, durationMs, "normal");
  }

  const observer = new ResizeObserver(() => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  });
  observer.observe(canvas);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderPerformance.contextLossCount += 1;
    renderPerformance.contextLossEvents.push({
      atMs: Math.round((performance.now() - performanceStartedAtMs) * 100) / 100
    });
    contextLossTimer = window.setTimeout(() => options.onContextError?.(new Error("WebGL context lost")), 800);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    window.clearTimeout(contextLossTimer);
    renderPerformance.contextRestoreCount += 1;
    renderPerformance.contextRestoreEvents.push({
      atMs: Math.round((performance.now() - performanceStartedAtMs) * 100) / 100
    });
    options.onContextRestored?.();
  });

  const clock = new THREE.Clock();
  let animationFrame = 0;
  function renderLoop() {
    animationFrame = requestAnimationFrame(renderLoop);
    sampleRenderPerformance(performance.now());
    const delta = Math.min(.04, clock.getDelta());
    const elapsed = clock.elapsedTime;
    const tone = TONES[currentTone];
    if (moving) travelDistance += delta * tone.speed;

    movingObjects.forEach((object) => {
      object.position.z = wrapRoadZ(object.userData.baseZ + travelDistance);
    });
    cars.forEach((car) => {
      const carSpeed = moving ? tone.speed * car.userData.speedRatio : 1.3 * car.userData.speedRatio;
      car.userData.visualDistance += delta * carSpeed;
      car.position.z = wrapRoadZ(car.userData.baseZ + car.userData.visualDistance);
    });

    const motionScale = moving ? 1 : .16;
    const bob = reducedMotion ? 0 : Math.sin(elapsed * (currentTone === "sprint" ? 15 : 11)) * tone.bob * motionScale;
    const sway = reducedMotion ? 0 : Math.sin(elapsed * .72) * .009 * motionScale;
    cockpit.position.y = bob;
    cockpit.rotation.z += ((sway + tone.lean * motionScale) - cockpit.rotation.z) * .08;
    camera.position.x += (sway * .6 - camera.position.x) * .06;
    camera.position.y += ((1.48 + bob * .35) - camera.position.y) * .08;

    if (cameraShake > .001) {
      camera.rotation.z = (Math.random() - .5) * cameraShake;
      camera.rotation.x = (Math.random() - .5) * cameraShake * .4;
      cameraShake *= .86;
    } else {
      camera.rotation.z *= .82;
      camera.rotation.x *= .82;
    }

    if (stopFacade.visible) stopSign.position.y = 4.25 + Math.sin(elapsed * 2.8) * .035;
    if (destinationFallback.visible) destinationFallbackSign.position.y = 3.72 + Math.sin(elapsed * 2.8) * .035;
    if (customer.visible) {
      const burst = performance.now() < deliveryPulseUntil;
      const scale = burst ? 1.1 + Math.sin(elapsed * 15) * .08 : 1;
      customer.scale.setScalar(scale);
    }

    renderer.render(scene, camera);
    if (!readyNotified) {
      readyNotified = true;
      options.onReady?.();
    }
  }
  renderLoop();

  function destroy() {
    cancelAnimationFrame(animationFrame);
    window.clearTimeout(contextLossTimer);
    observer.disconnect();
    document.removeEventListener("visibilitychange", resetVisibleFrameBoundary);
    assetLayers.destroy();
    peripheralBlur.remove();
    disposeObject(scene);
    renderer.dispose();
  }

  return {
    setCourierPosition,
    setActiveMerchant,
    setCustomer,
    showRoute,
    clearRoute,
    setCruising,
    setSpeedTone,
    setArrivalTarget,
    animatePath,
    waitAtMerchant,
    playIncident,
    playDelivery,
    cruise,
    getVisualRuntime: () => ({
      ...assetLayers.getRuntime(),
      renderStyleVersion: renderProfile.version,
      groundCoverage: {
        version: "surrounding-ground-v1",
        assetMeshes: assetLayers.getRuntime().worldGroundMeshCount || 0,
        proceduralMeshesVisible: proceduralWorldObjects.filter((object) => object.name?.startsWith("procedural-ground-lot") && object.visible).length
      },
      peripheralBlur: {
        active: peripheralBlur.classList.contains("is-active"),
        tone: peripheralBlur.dataset.tone || "normal",
        pixels: Number.parseFloat(peripheralBlur.style.getPropertyValue("--speed-blur")) || 0
      },
      performance: performanceSnapshot()
    }),
    destroy
  };
}
