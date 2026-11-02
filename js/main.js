// ─────────────────────────────────────────────────────────────────────────────
//  App bootstrap: load model + data, wire realtime, route clicks.
// ─────────────────────────────────────────────────────────────────────────────
import { TwinScene } from './scene.js';
import { fetchAll, subscribeRealtime, setApplianceStatus } from './supabase.js';
import { state, hydrate, applyChange, setConnection, onChange, roomLabel, applianceLabel } from './store.js';
import { renderTop, renderNav, renderDetail, updatePins, toast, setLoading, els } from './ui.js';
import { MODEL_URL } from './config.js';

let selection = null; // null | {type:'room', id} | {type:'appliance', id}

const scene = new TwinScene(document.getElementById('view'), {
  onProgress: (p) => setLoading(0.1 + p * 0.7, 'Loading 3D model…'),
  onPick: (hit) => {
    if (!hit) return;
    if (hit.type === 'appliance') select({ type: 'appliance', id: hit.id });
    else if (hit.type === 'room' && selection?.type !== 'room' && !(selection?.type === 'appliance')) select({ type: 'room', id: hit.id });
    else if (hit.type === 'room' && selection?.type === 'appliance') select({ type: 'room', id: hit.id });
  },
  onFrame: () => updatePins(scene, selection),
});

function uiInsets(sel) {
  const W = window.innerWidth, H = window.innerHeight;
  if (W <= 860) return { left: 0, right: 0, top: 130, bottom: sel ? H * 0.46 + 130 : 150 };
  return { left: 282, right: sel ? 392 : 16, top: 92, bottom: 56 };
}

function select(sel) {
  selection = sel;
  scene.setInsets(uiInsets(sel));
  if (!sel) scene.focusHome();
  else if (sel.type === 'room') scene.focusRoom(sel.id);
  else scene.focusAppliance(sel.id);
  renderNav(selection);
  renderDetail(selection);
  history.replaceState(null, '', sel ? `#${sel.type}/${sel.id}` : '#');
}

function syncSceneStates() {
  state.appliances.forEach((a) => scene.setApplianceState(a.ApplianceID, { on: a.ApplianceStatus, type: a.ApplianceType }));
}

// Re-render UI whenever the store changes.
onChange((evt) => {
  renderTop();
  renderNav(selection);
  renderDetail(selection);
  if (evt.kind === 'change' && evt.table === 'Appliance' && evt.record) {
    scene.setApplianceState(evt.record.ApplianceID, { on: evt.record.ApplianceStatus, type: evt.record.ApplianceType });
    if (evt.old && evt.old.ApplianceStatus !== undefined && evt.old.ApplianceStatus !== evt.record.ApplianceStatus) {
      toast(`${applianceLabel(evt.record)} turned <b>${evt.record.ApplianceStatus ? 'ON' : 'OFF'}</b>`, evt.record.ApplianceStatus ? 'ok' : '');
    } else if (evt.type === 'UPDATE') {
      toast(`${applianceLabel(evt.record)} updated`);
    }
  } else if (evt.kind === 'change' && evt.table === 'Rooms' && evt.record) {
    toast(`${roomLabel(evt.record)} updated · ${Number(evt.record.roomTemp).toFixed(1)} °C`);
  } else if (evt.kind === 'hydrate') {
    syncSceneStates();
  }
});

// ── Click routing for HTML controls (nav, panel, pins, breadcrumbs) ─────────
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-home],[data-room],[data-appliance],[data-close]');
  if (!t) return;
  e.preventDefault();
  if (t.hasAttribute('data-home') || t.hasAttribute('data-close')) select(null);
  else if (t.dataset.appliance) select({ type: 'appliance', id: t.dataset.appliance });
  else if (t.dataset.room) select({ type: 'room', id: Number(t.dataset.room) });
});

document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-toggle]');
  if (!t) return;
  const id = t.dataset.toggle;
  t.disabled = true;
  try {
    await setApplianceStatus(id, t.checked);
  } catch (err) {
    toast(`Could not update ${id}: ${err.message}`, 'bad');
    t.checked = !t.checked;
  } finally {
    t.disabled = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (selection?.type === 'appliance') select({ type: 'room', id: state.appliances.get(selection.id)?.RoomsID });
    else select(null);
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  setLoading(0.05, 'Connecting to Supabase…');
  renderTop();
  try {
    const data = await fetchAll();
    hydrate(data);
  } catch (err) {
    console.error(err);
    toast(`Supabase error: ${err.message}`, 'bad');
    setConnection('offline');
  }

  scene.setInsets(uiInsets(null));
  try {
    await scene.load(MODEL_URL);
  } catch (err) {
    console.error(err);
    setLoading(1, `Could not load ${MODEL_URL}`);
    els.loaderText.style.color = '#fda4af';
    return;
  }
  syncSceneStates();

  // Report which database records have no 3D object (helps when re-exporting).
  const missing = [...state.appliances.keys()].filter((id) => !scene.appliances.has(id));
  if (missing.length) console.warn('Appliances without a 3D object:', missing);

  setLoading(0.95, 'Starting realtime…');
  subscribeRealtime(applyChange, (status, err) => {
    setConnection(status);
    if (err) console.error('Realtime:', err);
  });

  setLoading(null);
  renderNav(selection);
  renderDetail(selection);

  // Deep link support: #room/3 or #appliance/aircon02
  const m = location.hash.match(/^#(room|appliance)\/(.+)$/);
  if (m) setTimeout(() => select({ type: m[1], id: m[1] === 'room' ? Number(m[2]) : m[2] }), 400);
})();

window.__twin = { scene, state, select };
