// Shape Scale Tie
//
// Ties layers to a master shape so they scale proportionally.
// When the master's scale changes, all tied layers scale by the same factor,
// preserving their individual scale ratios relative to the master at tie-time.
//
// Usage:
//   1. Select the master shape and click "Set Selected as Master"
//   2. Select the layers you want to follow it and click "Tie to Master"
//   3. Change the master's scale — tied layers scale proportionally
//   4. To free a layer, select it and click "Untie Selected"
//   5. "Clear All" removes the master and all ties

// ─── State ────────────────────────────────────────────────────────────────────

let masterId = null;

// { followerId: { ratioX, ratioY } }
// ratioX/Y = follower_scale / master_scale recorded at tie-time
const followers = {};

// Last observed master scale — used to detect real changes in onAttrChanged
let lastMasterScale = { x: 1, y: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScale(layerId) {
  try {
    return {
      x: api.get(layerId, 'scale.x') ?? 1,
      y: api.get(layerId, 'scale.y') ?? 1,
    };
  } catch (_) {
    return { x: 1, y: 1 };
  }
}

function layerName(id) {
  try { return api.getNiceName(id) || id; } catch (_) { return id; }
}

function refreshLabels() {
  const name = masterId ? layerName(masterId) : '(none)';
  masterLabel.setText(`Master: ${name}`);
  tiedLabel.setText(`Tied: ${Object.keys(followers).length} layer(s)`);
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function setMaster() {
  const sel = api.getSelection();
  if (!sel || !sel.length) {
    console.log('WARNING: select a layer to use as master.');
    return;
  }
  masterId = sel[0];
  lastMasterScale = getScale(masterId);
  console.log(`Master: "${layerName(masterId)}" (scale ${lastMasterScale.x}, ${lastMasterScale.y})`);
  refreshLabels();
}

function tieSelected() {
  if (!masterId) {
    console.log('WARNING: set a master first.');
    return;
  }
  const sel = api.getSelection();
  if (!sel || !sel.length) {
    console.log('WARNING: select layers to tie.');
    return;
  }
  const ms = getScale(masterId);
  let count = 0;
  for (const id of sel) {
    if (id === masterId) continue;
    const fs = getScale(id);
    followers[id] = {
      ratioX: ms.x !== 0 ? fs.x / ms.x : 1,
      ratioY: ms.y !== 0 ? fs.y / ms.y : 1,
    };
    console.log(`Tied "${layerName(id)}" (ratio ${followers[id].ratioX.toFixed(3)}, ${followers[id].ratioY.toFixed(3)})`);
    count++;
  }
  if (!count) {
    console.log('WARNING: no valid layers to tie (master cannot tie to itself).');
  }
  refreshLabels();
}

function untieSelected() {
  const sel = api.getSelection();
  if (!sel || !sel.length) {
    console.log('WARNING: select layers to untie.');
    return;
  }
  for (const id of sel) {
    if (followers[id]) {
      delete followers[id];
      console.log(`Untied "${layerName(id)}".`);
    }
  }
  refreshLabels();
}

function clearAll() {
  const n = Object.keys(followers).length;
  for (const id of Object.keys(followers)) delete followers[id];
  masterId = null;
  lastMasterScale = { x: 1, y: 1 };
  console.log(`Cleared master and ${n} tied layer(s).`);
  refreshLabels();
}

// ─── Reactive update ──────────────────────────────────────────────────────────
// onAttrChanged fires for every attribute edit in the comp.
// We bail early if the master's scale hasn't actually moved so that writing
// to follower scales doesn't cascade back into itself.

function onAttrChanged() {
  if (!masterId || !Object.keys(followers).length) return;

  const ms = getScale(masterId);
  if (ms.x === lastMasterScale.x && ms.y === lastMasterScale.y) return;
  lastMasterScale = { x: ms.x, y: ms.y };

  for (const [id, { ratioX, ratioY }] of Object.entries(followers)) {
    try {
      api.set(id, {
        'scale.x': ms.x * ratioX,
        'scale.y': ms.y * ratioY,
      });
    } catch (_) {}
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

const masterLabel = new ui.Label('Master: (none)');
masterLabel.setFontSize(11);

const tiedLabel = new ui.Label('Tied: 0 layer(s)');
tiedLabel.setFontSize(11);

const setMasterBtn = new ui.Button('Set Selected as Master');
setMasterBtn.onClick = setMaster;

const tieBtn = new ui.Button('Tie Selected to Master');
tieBtn.onClick = tieSelected;

const untieBtn = new ui.Button('Untie Selected');
untieBtn.onClick = untieSelected;

const clearBtn = new ui.Button('Clear All');
clearBtn.onClick = clearAll;

const root = new ui.VLayout();
root.setMargins(10, 10, 10, 10);
root.setSpaceBetween(8);
root.add(masterLabel, tiedLabel, setMasterBtn, tieBtn, untieBtn, clearBtn);

ui.addCallbackObject({ onAttrChanged });

ui.setTitle('Shape Scale Tie');
ui.setMinimumWidth(240);
ui.add(root);
ui.show();
