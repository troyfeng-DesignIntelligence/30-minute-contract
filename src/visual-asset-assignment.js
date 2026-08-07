const VISUAL_ASSIGNMENT_VERSION = "visual-assignment-v2";

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function assignCycled(ids, pool, random) {
  if (!pool.length) throw new Error("Visual asset pool cannot be empty");
  const result = {};
  let cycle = [];
  ids.forEach((id, index) => {
    if (index % pool.length === 0) cycle = shuffled(pool, random);
    result[id] = cycle[index % pool.length];
  });
  return result;
}

/**
 * Makes appearance deterministic without receiving hidden workload, feedback, or outcomes.
 * The same merchant ID keeps the same facade for its whole segment.
 */
export function createVisualAssetAssignment(manifest, {
  participantSeed,
  merchantIds = [],
  backgroundSlots = [],
  trafficSlots = []
}) {
  if (!manifest?.assetSetVersion || !manifest?.assets) throw new Error("A valid asset manifest is required");
  const visualSeed = hash32(`${VISUAL_ASSIGNMENT_VERSION}:${manifest.assetSetVersion}:${participantSeed}`);
  const random = mulberry32(visualSeed);
  const entries = Object.entries(manifest.assets);
  const facadePool = entries
    .filter(([, asset]) => asset.status?.startsWith("approved"))
    .filter(([, asset]) => asset.merchantEligible === true)
    .map(([key]) => key);
  const backgroundPool = entries
    .filter(([, asset]) => asset.status?.startsWith("approved"))
    .filter(([, asset]) => asset.usage === "background_pool" && asset.category === "environment")
    .map(([key]) => key);
  const trafficPool = entries
    .filter(([, asset]) => asset.status?.startsWith("approved"))
    .filter(([, asset]) => asset.usage === "traffic_pool")
    .map(([key]) => key);

  return Object.freeze({
    version: VISUAL_ASSIGNMENT_VERSION,
    assetSetVersion: manifest.assetSetVersion,
    visualSeed,
    merchantAssets: Object.freeze(assignCycled(merchantIds, facadePool, random)),
    backgroundAssets: Object.freeze(assignCycled(backgroundSlots, backgroundPool, random)),
    trafficAssets: Object.freeze(assignCycled(trafficSlots, trafficPool, random))
  });
}
