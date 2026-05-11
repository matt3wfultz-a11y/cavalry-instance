// Shape Scale Tie
//
// Ties layers to a master shape so they scale and reposition proportionally.
// When the master scales, tied layers scale by the same factor AND their
// distances from the master's center scale too — so objects evenly distributed
// inside a shape stay in the same relative positions as the shape grows or shrinks.
//
// Usage:
//   1. Select the master shape and click "Set Selected as Master"
//   2. Select the layers you want to follow it and click "Tie to Master"
//   3. Change the master's scale — tied layers scale and reposition proportionally
//   4. Moving the master also moves all tied layers with it
//   5. To free a layer, select it and click "Untie Selected"
//   6. "Clear All" removes the master and all ties

// ─── State ────────────────────────────────────────────────────────────────────

let masterId = null;

// { followerId: { ratioX, ratioY, offsetX, offsetY, baseMasterScaleX, baseMasterScaleY } }
//   ratioX/Y          = follower_scale / master_scale at tie-time
//   offsetX/Y         = follower_pos - master_pos at tie-time (world space)
//   baseMasterScale   = master scale at tie-time (used to compute scale-change factor)
const followers = {};

// Last observed master state — bail-out guard to prevent cascade loops
let lastMaster = { scaleX: 1, scaleY: 1, posX: 0, posY: 0 };

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
  const ms = getScale(masterId);
  const mp = getPosition(masterId);
  lastMaster = { scaleX: ms.x, scaleY: ms.y, posX: mp.x, posY: mp.y };
  console.log(`Master: "${layerName(masterId)}" (scale ${ms.x}, ${ms.y} | pos ${mp.x}, ${mp.y})`);
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
  const mp = getPosition(masterId);
  let count = 0;
  for (const id of sel) {
    if (id === masterId) continue;
    const fs = getScale(id);
    const fp = getPosition(id);
    followers[id] = {
      ratioX: ms.x !== 0 ? fs.x / ms.x : 1,
      ratioY: ms.y !== 0 ? fs.y / ms.y : 1,
      offsetX: fp.x - mp.x,
      offsetY: fp.y - mp.y,
      baseMasterScaleX: ms.x,
      baseMasterScaleY: ms.y,
    };
    console.log(
      `Tied "${layerName(id)}" ` +
      `(scale ratio ${followers[id].ratioX.toFixed(3)}, ${followers[id].ratioY.toFixed(3)} | ` +
      `offset ${followers[id].offsetX.toFixed(1)}, ${followers[id].offsetY.toFixed(1)})`
    );
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
  lastMaster = { scaleX: 1, scaleY: 1, posX: 0, posY: 0 };
  console.log(`Cleared master and ${n} tied layer(s).`);
  refreshLabels();
}

// ─── Reactive update ──────────────────────────────────────────────────────────
// onAttrChanged fires for every attribute edit in the comp.
// We bail early when neither scale nor position has changed on the master,
// which prevents the follower writes from feeding back into this handler.

function onAttrChanged() {
  if (!masterId || !Object.keys(followers).length) return;

  const ms = getScale(masterId);
  const mp = getPosition(masterId);

  if (
    ms.x === lastMaster.scaleX && ms.y === lastMaster.scaleY &&
    mp.x === lastMaster.posX  && mp.y === lastMaster.posY
  ) return;

  lastMaster = { scaleX: ms.x, scaleY: ms.y, posX: mp.x, posY: mp.y };

  for (const [id, { ratioX, ratioY, offsetX, offsetY, baseMasterScaleX, baseMasterScaleY }] of Object.entries(followers)) {
    // How much has the master scaled since tie-time?
    const sfx = baseMasterScaleX !== 0 ? ms.x / baseMasterScaleX : 1;
    const sfy = baseMasterScaleY !== 0 ? ms.y / baseMasterScaleY : 1;
    try {
      api.set(id, {
        'scale.x':    ms.x * ratioX,
        'scale.y':    ms.y * ratioY,
        // Stretch the tie-time offset by the same factor the master has grown
        'position.x': mp.x + offsetX * sfx,
        'position.y': mp.y + offsetY * sfy,
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
