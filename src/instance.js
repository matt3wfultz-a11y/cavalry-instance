// Cavalry Instance Script
//
// Creates Cinema 4D-style instances of a selected layer.
// Instances share the source's path, shape geometry, and appearance attributes —
// so editing the source updates every instance automatically. Each instance keeps
// its own independent transform (position, rotation, scale).
//
// How to use:
//   1. Select the layer you want to instance in the Cavalry scene
//   2. Adjust CONFIG below if needed
//   3. Paste or load this script in the Cavalry JavaScript Editor and run it
//   4. Edit the original source layer to update all instances at once
//   5. Move / rotate / scale each instance independently in the viewport
//
// To detach a single instance (make it fully independent), select it and call:
//   detachInstance(api.getSelectedLayerIds()[0]);

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  instanceCount: 3,  // Number of instances to create
  offsetX: 150,      // Horizontal gap between each instance (scene units)
  offsetY: 0,        // Vertical gap between each instance (scene units)
  namePrefix: '',    // Instance name prefix — defaults to the source layer name
};

// ─── Transform attribute filter ───────────────────────────────────────────────
// Any attribute whose key contains one of these fragments (case-insensitive,
// split on "." or "/") is treated as a transform property and left independent
// per instance. Everything else — path data, shape params, fill, stroke, etc. —
// is connected from source → instance.

const TRANSFORM_FRAGMENTS = new Set([
  'transform',
  'position', 'x', 'y', 'z',
  'rotation',
  'scale', 'scalex', 'scaley', 'scalez',
  'anchor', 'anchorx', 'anchory',
  'shear',
  // 'opacity' is intentionally excluded from this set so that opacity is
  // connected (shared) by default. Add it back here to make opacity independent.
]);

function isTransformAttr(key) {
  return key.toLowerCase().split(/[./]/).some(part => TRANSFORM_FRAGMENTS.has(part));
}

// ─── Position helpers ─────────────────────────────────────────────────────────

function getPosition(layerId) {
  try {
    return {
      x: api.getLayerAttribute(layerId, 'transform.position.x') ?? 0,
      y: api.getLayerAttribute(layerId, 'transform.position.y') ?? 0,
    };
  } catch (_) {
    return { x: 0, y: 0 };
  }
}

function setPosition(layerId, x, y) {
  try {
    api.setLayerAttribute(layerId, 'transform.position.x', x);
    api.setLayerAttribute(layerId, 'transform.position.y', y);
  } catch (e) {
    api.warning(`Instance: could not set position — ${e.message}`);
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

// Create one instance of sourceId at offset index * CONFIG.offset{X,Y}.
// Returns the new layer ID.
function createInstance(sourceId, index) {
  const sourceName = api.getLayerName(sourceId);
  const prefix = CONFIG.namePrefix || sourceName;

  const instanceId = api.duplicate(sourceId);
  api.setLayerName(instanceId, `${prefix} Instance ${index}`);

  // Offset position — this is NOT connected, so each instance moves freely.
  const srcPos = getPosition(sourceId);
  setPosition(
    instanceId,
    srcPos.x + CONFIG.offsetX * index,
    srcPos.y + CONFIG.offsetY * index,
  );

  // Connect every non-transform attribute so the instance mirrors the source.
  // This covers: path/pathData, shape geometry (width, height, radius, corners),
  // fill color, stroke color + width, blend mode, and any other visual attrs.
  const keys = api.getLayerAttributeKeys(sourceId);
  let connected = 0;

  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try {
      api.connect(sourceId, key, instanceId, key);
      connected++;
    } catch (_) {
      // Read-only or computed attribute — not connectable, skip silently.
    }
  }

  api.log(`  [${index}] "${api.getLayerName(instanceId)}" — ${connected} attrs connected`);
  return instanceId;
}

// Break all non-transform connections on an instance, making it fully independent.
// Useful when you want to diverge one copy from the source.
function detachInstance(instanceId) {
  const keys = api.getLayerAttributeKeys(instanceId);
  let detached = 0;

  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try {
      api.disconnect(instanceId, key);
      detached++;
    } catch (_) {
      // Not connected or not disconnectable — skip.
    }
  }

  api.log(`Detached "${api.getLayerName(instanceId)}" (${detached} connections removed).`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const selected = api.getSelectedLayerIds();

  if (!selected || selected.length === 0) {
    api.warning('Cavalry Instance: select a source layer first, then run this script.');
    return;
  }

  const sourceId = selected[0];
  const sourceName = api.getLayerName(sourceId);

  api.log(`Cavalry Instance: creating ${CONFIG.instanceCount} instance(s) of "${sourceName}"...`);

  const ids = [];
  for (let i = 1; i <= CONFIG.instanceCount; i++) {
    ids.push(createInstance(sourceId, i));
  }

  api.log(`Done — ${ids.length} instance(s) ready.`);
  api.log(`Tip: edit "${sourceName}" to update path, shape, and appearance on all instances.`);
}

main();
