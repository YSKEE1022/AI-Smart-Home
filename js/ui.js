// ─────────────────────────────────────────────────────────────────────────────
//  DOM rendering: top bar, room navigation, floating detail panel, 3D pins.
// ─────────────────────────────────────────────────────────────────────────────
import {
  state, roomLabel, applianceLabel, roomMetrics, homeMetrics, applianceWatts, applianceEnergy,
  fmt, ROOM_ICONS, TYPE_ICONS,
} from './store.js';
import { ALLOW_CONTROL } from './config.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const els = {
  topStats: $('#top-stats'),
  conn: $('#conn'),
  nav: $('#room-nav'),
  panel: $('#detail'),
  pins: $('#pins'),
  toasts: $('#toasts'),
  loader: $('#loader'),
  loaderBar: $('#loader-bar'),
  loaderText: $('#loader-text'),
  crumbs: $('#crumbs'),
};

// ── Top bar ──────────────────────────────────────────────────────────────────
export function renderTop() {
  const h = homeMetrics();
  els.topStats.innerHTML = `
    <div class="stat"><span class="stat-k">Live load</span><span class="stat-v">${fmt.w(h.watts)}</span></div>
    <div class="stat"><span class="stat-k">Energy today</span><span class="stat-v">${fmt.kwh(h.kwh)}</span></div>
    <div class="stat"><span class="stat-k">Est. cost today</span><span class="stat-v accent">${fmt.rm(h.cost)}</span></div>
    <div class="stat"><span class="stat-k">Active</span><span class="stat-v">${h.active}<span class="muted">/${h.total}</span></span></div>`;
  const map = {
    SUBSCRIBED: ['live', 'Live'],
    connecting: ['warn', 'Connecting…'],
    CHANNEL_ERROR: ['bad', 'Realtime error'],
    TIMED_OUT: ['bad', 'Timed out'],
    CLOSED: ['bad', 'Disconnected'],
    offline: ['bad', 'Offline'],
  };
  const [cls, label] = map[state.connection] || ['warn', state.connection];
  els.conn.className = `conn ${cls}`;
  els.conn.innerHTML = `<i></i>${label}`;
  if (state.lastUpdate) els.conn.title = `Last update ${state.lastUpdate.toLocaleTimeString()}`;
}

// ── Room navigation ──────────────────────────────────────────────────────────
export function renderNav(sel) {
  const activeRoom = sel?.type === 'room' ? sel.id : sel?.type === 'appliance' ? state.appliances.get(sel.id)?.RoomsID : null;
  const cards = [...state.rooms.values()].map((r) => {
    const m = roomMetrics(r.RoomsID);
    return `
      <button class="room-card ${activeRoom === r.RoomsID ? 'active' : ''}" data-room="${r.RoomsID}">
        <span class="room-ico">${ROOM_ICONS[r.roomName] || '🏠'}</span>
        <span class="room-body">
          <span class="room-name">${esc(roomLabel(r))}</span>
          <span class="room-meta">${fmt.temp(r.roomTemp)} · ${fmt.w(m.watts)}</span>
        </span>
        <span class="room-dots">${m.appliances.map((a) => `<i class="${a.ApplianceStatus ? 'on' : ''}" title="${esc(a.ApplianceType)}"></i>`).join('')}</span>
      </button>`;
  });
  els.nav.innerHTML = `
    <button class="room-card home ${!sel ? 'active' : ''}" data-home>
      <span class="room-ico">🏠</span>
      <span class="room-body"><span class="room-name">Whole house</span><span class="room-meta">Overview</span></span>
    </button>
    ${cards.join('')}`;
}

// ── Detail panel ─────────────────────────────────────────────────────────────
export function renderDetail(sel) {
  if (!sel) {
    els.panel.classList.remove('open');
    els.crumbs.innerHTML = `<span>Overview</span>`;
    return;
  }
  els.panel.classList.add('open');
  if (sel.type === 'room') renderRoomPanel(sel.id);
  else renderAppliancePanel(sel.id);
}

