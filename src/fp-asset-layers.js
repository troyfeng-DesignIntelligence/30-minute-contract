import * as THREE from "../node_modules/three/build/three.module.js";
import { createAssetRegistry } from "./asset-registry.js";
import { createVisualAssetAssignment } from "./visual-asset-assignment.js";
import { createRoadKit } from "../assets/world/road-kit-v1/road-kit-v1.mjs";

const LEVELS = Object.freeze({ procedural: 0, world: 1, environment: 2, merchant: 3, all: 4 });
const WORLD_MANIFEST_URL = "./assets/world/world-manifest.v1.json";
const SIGNAGE_MANIFEST_URL = "./assets/signage/signage-manifest.v1.json";
const LAYER_COMPOSITION_VERSION = "fp-layer-composition-v6-destination-gate";

export function normalizeArtLevel(value) {
  return Object.hasOwn(LEVELS, value) ? value : "all";
}

function setVisible(objects, visible) {
  objects.filter(Boolean).forEach((object) => { object.visible = visible; });
}

function disposeDetached(root) {
  root?.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    materials.forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}

async function loadWorldManifest() {
  const response = await fetch(WORLD_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`World manifest failed: ${response.status}`);
  return response.json();
}

async function loadSignageManifest() {
  const response = await fetch(SIGNAGE_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Signage manifest failed: ${response.status}`);
  const signage = await response.json();
  if (!signage?.signageSetVersion || !signage?.image?.url || !signage?.merchantSigns) {
    throw new Error("Signage manifest is incomplete");
  }
  return signage;
}

function createHorizonCard(texture, x, z, rotationY, { opacity = 1, scale = 1 } = {}) {
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(72, 36), material);
  card.position.set(x, 13, z);
  card.rotation.y = rotationY;
  card.scale.setScalar(scale);
  card.renderOrder = -10;
  return card;
}

export function createFirstPersonAssetLayers({
  scene,
  camera,
  cockpit,
  seed,
  merchantIds,
  artLevel,
  movingObjects,
  cars,
  makeLabelTexture,
  procedural,
  onTelemetry = () => {},
  onVisualReady = () => {}
}) {
  const requestedLevel = normalizeArtLevel(artLevel);
  const requestedRank = LEVELS[requestedLevel];
  const telemetry = [];
  const layerStatus = {
    world: requestedRank >= LEVELS.world ? "loading" : "procedural",
    environment: requestedRank >= LEVELS.environment ? "loading" : "procedural",
    destination: requestedRank >= LEVELS.merchant ? "loading" : "procedural",
    merchant: requestedRank >= LEVELS.merchant ? "loading" : "procedural",
    cockpit: requestedRank >= LEVELS.all ? "loading" : "procedural"
  };
  const registry = createAssetRegistry({
    onTelemetry(event) {
      telemetry.push(event);
      onTelemetry(event);
    }
  });
  let manifest = null;
  let worldManifest = null;
  let assignment = null;
  let assignmentPromise = null;
  let roadKit = null;
  let signageManifest = null;
  let signageAtlasTexture = null;
  let signagePromise = null;
  let signageStatus = requestedRank >= LEVELS.merchant ? "loading" : "procedural";
  let activeMerchantId = null;
  let activeMerchantLabel = "";
  let activeMerchantRoot = null;
  let destinationAssetRoot = null;
  let destinationRequestedVisible = false;
  let cockpitAssetRoot = null;
  let environmentBuildingCount = 0;
  let worldGroundMeshCount = 0;
  let horizonEchoCount = 0;
  let merchantRequestedVisible = false;
  let destroyed = false;
  const merchantRoots = new Map();

  function record(layer, status, detail = {}) {
    layerStatus[layer] = status;
    const event = { event: "visual_layer", layer, status, atMs: performance.now(), ...detail };
    telemetry.push(event);
    onTelemetry(event);
  }

  function recordSignage(status, detail = {}) {
    signageStatus = status;
    const event = { event: "merchant_signage", status, atMs: performance.now(), ...detail };
    telemetry.push(event);
    onTelemetry(event);
  }

  async function runLayer(layer, task) {
    const started = performance.now();
    try {
      await task();
      record(layer, "asset", { loadMs: performance.now() - started });
    } catch (error) {
      record(layer, "fallback", { loadMs: performance.now() - started, error: error.message });
    }
  }

  async function ensureAssignment() {
    if (assignment) return assignment;
    if (!assignmentPromise) {
      assignmentPromise = (async () => {
        manifest = manifest || await registry.getManifest();
        assignment = createVisualAssetAssignment(manifest, {
          participantSeed: seed,
          merchantIds,
          backgroundSlots: Array.from({ length: 30 }, (_, index) => `building-${index}`),
          trafficSlots: Array.from({ length: 5 }, (_, index) => `traffic-${index}`)
        });
        return assignment;
      })();
    }
    return assignmentPromise;
  }

  async function ensureSignage() {
    if (signageAtlasTexture) return signageAtlasTexture;
    if (!signagePromise) {
      signagePromise = (async () => {
        signageManifest = await loadSignageManifest();
        const texture = await new THREE.TextureLoader().loadAsync(signageManifest.image.url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        signageAtlasTexture = texture;
        recordSignage("asset", { signageSetVersion: signageManifest.signageSetVersion });
        return texture;
      })().catch((error) => {
        signageManifest = null;
        signageAtlasTexture = null;
        recordSignage("fallback", { error: error.message });
        return null;
      });
    }
    return signagePromise;
  }

  async function loadWorldLayer() {
    worldManifest = await loadWorldManifest();
    const group = new THREE.Group();
    group.name = "asset-layer:world";
    try {
      const textureLoader = new THREE.TextureLoader();
      const [kit, skyTexture, ...horizonTextures] = await Promise.all([
        createRoadKit(THREE, { baseUrl: worldManifest.roadKit.baseUrl }),
        textureLoader.loadAsync(worldManifest.sky.url),
        ...worldManifest.horizons.map((horizon) => textureLoader.loadAsync(horizon.url))
      ]);
      roadKit = kit;
      const road = kit.createStraight({
        length: worldManifest.roadKit.roadLengthMeters,
        width: worldManifest.roadKit.roadWidthMeters,
        surface: worldManifest.roadKit.surface || "base",
        sidewalks: true,
        markings: worldManifest.roadKit.markings || "none"
      });
      road.position.z = -66;
      group.add(road);

      const surroundingGround = kit.createSurroundingGround({
        length: worldManifest.roadKit.roadLengthMeters,
        roadWidth: worldManifest.roadKit.roadWidthMeters,
        totalWidth: worldManifest.surroundingGround?.totalWidthMeters || 72,
        tint: worldManifest.surroundingGround?.tint || 0x817968
      });
      surroundingGround.position.z = -66;
      worldGroundMeshCount = surroundingGround.userData.groundMeshCount || 0;
      group.add(surroundingGround);

      skyTexture.colorSpace = THREE.SRGBColorSpace;
      skyTexture.wrapS = THREE.RepeatWrapping;
      const sky = new THREE.Mesh(
        new THREE.CylinderGeometry(
          worldManifest.sky.radiusMeters,
          worldManifest.sky.radiusMeters,
          worldManifest.sky.heightMeters,
          64,
          1,
          true
        ),
        new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false })
      );
      // Keep both open cylinder rims well outside the camera frustum. A short
      // cylinder exposes its upper rim as a pale curved band while riding.
      sky.position.set(0, 25, -30);
      sky.rotation.y = Math.PI;
      sky.renderOrder = -20;
      group.add(sky);

      group.add(
        createHorizonCard(horizonTextures[0], -42, -124, 0.08),
        createHorizonCard(horizonTextures[1], 42, -128, -0.08),
        createHorizonCard(horizonTextures[0].clone(), -29, -143, 0.035, { opacity: 0.17, scale: 1.12 }),
        createHorizonCard(horizonTextures[1].clone(), 31, -147, -0.035, { opacity: 0.15, scale: 1.08 })
      );
      horizonEchoCount = 2;
      if (destroyed) throw new Error("visual world destroyed during load");
      scene.add(group);
      setVisible(procedural.world, false);
    } catch (error) {
      worldGroundMeshCount = 0;
      horizonEchoCount = 0;
      disposeDetached(group);
      roadKit?.dispose?.();
      roadKit = null;
      throw error;
    }
  }

  async function loadEnvironmentLayer() {
    await ensureAssignment();
    const group = new THREE.Group();
    group.name = "asset-layer:environment";
    const stagedMoving = [];
    const stagedCars = [];
    try {
      const buildingEntries = Object.entries(assignment.backgroundAssets);
      await registry.preload([...new Set(buildingEntries.map(([, assetKey]) => assetKey))]);
      const buildings = await Promise.all(buildingEntries.map(async ([slot, assetKey], index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2);
        const root = await registry.instantiate(assetKey);
        const depth = root.userData.assetBounds?.length || 7;
        const baseZ = 5 - row * 11.2 - (side > 0 ? 5.6 : 0);
        root.position.set(side * (9.15 + depth / 2), 0, baseZ);
        root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.userData.baseZ = baseZ;
        root.userData.visualSlot = slot;
        stagedMoving.push(root);
        return root;
      }));
      buildings.forEach((root) => group.add(root));
      environmentBuildingCount = buildings.length;

      const treeRoots = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2);
        const root = await registry.instantiate("vegetation_tree");
        const baseZ = -13 - row * 36 + (side > 0 ? -8 : 0);
        root.position.set(side * 8.3, 0, baseZ);
        root.scale.setScalar(0.72 + (index % 3) * 0.08);
        root.userData.baseZ = baseZ;
        stagedMoving.push(root);
        return root;
      }));
      treeRoots.forEach((root) => group.add(root));

      const trafficEntries = Object.entries(assignment.trafficAssets);
      await registry.preload([...new Set(trafficEntries.map(([, assetKey]) => assetKey))]);
      const trafficRoots = await Promise.all(trafficEntries.map(async ([slot, assetKey], index) => {
        const root = await registry.instantiate(assetKey);
        root.position.set(index % 2 ? -2.6 : 2.5, 0, -18 - index * 27);
        root.userData.baseZ = root.position.z;
        root.userData.speedRatio = index % 2 ? 0.42 : 1.25;
        root.userData.visualDistance = 0;
        root.userData.visualSlot = slot;
        stagedCars.push(root);
        return root;
      }));
      trafficRoots.forEach((root) => group.add(root));
      if (destroyed) throw new Error("visual environment destroyed during load");
      scene.add(group);
      movingObjects.push(...stagedMoving);
      cars.push(...stagedCars);
      setVisible(procedural.environment, false);
      setVisible(procedural.traffic, false);
    } catch (error) {
      // Registry clones share geometry/material resources with the cached GLB
      // source. Detach partial clones without disposing those shared resources,
      // so a later merchant layer can still reuse a successfully loaded facade.
      group.clear();
      throw error;
    }
  }

  function createAtlasSignTexture(merchantId) {
    const signConfig = signageManifest?.merchantSigns?.[merchantId];
    if (!signageAtlasTexture || !signConfig?.rectPx) return null;
    const [x, y, width, height] = signConfig.rectPx;
    const atlasWidth = signageManifest.image.widthPx;
    const atlasHeight = signageManifest.image.heightPx;
    const texture = signageAtlasTexture.clone();
    texture.repeat.set(width / atlasWidth, height / atlasHeight);
    texture.offset.set(x / atlasWidth, 1 - ((y + height) / atlasHeight));
    texture.needsUpdate = true;
    return texture;
  }

  function removeMerchantSign(root) {
    const oldSign = root.getObjectByName("runtime-merchant-sign");
    if (!oldSign) return;
    root.remove(oldSign);
    // THREE.Sprite instances share their internal geometry, while atlas signs
    // own a plane. Disposing the shared sprite geometry breaks later fallbacks.
    if (!oldSign.isSprite) oldSign.geometry?.dispose?.();
    oldSign.material.map?.dispose?.();
    oldSign.material.dispose?.();
  }

  function updateMerchantSign(root, merchantId, label) {
    removeMerchantSign(root);
    const atlasTexture = createAtlasSignTexture(merchantId);
    const assetKey = root.userData.assetKey;
    if (atlasTexture) {
      const anchor = signageManifest.assetAnchors?.[assetKey] || signageManifest.defaultAnchor;
      const material = new THREE.MeshBasicMaterial({
        map: atlasTexture,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(anchor.width, anchor.height), material);
      const bounds = root.userData.assetBounds || { length: 6 };
      sign.name = "runtime-merchant-sign";
      sign.position.set(anchor.x || 0, anchor.y, bounds.length / 2 + anchor.depthOffset);
      sign.renderOrder = 4;
      sign.userData.signageMode = "atlas";
      sign.userData.merchantId = merchantId;
      sign.userData.signageSetVersion = signageManifest.signageSetVersion;
      root.add(sign);
      return;
    }
    const texture = makeLabelTexture(label);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    const bounds = root.userData.assetBounds || { height: 9, length: 6 };
    sign.name = "runtime-merchant-sign";
    sign.position.set(0, Math.min(bounds.height - 0.8, 7.4), bounds.length / 2 + 0.24);
    sign.scale.set(5.4, 1.27, 1);
    sign.renderOrder = 20;
    sign.userData.signageMode = "procedural";
    sign.userData.merchantId = merchantId;
    root.add(sign);
  }

  async function loadMerchantRoot(merchantId, label) {
    if (!assignment?.merchantAssets[merchantId]) return null;
    if (!merchantRoots.has(merchantId)) {
      merchantRoots.set(merchantId, (async () => {
        const assetKey = assignment.merchantAssets[merchantId];
        await ensureSignage();
        const root = await registry.instantiate(assetKey);
        root.position.set(0, 0, -11.4);
        root.visible = false;
        root.userData.merchantId = merchantId;
        updateMerchantSign(root, merchantId, label);
        scene.add(root);
        return root;
      })().catch((error) => {
        merchantRoots.delete(merchantId);
        record("merchant", "fallback", { merchantId, error: error.message });
        return null;
      }));
    }
    const root = await merchantRoots.get(merchantId);
    if (root && label) updateMerchantSign(root, merchantId, label);
    return root;
  }

  async function prepareMerchantLayer() {
    await ensureAssignment();
    const [results] = await Promise.all([
      registry.preload([...new Set(Object.values(assignment.merchantAssets))]),
      ensureSignage()
    ]);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      throw new Error(`Merchant preload failed: ${failed.map((result) => result.assetKey).join(", ")}`);
    }
  }

  function updateDestinationSign(label = "送到这里") {
    if (!destinationAssetRoot) return;
    const previous = destinationAssetRoot.getObjectByName("runtime-destination-sign");
    if (previous) {
      destinationAssetRoot.remove(previous);
      previous.material.map?.dispose?.();
      previous.material.dispose?.();
    }
    const texture = makeLabelTexture(label || "送到这里");
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    const bounds = destinationAssetRoot.userData.assetBounds || { height: 4.6, length: 1.3 };
    sign.name = "runtime-destination-sign";
    sign.position.set(0, Math.min(bounds.height - 0.58, 3.96), bounds.length / 2 + 0.1);
    sign.scale.set(2.55, 0.6, 1);
    sign.renderOrder = 20;
    destinationAssetRoot.add(sign);
  }

  async function loadDestinationLayer() {
    const root = await registry.instantiate("destination_gate_v2");
    root.position.set(0, 0, -11.4);
    root.visible = false;
    root.userData.modelVersion = "destination-gate-v2-runtime-v1";
    if (destroyed) throw new Error("visual destination destroyed during load");
    destinationAssetRoot = root;
    scene.add(root);
    updateDestinationSign();
    setVisible([procedural.destination], false);
  }

  async function loadCockpitLayer() {
    const root = await registry.instantiate("rider_handlebars");
    root.position.set(0, -1.03, -1.34);
    // Turn the vehicle front away from the camera so the rider sees the
    // phone/control side, not the headlamp face.
    root.rotation.y = Math.PI;
    root.scale.setScalar(1.08);
    if (destroyed) throw new Error("visual cockpit destroyed during load");
    cockpit.add(root);
    cockpitAssetRoot = root;
    setVisible(procedural.cockpit, false);
  }

  const ready = (async () => {
    if (requestedRank >= LEVELS.world) await runLayer("world", loadWorldLayer);
    if (requestedRank >= LEVELS.environment) await runLayer("environment", loadEnvironmentLayer);
    if (requestedRank >= LEVELS.merchant) await runLayer("destination", loadDestinationLayer);
    if (requestedRank >= LEVELS.merchant) await runLayer("merchant", prepareMerchantLayer);
    if (requestedRank >= LEVELS.all) await runLayer("cockpit", loadCockpitLayer);
    onVisualReady(getRuntime());
    return getRuntime();
  })();

  async function setActiveMerchant(merchantId, label = "") {
    if (merchantId && merchantId === activeMerchantId && activeMerchantRoot) {
      if (label && label !== activeMerchantLabel) {
        activeMerchantLabel = label;
        updateMerchantSign(activeMerchantRoot, merchantId, label);
      }
      return true;
    }
    activeMerchantId = merchantId || null;
    activeMerchantLabel = label;
    if (activeMerchantRoot) activeMerchantRoot.visible = false;
    activeMerchantRoot = null;
    if (!merchantId || requestedRank < LEVELS.merchant) return false;
    await ensureAssignment();
    const root = await loadMerchantRoot(merchantId, label);
    if (destroyed || activeMerchantId !== merchantId || !root) return false;
    activeMerchantRoot = root;
    if (merchantRequestedVisible) {
      root.visible = true;
      procedural.merchant.visible = false;
    }
    return true;
  }

  function revealMerchant() {
    merchantRequestedVisible = true;
    if (!activeMerchantRoot) return false;
    activeMerchantRoot.visible = true;
    procedural.merchant.visible = false;
    return true;
  }

  function hideMerchant() {
    merchantRequestedVisible = false;
    if (activeMerchantRoot) activeMerchantRoot.visible = false;
  }

  function revealDestination(label = "送到这里") {
    destinationRequestedVisible = true;
    if (!destinationAssetRoot) {
      if (procedural.destination) procedural.destination.visible = true;
      return false;
    }
    updateDestinationSign(label);
    destinationAssetRoot.visible = true;
    if (procedural.destination) procedural.destination.visible = false;
    return true;
  }

  function hideDestination() {
    destinationRequestedVisible = false;
    if (destinationAssetRoot) destinationAssetRoot.visible = false;
    if (procedural.destination) procedural.destination.visible = false;
  }

  function getRuntime() {
    const layers = { ...layerStatus };
    return {
      requestedArtLevel: requestedLevel,
      layerCompositionVersion: LAYER_COMPOSITION_VERSION,
      assetSetVersion: manifest?.assetSetVersion || null,
      worldSetVersion: worldManifest?.worldSetVersion || null,
      visualAssignmentVersion: assignment?.version || null,
      visualSeed: assignment?.visualSeed || null,
      layers,
      assetFallbackUsed: Object.values(layers).some((status) => status === "fallback"),
      environmentBuildingCount,
      worldGroundMeshCount,
      horizonEchoCount,
      environmentAssetKeys: assignment ? [...new Set(Object.values(assignment.backgroundAssets))] : [],
      trafficAssetKeys: assignment ? [...new Set(Object.values(assignment.trafficAssets))] : [],
      merchantAssets: assignment ? { ...assignment.merchantAssets } : {},
      activeMerchantId,
      activeMerchantAssetKey: activeMerchantRoot?.userData.assetKey || null,
      destinationAssetKey: destinationAssetRoot?.userData.assetKey || null,
      destinationModelVersion: destinationAssetRoot?.userData.modelVersion || null,
      signageSetVersion: signageManifest?.signageSetVersion || null,
      signageStatus,
      activeMerchantSignageMode: activeMerchantRoot?.getObjectByName("runtime-merchant-sign")?.userData?.signageMode || null,
      cockpitAssetKey: cockpitAssetRoot?.userData.assetKey || null,
      proceduralEnvironmentVisible: procedural.environment.some((object) => object.visible),
      proceduralTrafficVisible: procedural.traffic.some((object) => object.visible),
      proceduralCockpitVisible: procedural.cockpit.some((object) => object.visible),
      activeMerchantVisible: Boolean(activeMerchantRoot?.visible),
      proceduralMerchantVisible: Boolean(procedural.merchant.visible),
      activeDestinationVisible: Boolean(destinationAssetRoot?.visible),
      destinationRequestedVisible,
      proceduralDestinationVisible: Boolean(procedural.destination?.visible),
      telemetry: telemetry.slice()
    };
  }

  function destroy() {
    destroyed = true;
    hideMerchant();
    hideDestination();
    roadKit?.dispose?.();
    signageAtlasTexture?.dispose?.();
    cockpitAssetRoot = null;
    destinationAssetRoot = null;
    merchantRoots.clear();
    registry.clearCache();
  }

  return { ready, setActiveMerchant, revealMerchant, hideMerchant, revealDestination, hideDestination, getRuntime, destroy };
}
