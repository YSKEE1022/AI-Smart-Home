// ─────────────────────────────────────────────────────────────────────────────
//  3D scene – loads the Blender glTF export, resolves rooms / appliances,
//  handles picking, highlighting and smooth camera transitions.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { resolveRoomByName, resolveApplianceByName, roomFromPoint, APPLIANCE_TYPES, VIEW } from './mapping.js';

const ACCENT = new THREE.Color('#38bdf8');
const HOVER = new THREE.Color('#7dd3fc');
const ON_TINT = {
  Light: new THREE.Color('#ffd27a'),
  Television: new THREE.Color('#9ec5ff'),
  default: new THREE.Color('#b8f0d8'),
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class TwinScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onPick:Function,onHover:Function,onProgress:Function}} cb
   */
  constructor(canvas, cb) {
    this.canvas = canvas;
    this.cb = cb;
    this.rooms = new Map();       // roomId -> { objects:Set, box, center, size }
    this.appliances = new Map();  // applianceId -> { objects:Set, meshes:[], box, center, size, roomId, type }
    this.highlighted = null;
    this.hovered = null;
    this.tween = null;
    this._lastT = performance.now();
    this.spinners = [];           // { object, axis, speed, active }

    // Renderer -------------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Scene / camera -------------------------------------------------------
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    this.camera.position.set(0, 6, 14);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 60;
    this.controls.target.set(0, 2, 0);

    // Lights ---------------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3a3f4a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(8, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xbfd7ff, 0.6);
    fill.position.set(-10, 6, -6);
    this.scene.add(fill);

    // Picking --------------------------------------------------------------
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._pointerDown = null;
    canvas.addEventListener('pointerdown', (e) => { this._pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    canvas.addEventListener('pointerleave', () => this._setHover(null));

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  async load(url) {
    const loader = new GLTFLoader();
    const gltf = await new Promise((res, rej) =>
      loader.load(url, res, (ev) => this.cb.onProgress?.(ev.total ? ev.loaded / ev.total : 0), rej),
    );
    const root = gltf.scene;
    this.model = root;
    this.scene.add(root);

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.side = o.material.side ?? THREE.FrontSide;
          if (o.material.map) o.material.map.anisotropy = 8;
        }
      }
    });

    this._buildRegistry(root);
    this._fitToModel(root);
    this.cb.onLoaded?.({ rooms: [...this.rooms.keys()], appliances: [...this.appliances.keys()] });
    return gltf;
  }

  /** Walk the hierarchy and group objects by roomId / applianceId (from Blender custom properties or names). */
  _buildRegistry(root) {
    const assign = (obj, inherited) => {
      const ud = obj.userData || {};
      const applianceId = ud.applianceId ?? ud.appliance_id ?? inherited.applianceId ?? resolveApplianceByName(obj.name);
      const roomId = Number(ud.roomId ?? ud.room_id ?? inherited.roomId ?? resolveRoomByName(obj.name)) || null;
      const ctx = { applianceId: applianceId || null, roomId };

      if (ctx.roomId) {
        if (!this.rooms.has(ctx.roomId)) this.rooms.set(ctx.roomId, { objects: new Set(), meshes: [] });
        this.rooms.get(ctx.roomId).objects.add(obj);
        if (obj.isMesh) this.rooms.get(ctx.roomId).meshes.push(obj);
      }
      if (ctx.applianceId) {
        if (!this.appliances.has(ctx.applianceId))
          this.appliances.set(ctx.applianceId, { objects: new Set(), meshes: [], roomId: ctx.roomId, type: ud.applianceType || APPLIANCE_TYPES[ctx.applianceId] || null });
        const a = this.appliances.get(ctx.applianceId);
        a.objects.add(obj);
        if (obj.isMesh) a.meshes.push(obj);
        if (!a.roomId && ctx.roomId) a.roomId = ctx.roomId;
      }
      obj.applianceId = ctx.applianceId;
      obj.roomId = ctx.roomId;
      obj.children.forEach((c) => assign(c, ctx));
    };
    assign(root, {});

    const finish = (entry) => {
      const box = new THREE.Box3();
      entry.meshes.forEach((m) => box.expandByObject(m, true));
      if (box.isEmpty()) entry.objects.forEach((o) => box.expandByObject(o, true));
      entry.box = box;
      entry.center = box.getCenter(new THREE.Vector3());
      entry.size = box.getSize(new THREE.Vector3());
      entry.meshes.forEach((m) => {
        m.userData.__origMat = m.material;
      });
    };
    this.rooms.forEach(finish);
    this.appliances.forEach(finish);
    this._buildFanPivots();
  }

  /**
   * Fan blades are separate meshes whose origins sit on the blade itself, so
   * they must be re-parented to a pivot at the hub before they can spin.
   */
  _buildFanPivots() {
    this.appliances.forEach((a, id) => {
      const blades = a.meshes.filter((m) => /blade|rotor|propell/i.test(m.name));
      if (!blades.length) return;
      const hub = a.meshes.find((m) => !/blade|rotor|propell|canopy|downrod|rod/i.test(m.name)) || a.meshes[0];
      const hubBox = new THREE.Box3().setFromObject(hub);
      const pivot = new THREE.Object3D();
      pivot.name = `${id}_pivot`;
      pivot.position.copy(hubBox.getCenter(new THREE.Vector3()));
      pivot.applianceId = id;
      pivot.roomId = a.roomId;
      hub.parent.add(pivot);
      blades.forEach((b) => pivot.attach(b));
      a.objects.add(pivot);
      this.spinners.push({ object: pivot, axis: 'y', speed: 14, active: false, applianceId: id });
    });
  }

  _fitToModel(root) {
    const box = new THREE.Box3().setFromObject(root);
    this.modelBox = box;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.modelCenter = center;
    this.modelSize = size;

    // Shadow catcher just below the model.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(size.x, size.z) * 1.6, 64),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(center.x, box.min.y - 0.002, center.z);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const r = Math.max(size.x, size.y, size.z);
    this.sun.position.copy(center).add(new THREE.Vector3(r * 0.9, r * 1.4, r * 1.1));
    this.sun.target.position.copy(center);
    this.scene.add(this.sun.target);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.2;
    cam.right = cam.top = r * 1.2;
    cam.near = 0.1;
    cam.far = r * 6;
    cam.updateProjectionMatrix();

    this.controls.maxDistance = r * 4;
    this.focusHome(0);
  }

  // ── Camera framing ─────────────────────────────────────────────────────────
  /** Camera position that frames `box` from the house's open (front) side. */
  _frameBox(box, { dir = VIEW.frontDir, elevation = VIEW.elevation, padding = 1.25, minDist = 0.6 } = {}) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1;
    // Screen area not covered by the floating UI (left nav / right panel / top bar).
    const inset = this.insets || { left: 0, right: 0, top: 0, bottom: 0 };
    const availW = Math.max(200, W - inset.left - inset.right);
    const availH = Math.max(200, H - inset.top - inset.bottom);
    const tanV = Math.tan(fov / 2);
    const fitH = ((size.y / 2) / tanV) * (H / availH);
    const fitW = ((Math.max(size.x, size.z) / 2) / (tanV * this.camera.aspect)) * (W / availW);
    const dist = Math.max(minDist, Math.max(fitH, fitW) * padding + Math.min(size.x, size.z) * 0.2);
    const d = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const pos = center.clone().addScaledVector(d, dist);
    pos.y = center.y + dist * Math.tan(elevation);
    // Shift so the subject is centred in the *available* area rather than the full canvas.
    const worldPerPx = (2 * dist * tanV) / H;
    const right = new THREE.Vector3().crossVectors(pos.clone().sub(center).normalize(), new THREE.Vector3(0, 1, 0)).normalize().negate();
    const dx = ((inset.left - inset.right) / 2) * worldPerPx;   // + = move subject right on screen
    const dy = ((inset.bottom - inset.top) / 2) * worldPerPx;
    const shift = right.clone().multiplyScalar(-dx).add(new THREE.Vector3(0, -dy, 0));
    return { position: pos.add(shift), target: center.clone().add(shift) };
  }

  /** Tell the scene how much of the canvas is covered by UI (pixels). */
  setInsets(insets) { this.insets = { left: 0, right: 0, top: 0, bottom: 0, ...insets }; }

  focusHome(duration = 1.4) {
    const { position, target } = this._frameBox(this.modelBox, { padding: 1.05, elevation: VIEW.homeElevation });
    this.flyTo(position, target, duration);
    this.setHighlight(null);
  }

  focusRoom(roomId, duration = 1.3) {
    const r = this.rooms.get(Number(roomId));
    if (!r) return false;
    const { position, target } = this._frameBox(r.box, { padding: VIEW.roomPadding, elevation: VIEW.roomElevation });
    this.flyTo(position, target, duration);
    this.setHighlight(null);
    return true;
  }

  focusAppliance(applianceId, duration = 1.2) {
    const a = this.appliances.get(applianceId);
    if (!a) return false;
    const opts = { padding: VIEW.appliancePadding, elevation: VIEW.applianceElevation, minDist: VIEW.applianceMinDist };
    const override = VIEW.applianceOverrides?.[applianceId];
    if (override?.dir) opts.dir = new THREE.Vector3(...override.dir);
    if (override?.elevation != null) opts.elevation = override.elevation;
    if (override?.padding != null) opts.padding = override.padding;
    const { position, target } = this._frameBox(a.box, opts);
    this.flyTo(position, target, duration);
    this.setHighlight(applianceId);
    return true;
  }

  flyTo(position, target, duration = 1.2) {
    if (duration <= 0) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.tween = {
      p0: this.camera.position.clone(), p1: position.clone(),
      t0: this.controls.target.clone(), t1: target.clone(),
      start: performance.now(), duration: duration * 1000,
    };
    this.controls.enabled = false;
  }

  // ── Highlight / state visuals ──────────────────────────────────────────────
  setHighlight(applianceId) {
    if (this.highlighted === applianceId) return;
    this.highlighted = applianceId;
    this.appliances.forEach((a, id) => this._refreshMaterials(id));
  }

  _setHover(applianceId) {
    if (this.hovered === applianceId) return;
    const prev = this.hovered;
    this.hovered = applianceId;
    this.canvas.style.cursor = applianceId ? 'pointer' : '';
    if (prev) this._refreshMaterials(prev);
    if (applianceId) this._refreshMaterials(applianceId);
    this.cb.onHover?.(applianceId);
  }

  /** Called by the app whenever the database row for an appliance changes. */
  setApplianceState(applianceId, { on, type }) {
    const a = this.appliances.get(applianceId);
    if (!a) return;
    a.on = !!on;
    if (type) a.type = type;
    this.spinners.forEach((s) => { if (s.applianceId === applianceId) s.active = !!on; });
    this._refreshMaterials(applianceId);
  }

  _refreshMaterials(applianceId) {
    const a = this.appliances.get(applianceId);
    if (!a) return;
    const isHi = this.highlighted === applianceId;
    const isHover = this.hovered === applianceId && !isHi;
    a.meshes.forEach((m) => {
      const orig = m.userData.__origMat;
      if (!orig) return;
      if (!isHi && !isHover && !a.on) {
        m.material = orig;
        return;
      }
      if (!m.userData.__fxMat || m.userData.__fxMat.__from !== orig) {
        const mat = orig.clone();
        mat.__from = orig;
        m.userData.__fxMat = mat;
      }
      const mat = m.userData.__fxMat;
      if (isHi) {
        mat.emissive?.copy(ACCENT);
        mat.emissiveIntensity = 0.55;
      } else if (isHover) {
        mat.emissive?.copy(HOVER);
        mat.emissiveIntensity = 0.28;
      } else {
        mat.emissive?.copy(ON_TINT[a.type] || ON_TINT.default);
        mat.emissiveIntensity = a.type === 'Light' ? 0.9 : a.type === 'Television' ? 0.6 : 0.18;
      }
      m.material = mat;
    });
  }

  // ── Picking ────────────────────────────────────────────────────────────────
  _updatePointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  _pick() {
    if (!this.model) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.model, true);
    for (const h of hits) {
      let o = h.object;
      // skip fully transparent helper surfaces
      if (o.material?.transparent && o.material.opacity < 0.05) continue;
      while (o) {
        if (o.applianceId) return { type: 'appliance', id: o.applianceId, point: h.point };
        if (o.roomId) return { type: 'room', id: o.roomId, point: h.point };
        o = o.parent;
      }
      const byPoint = roomFromPoint(h.point);
      return byPoint ? { type: 'room', id: byPoint, point: h.point } : null;
    }
    return null;
  }

  _onPointerMove(e) {
    if (this._pointerDown) return;
    this._updatePointer(e);
    if (this._hoverRaf) return;
    this._hoverRaf = requestAnimationFrame(() => {
      this._hoverRaf = null;
      const hit = this._pick();
      this._setHover(hit?.type === 'appliance' ? hit.id : null);
    });
  }

  _onPointerUp(e) {
    const d = this._pointerDown;
    this._pointerDown = null;
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 6 || performance.now() - d.t > 600) return; // it was a drag
    this._updatePointer(e);
    const hit = this._pick();
    this.cb.onPick?.(hit);
  }

  // ── Projection helpers for HTML pins ───────────────────────────────────────
  project(v3) {
    const p = v3.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, visible: p.z < 1 };
  }

  anchorOf(kind, id) {
    const e = kind === 'room' ? this.rooms.get(Number(id)) : this.appliances.get(id);
    if (!e) return null;
    if (kind === 'room') return new THREE.Vector3(e.center.x, e.box.max.y - e.size.y * 0.12, e.center.z);
    return new THREE.Vector3(e.center.x, e.box.max.y, e.center.z);
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _frame() {
    const now = performance.now();
    const dt = Math.min((now - this._lastT) / 1000, 0.05);
    this._lastT = now;

    if (this.tween) {
      const k = Math.min(1, (now - this.tween.start) / this.tween.duration);
      const e = easeInOutCubic(k);
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, e);
      if (k >= 1) {
        this.tween = null;
        this.controls.enabled = true;
      }
    }
    this.controls.update();

    // pulse highlight
    if (this.highlighted) {
      const a = this.appliances.get(this.highlighted);
      const pulse = 0.45 + 0.3 * Math.sin(now / 260);
      a?.meshes.forEach((m) => { if (m.material?.__from) m.material.emissiveIntensity = pulse; });
    }
    for (const s of this.spinners) if (s.active) s.object.rotation[s.axis] += s.speed * dt;

    this.renderer.render(this.scene, this.camera);
    this.cb.onFrame?.();
  }
}
