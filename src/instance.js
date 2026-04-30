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
//   detachInstance(api.getSelection()[0]);
//
// Cavalry API reference used:
//   api.getSelection(), api.getNiceName(), api.rename(), api.duplicate()
//   api.getAttributes(), api.get(), api.set(), api.connect(), api.disconnectInput()

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  instanceCount: 3,  // Number of instances to create
  offsetX: 150,      // Horizontal gap between each instance (scene units)
  offsetY: 0,        // Vertical gap between each instance (scene units)
  namePrefix: '',    // Instance name prefix — defaults to the source layer name
};

// ─── Transform attribute filter ───────────────────────────────────────────────
// Attributes whose root key (the part before the first ".") matches one of these
// are treated as transform properties and left independent per instance.
// Everything else — path data, shape params, fill, stroke, etc. — is connected.

const TRANSFORM_ROOTS = new Set([
  'position',
  'rotation',
  'scale',
  'anchor',
  'shear',
  // Remove 'opacity' from this set to share opacity across all instances instead.
  'opacity',
]);

function isTransformAttr(key) {
  const root = key.split('.')[0].toLowerCase();
  return TRANSFORM_ROOTS.has(root);
}

// ─── Position helpers ─────────────────────────────────────────────────────────

function getPosition(layerId) {
  try {
    return {
      x: api.get(layerId, 'position.x') ?? 0,
      y: api.get(layerId, 'position.y') ?? 0,
    };
  } catch (_) {
    return { x: 0, y: 0 };
  }
}

function setPosition(layerId, x, y) {
  try {
    api.set(layerId, { 'position.x': x, 'position.y': y });
  } catch (e) {
    console.log(`WARNING: could not set position — ${e.message}`);
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

// Create one instance of sourceId at offset index * CONFIG.offset{X,Y}.
// Returns the new layer ID.
function createInstance(sourceId, index) {
  const sourceName = api.getNiceName(sourceId) || sourceId;
  const prefix = CONFIG.namePrefix || sourceName;
  const instanceName = `${prefix} Instance ${index}`;

  const instanceId = api.create(api.getLayerType(sourceId), instanceName);

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
  const keys = api.getAttributes(sourceId);
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

  console.log(`  [${index}] "${instanceName}" — ${connected} attrs connected`);
  return instanceId;
}

// Break all non-transform connections on an instance, making it fully independent.
// Useful when you want to diverge one copy from the source.
function detachInstance(instanceId) {
  const keys = api.getAttributes(instanceId);
  let detached = 0;

  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try {
      api.disconnectInput(instanceId, key);
      detached++;
    } catch (_) {
      // Not connected or not disconnectable — skip.
    }
  }

  const name = api.getNiceName(instanceId) || instanceId;
  console.log(`Detached "${name}" (${detached} connections removed).`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const selected = api.getSelection();

  if (!selected || selected.length === 0) {
    console.log('WARNING: select a source layer first, then run this script.');
    return;
  }

  const sourceId = selected[0];
  const sourceName = api.getNiceName(sourceId) || sourceId;

  console.log(`Cavalry Instance: creating ${CONFIG.instanceCount} instance(s) of "${sourceName}"...`);

  const ids = [];
  for (let i = 1; i <= CONFIG.instanceCount; i++) {
    ids.push(createInstance(sourceId, i));
  }

  console.log(`Done — ${ids.length} instance(s) ready.`);
  console.log(`Edit "${sourceName}" to update path, shape, and appearance on all instances.`);
}

main();
