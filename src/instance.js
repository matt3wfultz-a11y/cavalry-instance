// Cavalry Instance
//
// Creates Cinema 4D-style instances of a selected layer.
// Instances share the source's path, shape geometry, fill, stroke, and all
// other visual attributes. Position, rotation, and scale stay independent.
// Deformers and filters connected via the Cavalry graph are propagated to
// each instance and can be re-synced after adding new ones.
//
// Usage:
//   1. Open this script as a panel (Scripting > New Script Panel)
//   2. Select a source layer
//   3. Set an offset so the instance doesn't land on top of the source
//   4. Click Create Instance
//   5. Edit the source — all instances update automatically (fill/stroke
//      on/off included)
//   6. After adding a new deformer/filter, click Sync Deformers
//   7. To break one instance free, select it and click Detach

// ─── Transform attribute filter ───────────────────────────────────────────────

const TRANSFORM_ROOTS = new Set(['position', 'rotation', 'scale']);

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

// ─── Instance tracking ────────────────────────────────────────────────────────

const SOURCE_KEY = 'cavalryInstance_sourceId';

function tagAsInstance(instanceId, sourceId) {
  try { api.setUserData(instanceId, SOURCE_KEY, sourceId); } catch (_) {}
}

function getInstancesOfSource(sourceId) {
  return api.getCompLayers(false).filter(id => {
    try { return api.getUserDataKey(id, SOURCE_KEY) === sourceId; }
    catch (_) { return false; }
  });
}

// ─── Deformer / filter sync ───────────────────────────────────────────────────
//
// Cavalry behaviors/deformers are NOT child layers — they connect to target
// layers via the Cavalry graph. We find them by reading which external layers
// are driving attributes on the source (getInConnectedAttributes), then wire
// those same drivers into the instance.

function syncDeformers(sourceId, instanceId) {
  let synced = 0;

  let inAttrs;
  try { inAttrs = api.getInConnectedAttributes(sourceId); }
  catch (_) { inAttrs = []; }

  for (const attr of inAttrs) {
    try {
      const conn = api.getInConnection(sourceId, attr);
      if (!conn) continue;

      // Connection string is "layerId.attrId"
      const dot = conn.indexOf('.');
      if (dot < 0) continue;
      const fromLayer = conn.slice(0, dot);
      const fromAttr  = conn.slice(dot + 1);

      // Skip connections that come from the source itself (our own links)
      if (fromLayer === sourceId) continue;

      // Skip if the instance already has this connection on this attribute
      try {
        const existing = api.getInConnection(instanceId, attr);
        if (existing) continue;
      } catch (_) {}

      api.connect(fromLayer, fromAttr, instanceId, attr);
      synced++;
    } catch (_) {}
  }

  return synced;
}

function syncAllDeformers(sourceId) {
  const instances = getInstancesOfSource(sourceId);
  if (!instances.length) {
    console.log('No instances found for this layer. Create instances first.');
    return;
  }
  let total = 0;
  for (const id of instances) total += syncDeformers(sourceId, id);
  console.log(`Synced ${total} deformer/filter connection(s) across ${instances.length} instance(s).`);
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function createInstance(sourceId, offsetX, offsetY) {
  const sourceName = api.getNiceName(sourceId) || sourceId;
  const instanceName = `${sourceName} Instance`;
  const layerType = api.getLayerType(sourceId);

  // Detect text layers by presence of a 'text' attribute rather than relying
  // on the layer type string, which varies across Cavalry versions.
  const isText = api.hasAttribute(sourceId, 'text');
  if (isText) {
    console.log(`Layer type: "${layerType}" (detected as text layer)`);
  }

  let instanceId;

  if (layerType === 'editableShape') {
    // Initialise from the source path so the instance starts as the correct
    // shape before attribute connections take over.
    const rawPath = api.getEditablePath(sourceId, false);
    const path = new cavalry.Path();
    path.fromObject(rawPath);
    instanceId = api.createEditable(path, instanceName);
  } else {
    instanceId = api.create(layerType, instanceName);
    // Match the source's generator sub-type (rectangle, circle, star, etc.)
    // so the instance doesn't default to a polygon.
    const gens = api.getGenerators(sourceId);
    for (const g of gens) {
      try {
        api.setGenerator(instanceId, g, api.getCurrentGeneratorType(sourceId, g));
      } catch (_) {}
    }
  }

  // Track this instance so Sync can find it later.
  tagAsInstance(instanceId, sourceId);

  // Connect fill and stroke. Try the compound key first ('fill', 'stroke'),
  // then fall back to common sub-attribute names seen across Cavalry versions.
  // Log every attempt so mismatches are visible in the console.
  function tryConnectAttr(attr) {
    if (!api.hasAttribute(sourceId, attr)) return false;
    try { api.connect(sourceId, attr, instanceId, attr); return true; }
    catch (e) { console.log(`  connect "${attr}" failed: ${e.message}`); return false; }
  }

  const fillConnected =
    tryConnectAttr('fill') ||
    tryConnectAttr('fill.enable') ||
    tryConnectAttr('fill.enabled') ||
    tryConnectAttr('fillEnabled');
  console.log(`  fill connected: ${fillConnected}`);
  if (!fillConnected) api.setFill(instanceId, api.hasFill(sourceId));

  const strokeConnected =
    tryConnectAttr('stroke') ||
    tryConnectAttr('stroke.enable') ||
    tryConnectAttr('stroke.enabled') ||
    tryConnectAttr('strokeEnabled');
  console.log(`  stroke connected: ${strokeConnected}`);

  // Offset position (not connected — each instance moves independently).
  const srcPos = getPosition(sourceId);
  setPosition(instanceId, srcPos.x + offsetX, srcPos.y + offsetY);

  // Connect every remaining non-transform attribute.
  // For text layers, skip path/subpath attributes — the text layout engine
  // generates character positions from the text + font attributes.
  // Connecting the path directly causes all characters to stack at origin.
  const TEXT_PATH_ROOTS = new Set(['path', 'editablepath', 'subpath', 'points']);
  const keys = api.getAttributes(sourceId);
  let connected = 0;
  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    if (isText && TEXT_PATH_ROOTS.has(key.split('.')[0].toLowerCase())) continue;
    // fill and stroke already handled above
    const root = key.split('.')[0].toLowerCase();
    if (root === 'fill' || root === 'stroke') continue;
    try { api.connect(sourceId, key, instanceId, key); connected++; }
    catch (_) {}
  }

  // Propagate any deformers/filters already wired to the source.
  const deformersSynced = syncDeformers(sourceId, instanceId);

  console.log(
    `Instance "${instanceName}" created — ` +
    `${connected} attrs connected` +
    (fillConnected   ? ', fill linked'   : '') +
    (strokeConnected ? ', stroke linked' : '') +
    (deformersSynced ? `, ${deformersSynced} deformer(s) synced` : '') +
    '.'
  );
  return instanceId;
}

