// Cavalry Instance
//
// Creates Cinema 4D-style instances of a selected layer.
// Instances share the source's path, shape geometry, fill, stroke, and all
// other visual attributes. Position, rotation, and scale stay independent.
//
// Usage:
//   1. Open this script as a panel in Cavalry (Scripting > New Script Panel)
//   2. Select a source layer in your scene
//   3. Set an offset so the instance doesn't land on top of the source
//   4. Click Create Instance
//   5. Edit the source layer — all instances update automatically
//   6. To break one instance free, select it and click Detach

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

// ─── Core ─────────────────────────────────────────────────────────────────────

function createInstance(sourceId, offsetX, offsetY) {
  const sourceName = api.getNiceName(sourceId) || sourceId;
  const instanceName = `${sourceName} Instance`;

  const instanceId = api.create(api.getLayerType(sourceId), instanceName);

  // Mirror fill/stroke enabled state — a blank layer from api.create() may
  // have these off, which would hide the connected colour/width values.
  api.setFill(instanceId, api.hasFill(sourceId));
  api.setStroke(instanceId, api.hasStroke(sourceId));

  // Offset position (not connected, so the instance moves independently).
  const srcPos = getPosition(sourceId);
  setPosition(instanceId, srcPos.x + offsetX, srcPos.y + offsetY);

  // Connect every non-transform attribute: path, shape geometry, fill colour,
  // stroke colour + width, opacity, blend mode, anchor, etc.
  const keys = api.getAttributes(sourceId);
  let connected = 0;
  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try {
      api.connect(sourceId, key, instanceId, key);
      connected++;
    } catch (_) {
      // Read-only or computed — not connectable, skip silently.
    }
  }

  console.log(`Instance "${instanceName}" created — ${connected} attrs connected.`);
  return instanceId;
}

// Break all non-transform attribute connections, making the instance fully
// independent from the source.
function detachInstance(instanceId) {
  const keys = api.getAttributes(instanceId);
  let detached = 0;
  for (const key of keys) {
    if (isTransformAttr(key)) continue;
    try {
      api.disconnectInput(instanceId, key);
      detached++;
    } catch (_) {}
  }
  const name = api.getNiceName(instanceId) || instanceId;
  console.log(`Detached "${name}" — ${detached} connections removed.`);
}

// ─── UI ──────────────────────────────────────────────────────────────────────

const hintLabel = new ui.Label('Select a source layer, then click Create.');
hintLabel.setFontSize(11);

// Offset fields
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

const detachBtn = new ui.Button('Detach Selected Instance');
detachBtn.onClick = function () {
  const selected = api.getSelection();
  if (!selected || selected.length === 0) {
    console.log('WARNING: select an instance layer to detach.');
    return;
  }
  detachInstance(selected[0]);
};

// Offset row: [Label "Offset X"] [field] [Label "Y"] [field]
const offsetRow = new ui.HLayout();
offsetRow.setSpaceBetween(6);
offsetRow.add(
  new ui.Label('Offset X'), offsetXField,
  new ui.Label('Y'), offsetYField,
);

// Root layout
const root = new ui.VLayout();
root.setMargins(10, 10, 10, 10);
root.setSpaceBetween(8);
root.add(hintLabel, offsetRow, createBtn, detachBtn);

ui.setTitle('Cavalry Instance');
ui.setMinimumWidth(260);
ui.add(root);
ui.show();
