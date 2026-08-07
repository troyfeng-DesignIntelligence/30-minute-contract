import * as THREE from "../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";

export const DEFAULT_ASSET_MANIFEST_URL = "./assets/asset-manifest.v1.json";

function degrees(value = 0) {
  return THREE.MathUtils.degToRad(Number(value) || 0);
}

function dimensionForAxis(size, axis) {
  if (axis === "height") return size.y;
  if (axis === "width") return size.x;
  if (axis === "length") return size.z;
  return Math.max(size.x, size.y, size.z);
}

function setVector(target, value) {
  if (Array.isArray(value)) target.set(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  else if (value?.isVector3 || value?.isEuler) target.copy(value);
}

function configureMeshes(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
    });
  });
}

function normalizeClone(source, asset) {
  const content = source.clone(true);
  content.rotation.y = degrees(asset.rotationYDegrees);
  content.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(content);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const requested = asset.normalize || { axis: "max", meters: 1 };
  const rawDimension = Math.max(0.0001, dimensionForAxis(rawSize, requested.axis));
  content.scale.setScalar(Number(requested.meters) / rawDimension);
  content.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(content);
  const center = scaledBox.getCenter(new THREE.Vector3());
  content.position.set(-center.x, -scaledBox.min.y, -center.z);
  content.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.name = `asset:${asset.key}`;
  root.add(content);
  configureMeshes(root);
  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  root.userData.assetBounds = {
    width: finalSize.x,
    height: finalSize.y,
    length: finalSize.z
  };
  return root;
}

async function fetchManifest(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Asset manifest failed: ${response.status}`);
  const manifest = await response.json();
  if (!manifest.assetSetVersion || !manifest.assets) throw new Error("Asset manifest is missing required fields");
  Object.entries(manifest.assets).forEach(([key, asset]) => { asset.key = key; });
  return manifest;
}

export function createAssetRegistry({
  manifestUrl = DEFAULT_ASSET_MANIFEST_URL,
  loader = new GLTFLoader(),
  onTelemetry = () => {},
  fallbackFactory = null
} = {}) {
  const manifestPromise = fetchManifest(manifestUrl);
  const sourceCache = new Map();

  async function getManifest() {
    return manifestPromise;
  }

  async function loadSource(assetKey) {
    const manifest = await manifestPromise;
    const asset = manifest.assets[assetKey];
    if (!asset) throw new Error(`Unknown asset key: ${assetKey}`);
    const cacheHit = sourceCache.has(assetKey);
    if (!cacheHit) sourceCache.set(assetKey, loader.loadAsync(asset.url));
    const started = performance.now();
    try {
      const gltf = await sourceCache.get(assetKey);
      onTelemetry({
        event: "asset_load",
        assetSetVersion: manifest.assetSetVersion,
        assetKey,
        assetLoadMs: performance.now() - started,
        assetCacheHit: cacheHit,
        assetFallbackUsed: false
      });
      return { gltf, asset, manifest, cacheHit };
    } catch (error) {
      sourceCache.delete(assetKey);
      throw error;
    }
  }

  async function instantiate(assetKey, options = {}) {
    const started = performance.now();
    try {
      const { gltf, asset, manifest, cacheHit } = await loadSource(assetKey);
      const root = normalizeClone(gltf.scene, asset);
      root.userData.assetKey = assetKey;
      root.userData.assetSetVersion = manifest.assetSetVersion;
      root.userData.assetCacheHit = cacheHit;
      setVector(root.position, options.position);
      setVector(root.rotation, options.rotation);
      if (Number.isFinite(options.rotationY)) root.rotation.y = options.rotationY;
      if (Number.isFinite(options.scale)) root.scale.setScalar(options.scale);
      root.visible = options.visible ?? true;
      options.parent?.add(root);
      return root;
    } catch (error) {
      const manifest = await manifestPromise;
      const fallback = await fallbackFactory?.(assetKey, manifest.assets[assetKey], error, options);
      onTelemetry({
        event: "asset_load",
        assetSetVersion: manifest.assetSetVersion,
        assetKey,
        assetLoadMs: performance.now() - started,
        assetCacheHit: false,
        assetFallbackUsed: Boolean(fallback),
        assetError: error.message
      });
      if (!fallback) throw error;
      fallback.userData.assetKey = assetKey;
      fallback.userData.assetSetVersion = manifest.assetSetVersion;
      fallback.userData.assetFallbackUsed = true;
      setVector(fallback.position, options.position);
      setVector(fallback.rotation, options.rotation);
      if (Number.isFinite(options.rotationY)) fallback.rotation.y = options.rotationY;
      if (Number.isFinite(options.scale)) fallback.scale.setScalar(options.scale);
      fallback.visible = options.visible ?? true;
      options.parent?.add(fallback);
      return fallback;
    }
  }

  async function preload(assetKeys) {
    const uniqueKeys = [...new Set(assetKeys)];
    const results = await Promise.allSettled(uniqueKeys.map(loadSource));
    return results.map((result, index) => ({ assetKey: uniqueKeys[index], status: result.status, reason: result.reason?.message }));
  }

  return {
    getManifest,
    instantiate,
    preload,
    hasCached(assetKey) { return sourceCache.has(assetKey); },
    clearCache() { sourceCache.clear(); }
  };
}