function renderRoomPanel(roomId) {
  const m = roomMetrics(roomId);
  const r = m.room;
  if (!r) return;
  els.crumbs.innerHTML = `<a href="#" data-home>Overview</a><span>›</span><span>${esc(roomLabel(r))}</span>`;
  els.panel.innerHTML = `
    <div class="panel-head">
      <div class="panel-ico">${ROOM_ICONS[r.roomName] || '🏠'}</div>
      <div>
        <div class="panel-sub">Room · ID ${r.RoomsID}</div>
        <h2>${esc(roomLabel(r))}</h2>
      </div>
      <button class="icon-btn" data-close title="Back to overview">✕</button>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="m-k">Room temperature</span><span class="m-v">${fmt.temp(r.roomTemp)}</span></div>
      <div class="metric"><span class="m-k">Occupancy</span><span class="m-v ${m.occupied ? 'ok' : 'muted'}">${m.occupied ? 'Occupied' : 'Vacant'}</span></div>
      <div class="metric"><span class="m-k">Electricity usage</span><span class="m-v">${fmt.w(m.watts)}</span><span class="m-note">${m.wattsFromDb ? 'from database' : 'sum of active appliances'}</span></div>
      <div class="metric"><span class="m-k">Electricity cost</span><span class="m-v accent">${fmt.rm(m.cost)}</span><span class="m-note">${m.costFromDb ? 'from database' : 'estimated / day'}</span></div>
    </div>
    <div class="section-title">Appliances <span class="muted">${m.active.length} of ${m.appliances.length} on</span></div>
    <div class="appl-list">
      ${m.appliances.map((a) => {
        const w = applianceWatts(a);
        return `<button class="appl-row" data-appliance="${esc(a.ApplianceID)}">
          <span class="appl-ico">${TYPE_ICONS[a.ApplianceType] || '🔌'}</span>
          <span class="appl-body"><span class="appl-name">${esc(a.ApplianceType)}</span><span class="appl-id">${esc(a.ApplianceID)}</span></span>
          <span class="appl-w">${fmt.w(w.live)}</span>
          <span class="status ${a.ApplianceStatus ? 'on' : 'off'}">${a.ApplianceStatus ? 'ON' : 'OFF'}</span>
        </button>`;
      }).join('') || '<div class="muted">No appliances in this room.</div>'}
    </div>`;
}

function renderAppliancePanel(id) {
  const a = state.appliances.get(id);
  if (!a) return;
  const room = state.rooms.get(a.RoomsID);
  const w = applianceWatts(a);
  const e = applianceEnergy(a);
  els.crumbs.innerHTML = `<a href="#" data-home>Overview</a><span>›</span><a href="#" data-room="${a.RoomsID}">${esc(roomLabel(room))}</a><span>›</span><span>${esc(a.ApplianceType)}</span>`;
  els.panel.innerHTML = `
    <div class="panel-head">
      <div class="panel-ico">${TYPE_ICONS[a.ApplianceType] || '🔌'}</div>
      <div>
        <div class="panel-sub">${esc(roomLabel(room))} · ID ${esc(a.ApplianceID)}</div>
        <h2>${esc(applianceLabel(a))}</h2>
      </div>
      <button class="icon-btn" data-room="${a.RoomsID}" title="Back to room">↩</button>
    </div>
    <div class="status-row">
      <span class="status big ${a.ApplianceStatus ? 'on' : 'off'}"><i></i>${a.ApplianceStatus ? 'ON' : 'OFF'}</span>
      ${ALLOW_CONTROL ? `<label class="switch"><input type="checkbox" data-toggle="${esc(a.ApplianceID)}" ${a.ApplianceStatus ? 'checked' : ''}><span></span></label>` : ''}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="m-k">Power consumption</span><span class="m-v">${fmt.w(w.live)}</span><span class="m-note">rated ${fmt.w(w.rated)}${w.fromDb ? '' : ' (typical)'}</span></div>
      <div class="metric"><span class="m-k">Energy usage</span><span class="m-v">${fmt.kwh(e.kwh)}</span><span class="m-note">${e.kwhFromDb ? 'from database' : `est. ${e.hours} h/day`}</span></div>
      <div class="metric"><span class="m-k">Electricity cost</span><span class="m-v accent">${fmt.rm(e.cost)}</span><span class="m-note">${e.costFromDb ? 'from database' : 'estimated / day'}</span></div>
      <div class="metric"><span class="m-k">Room temperature</span><span class="m-v">${fmt.temp(room?.roomTemp)}</span></div>
    </div>
    <div class="section-title">Live record</div>
    <div class="kv">
      <span>ApplianceID</span><b>${esc(a.ApplianceID)}</b>
      <span>ApplianceType</span><b>${esc(a.ApplianceType ?? '—')}</b>
      <span>RoomsID</span><b>${esc(a.RoomsID ?? '—')}</b>
      <span>ApplianceStatus</span><b>${a.ApplianceStatus ? 'true' : 'false'}</b>
      <span>electricityUsage(Watt)</span><b>${a['electricityUsage(Watt)'] ?? 'null'}</b>
      <span>energyUsage(kWh)</span><b>${a['energyUsage(kWh)'] ?? 'null'}</b>
      <span>electricityCost(RM)</span><b>${a['electricityCost(RM)'] ?? 'null'}</b>
    </div>`;
}

