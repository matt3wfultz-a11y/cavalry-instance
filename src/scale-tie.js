// Shape Size Tie
//
// Ties layers to a master shape so their positions track proportionally
// as the shape's width and height change. Only positions are updated —
// follower scales are never touched, so text stays crisp.
//
// When the master grows wider, followers move outward horizontally by the
// same ratio. When it gets taller, they move vertically. Moving the master
// drags all followers with it.
//
// Usage:
//   1. Select the master shape and click "Set Selected as Master"
//   2. Select the layers to tie and click "Tie to Master"
//   3. Resize the master (width/height) — followers reposition proportionally
//   4. To free a layer, select it and click "Untie Selected"
//   5. "Clear All" removes the master and all ties

// ─── Size attribute detection ─────────────────────────────────────────────────
// Different shape types expose different attribute names for their dimensions.

function hasAttr(layerId, attr) {
  try { return api.hasAttribute(layerId, attr); } catch (_) { return false; }
}

function detectSizeAttrs(layerId) {
  const pairs = [
    { w: 'width',    h: 'height'   },
    { w: 'size.x',  h: 'size.y'   },
    { w: 'xRadius', h: 'yRadius'  },
    { w: 'scaleX',  h: 'scaleY'   },
  ];
  for (const { w, h } of pairs) {
    if (hasAttr(layerId, w) && hasAttr(layerId, h)) return { wAttr: w, hAttr: h };
  }
  // Single-axis shapes (circles, regular polygons)
  for (const attr of ['radius', 'xRadius', 'size']) {
    if (hasAttr(layerId, attr)) return { wAttr: attr, hAttr: attr };
  }
  return null;
}

function logAttrs(layerId) {
  const name = layerName(layerId);
  const type = api.getLayerType(layerId);
  const attrs = api.getAttributes(layerId);
  console.log(`\n=== "${name}" (${type}) — ${attrs.length} attrs ===`);
  for (const a of attrs) {
    try { console.log(`  ${a}: ${JSON.stringify(api.get(layerId, a))}`); }
    catch (_) { console.log(`  ${a}: (unreadable)`); }
  }
  console.log('===\n');
}

// ─── State ────────────────────────────────────────────────────────────────────

let masterId = null;
let masterSizeAttrs = null; // { wAttr, hAttr }

// Last observed master state — bail-out guard to prevent cascade loops
let lastMaster = { w: 0, h: 0, posX: 0, posY: 0 };

// { followerId: { offsetX, offsetY, baseMasterW, baseMasterH } }
//   offsetX/Y     = follower_pos - master_pos at tie-time (world space)
//   baseMasterW/H = master size at tie-time (reference for computing change ratio)
const followers = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMasterSize() {
  if (!masterSizeAttrs) return null;
  if (!hasAttr(masterId, masterSizeAttrs.wAttr)) return null;
  try {
    return {
      w: api.get(masterId, masterSizeAttrs.wAttr) ?? 0,
      h: api.get(masterId, masterSizeAttrs.hAttr) ?? 0,
    };
  } catch (_) { return null; }
}

function getPosition(layerId) {
  try {
    return {
      x: api.get(layerId, 'position.x') ?? 0,
      y: api.get(layerId, 'position.y') ?? 0,
    };
  } catch (_) { return { x: 0, y: 0 }; }
}

function layerName(id) {
  try { return api.getNiceName(id) || id; } catch (_) { return id; }
}

function refreshLabels() {
  const name = masterId ? layerName(masterId) : '(none)';
  const sizeInfo = masterSizeAttrs ? ` [${masterSizeAttrs.wAttr} / ${masterSizeAttrs.hAttr}]` : '';
  masterLabel.setText(`Master: ${name}${sizeInfo}`);
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
  masterSizeAttrs = detectSizeAttrs(masterId);
  if (!masterSizeAttrs) {
    console.log(`WARNING: "${layerName(masterId)}" has no detectable width/height attributes.`);
    console.log('Tip: select the shape and click "Log Attrs of Selected" to see available attributes.');
    masterId = null;
    return;
  }
  const sz = getMasterSize();
  const mp = getPosition(masterId);
  lastMaster = { w: sz.w, h: sz.h, posX: mp.x, posY: mp.y };
  console.log(
    `Master: "${layerName(masterId)}" ` +
    `(${masterSizeAttrs.wAttr}: ${sz.w}, ${masterSizeAttrs.hAttr}: ${sz.h} | ` +
    `pos ${mp.x}, ${mp.y})`
  );
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
  const sz = getMasterSize();
  const mp = getPosition(masterId);
  let count = 0;
  for (const id of sel) {
    if (id === masterId) continue;
    const fp = getPosition(id);
    followers[id] = {
      offsetX: fp.x - mp.x,
      offsetY: fp.y - mp.y,
      baseMasterW: sz.w,
      baseMasterH: sz.h,
    };
    console.log(
      `Tied "${layerName(id)}" ` +
      `(offset ${followers[id].offsetX.toFixed(1)}, ${followers[id].offsetY.toFixed(1)})`
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
  masterSizeAttrs = null;
  lastMaster = { w: 0, h: 0, posX: 0, posY: 0 };
  console.log(`Cleared master and ${n} tied layer(s).`);
  refreshLabels();
}

// ─── Reactive update ──────────────────────────────────────────────────────────
// onAttrChanged fires for every attribute edit in the comp.
// Bail early if neither size nor position has changed on the master,
// which prevents follower position writes from feeding back into this handler.

function onAttrChanged() {
  if (!masterId || !masterSizeAttrs || !Object.keys(followers).length) return;

  const sz = getMasterSize();
  const mp = getPosition(masterId);
  if (!sz) return;

  if (
    sz.w  === lastMaster.w    && sz.h  === lastMaster.h &&
    mp.x  === lastMaster.posX && mp.y  === lastMaster.posY
  ) return;

  lastMaster = { w: sz.w, h: sz.h, posX: mp.x, posY: mp.y };

  for (const [id, { offsetX, offsetY, baseMasterW, baseMasterH }] of Object.entries(followers)) {
    // How much has the master grown since tie-time?
    const sfx = baseMasterW !== 0 ? sz.w / baseMasterW : 1;
    const sfy = baseMasterH !== 0 ? sz.h / baseMasterH : 1;
    try {
      api.set(id, {
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

const debugBtn = new ui.Button('Log Attrs of Selected');
debugBtn.onClick = function () {
  const sel = api.getSelection();
  if (!sel || !sel.length) { console.log('WARNING: select a layer to inspect.'); return; }
  logAttrs(sel[0]);
};

const root = new ui.VLayout();
root.setMargins(10, 10, 10, 10);
root.setSpaceBetween(8);
root.add(masterLabel, tiedLabel, setMasterBtn, tieBtn, untieBtn, clearBtn, debugBtn);

ui.addCallbackObject({ onAttrChanged });

ui.setTitle('Shape Size Tie');
ui.setMinimumWidth(260);
ui.add(root);
ui.show();