function detachInstance(instanceId) {
  const keys = api.getAttributes(instanceId);
  let detached = 0;
  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try { api.disconnectInput(instanceId, key); detached++; } catch (_) {}
  }
  // Also disconnect fill/stroke compound attrs
  try { api.disconnectInput(instanceId, 'fill');   detached++; } catch (_) {}
  try { api.disconnectInput(instanceId, 'stroke'); detached++; } catch (_) {}
  const name = api.getNiceName(instanceId) || instanceId;
  console.log(`Detached "${name}" — ${detached} connections removed.`);
}

// ─── Debug helper ────────────────────────────────────────────────────────────
// Logs the layer type, every attribute key, and fill/stroke/text flags.
// Run this on the source layer before reporting issues — the output tells us
// the exact attribute names Cavalry uses for this layer type.

function debugLayer(layerId) {
  const name = api.getNiceName(layerId) || layerId;
  const type = api.getLayerType(layerId);
  const attrs = api.getAttributes(layerId);

  console.log(`\n=== Debug: "${name}" ===`);
  console.log(`  type          : ${type}`);
  console.log(`  hasFill       : ${api.hasFill(layerId)}`);
  console.log(`  hasStroke     : ${api.hasStroke(layerId)}`);
  console.log(`  has 'text'    : ${api.hasAttribute(layerId, 'text')}`);
  console.log(`  has 'fill'    : ${api.hasAttribute(layerId, 'fill')}`);
  console.log(`  has 'stroke'  : ${api.hasAttribute(layerId, 'stroke')}`);
  console.log(`  attributes (${attrs.length}):`);
  for (const a of attrs) console.log(`    ${a}`);
  console.log('=== end debug ===\n');
}

// ─── UI ──────────────────────────────────────────────────────────────────────

const hintLabel = new ui.Label('Select a source layer, then click Create.');
hintLabel.setFontSize(11);

const offsetXField = new ui.NumericField(150);
offsetXField.setType(0);
offsetXField.setMin(-9999);
offsetXField.setMax(9999);

const offsetYField = new ui.NumericField(0);
offsetYField.setType(0);
offsetYField.setMin(-9999);
offsetYField.setMax(9999);

const createBtn = new ui.Button('Create Instance');
createBtn.onClick = function () {
  const selected = api.getSelection();
  if (!selected || selected.length === 0) {
    console.log('WARNING: select a source layer before creating an instance.');
    return;
  }
  createInstance(selected[0], offsetXField.getValue(), offsetYField.getValue());
};

const syncBtn = new ui.Button('Sync Deformers to Instances');
syncBtn.onClick = function () {
  const selected = api.getSelection();
  if (!selected || selected.length === 0) {
    console.log('WARNING: select the source layer to sync from.');
    return;
  }
  syncAllDeformers(selected[0]);
};

const detachBtn = new ui.Button('Detach Selected Instance');
detachBtn.onClick = function () {
  const selected = api.getSelection();
  if (!selected || selected.length === 0) {
    console.log('WARNING: select an instance layer to detach.');
    return;
  }
  detachInstance(selected[0]);
};

const debugBtn = new ui.Button('Debug Selected Layer');
debugBtn.onClick = function () {
  const selected = api.getSelection();
  if (!selected || selected.length === 0) {
    console.log('WARNING: select a layer to debug.');
    return;
  }
  debugLayer(selected[0]);
};

const offsetRow = new ui.HLayout();
offsetRow.setSpaceBetween(6);
offsetRow.add(
  new ui.Label('Offset X'), offsetXField,
  new ui.Label('Y'), offsetYField,
);

const root = new ui.VLayout();
root.setMargins(10, 10, 10, 10);
root.setSpaceBetween(8);
root.add(hintLabel, offsetRow, createBtn, syncBtn, detachBtn, debugBtn);

ui.setTitle('Cavalry Instance');
ui.setMinimumWidth(260);
ui.add(root);
ui.show();