// ── 3D pins (floating labels) ────────────────────────────────────────────────
const pinEls = new Map();
export function updatePins(scene, sel) {
  const wanted = [];
  if (!sel) {
    state.rooms.forEach((r) => wanted.push({ kind: 'room', id: r.RoomsID }));
  } else if (sel.type === 'room') {
    roomMetrics(sel.id).appliances.forEach((a) => wanted.push({ kind: 'appliance', id: a.ApplianceID }));
  } else {
    wanted.push({ kind: 'appliance', id: sel.id });
  }
  const keep = new Set();
  for (const w of wanted) {
    const key = `${w.kind}:${w.id}`;
    keep.add(key);
    const anchor = scene.anchorOf(w.kind, w.id);
    if (!anchor) continue;
    let el = pinEls.get(key);
    if (!el) {
      el = document.createElement('button');
      el.className = `pin ${w.kind}`;
      el.dataset[w.kind] = w.id;
      els.pins.appendChild(el);
      pinEls.set(key, el);
    }
    const p = scene.project(anchor);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    el.style.display = p.visible ? '' : 'none';
    if (w.kind === 'room') {
      const r = state.rooms.get(w.id);
      const m = roomMetrics(w.id);
      el.innerHTML = `<span class="pin-ico">${ROOM_ICONS[r.roomName] || '🏠'}</span><span class="pin-txt"><b>${esc(roomLabel(r))}</b><small>${fmt.temp(r.roomTemp)} · ${fmt.w(m.watts)}</small></span>`;
    } else {
      const a = state.appliances.get(w.id);
      if (!a) continue;
      el.classList.toggle('on', !!a.ApplianceStatus);
      el.classList.toggle('focus', sel?.type === 'appliance' && sel.id === w.id);
      el.innerHTML = `<i></i><span class="pin-txt"><b>${esc(a.ApplianceType)}</b><small>${a.ApplianceStatus ? fmt.w(applianceWatts(a).live) : 'off'}</small></span>`;
    }
  }
  for (const [key, el] of pinEls) if (!keep.has(key)) { el.remove(); pinEls.delete(key); }
}

// ── Toasts ───────────────────────────────────────────────────────────────────
export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = msg;
  els.toasts.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3800);
}

export function setLoading(progress, text) {
  if (progress == null) { els.loader.classList.add('hide'); return; }
  els.loaderBar.style.width = `${Math.round(progress * 100)}%`;
  if (text) els.loaderText.textContent = text;
}
