import * as pc from 'playcanvas';
import { CarDamageRig } from './damage';
import { HdrEnvironmentController, TimeOfDay } from './hdrEnv';

export type { TimeOfDay };

export interface WorldBoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface StuntRamp {
  x: number;
  z: number;
  yawDeg: number; // launch direction (0 = -Z, -90 = -X)
  width: number;
  length: number;
  height: number;
}

export interface TrafficWheelRef {
  steerPivot: pc.Entity;
  spinPivot: pc.Entity;
  isFront: boolean;
  radius: number;
}

export interface TrafficAgent {
  entity: pc.Entity;
  wheels: TrafficWheelRef[];
  damageRig: CarDamageRig | null;
  carWidth: number;
  carLength: number;
  baseSpeed: number;
  curSpeed: number;
  phase: number;
  route: Array<{ x: number; z: number }>;
  segLengths: number[];
  totalLen: number;
  spinDeg: number;
  steerDeg: number;
  yaw: number;
  x: number;
  z: number;
  // Physical crash displacement & recovery state
  offsetX: number;
  offsetZ: number;
  knockVx: number;
  knockVz: number;
  knockYaw: number;
  knockYawVel: number;
  stunTimer: number;
}

interface SwayItem {
  node: pc.Entity;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  ampDeg: number;
  speed: number;
}

export interface OpenWorldHandle {
  root: pc.Entity;
  hdrEnv: HdrEnvironmentController;
  colliders: WorldBoxCollider[];
  ramps: StuntRamp[];
  trafficAgents: TrafficAgent[];
  worldRadius: number;
  tashkentCenter: { x: number; z: number };
  registonCenter: { x: number; z: number };
  getTerrainHeight: (x: number, z: number) => number;
  getWaterProximity: (x: number, z: number) => number;
  getNearestTrafficProximity: (x: number, z: number) => number;
  setTimeOfDay: (mode: TimeOfDay, camera?: pc.CameraComponent | null) => void;
  update: (
    dt: number,
    elapsedSec: number,
    playerPos: pc.Vec3,
    pedestrians?: Array<{ x: number; z: number }>
  ) => void;
  applyTrafficCrash: (
    agent: TrafficAgent,
    impulseVx: number,
    impulseVz: number,
    worldHitPoint: pc.Vec3,
    worldHitDir: pc.Vec3,
    intensity: number
  ) => void;
  loadCampusAssets: (
    tashkentUrl?: string | null,
    registonUrl?: string | null,
    onProgress?: (label: string, pct: number) => void
  ) => Promise<void>;
  loadTashkentGlbUrl: (url: string, name?: string) => Promise<boolean>;
  loadTashkentGlbFile: (file: File) => Promise<boolean>;
  loadRegistonGlbUrl: (url: string, name?: string) => Promise<boolean>;
  loadRegistonGlbFile: (file: File) => Promise<boolean>;
  isCustomTashkentLoaded: () => boolean;
  isCustomRegistonLoaded: () => boolean;
  registerTrafficCar: (
    entity: pc.Entity,
    wheels: TrafficWheelRef[],
    routeIndex: number,
    phase: number,
    speed: number,
    opts?: { damageRig?: CarDamageRig | null; carWidth?: number; carLength?: number }
  ) => void;
}

// ============================================================================
// Crisp Procedural PBR Surface Textures (Asphalt, Plaza Pavers, Grass, Water)
// ============================================================================
function makeCanvasTexture(
  device: pc.GraphicsDevice,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat = true
): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const tex = new pc.Texture(device, {
    width,
    height,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: Math.min(8, device.maxAnisotropy || 4),
    addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    srgb: true,
  });
  tex.setSource(canvas);
  return tex;
}

function createAsphaltMaterial(device: pc.GraphicsDevice, withBikeLane: boolean): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, 512, (ctx, s) => {
    ctx.fillStyle = '#2d323a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4200; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 19341.123) % 1;
      const v = 36 + (i % 24);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(Math.abs(x) * s, Math.abs(y) * s, 2, 2);
    }
    ctx.fillStyle = 'rgba(18, 22, 28, 0.24)';
    ctx.fillRect(s * 0.24, 0, s * 0.16, s);
    ctx.fillRect(s * 0.6, 0, s * 0.16, s);

    ctx.fillStyle = '#e8edf4';
    ctx.fillRect(s * 0.04, 0, 5, s);
    ctx.fillRect(s * 0.96 - 5, 0, 5, s);

    if (withBikeLane) {
      ctx.fillStyle = 'rgba(42, 148, 86, 0.72)';
      ctx.fillRect(s * 0.055, 0, s * 0.065, s);
      ctx.fillRect(s * 0.88, 0, s * 0.065, s);
      ctx.fillStyle = '#edf2f7';
      ctx.fillRect(s * 0.125, 0, 3, s);
      ctx.fillRect(s * 0.875 - 3, 0, 3, s);
    }

    ctx.fillStyle = '#f2c138';
    for (let y = 18; y < s; y += 84) {
      ctx.fillRect(s * 0.5 - 6, y, 4, 48);
      ctx.fillRect(s * 0.5 + 2, y, 4, 48);
    }
  });

  const m = new pc.StandardMaterial();
  m.diffuseMap = tex;
  m.useMetalness = true;
  m.metalness = 0.04;
  m.gloss = 0.28;
  m.update();
  return m;
}

function createGrassMaterial(device: pc.GraphicsDevice): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, 512, (ctx, s) => {
    ctx.fillStyle = '#4c7840';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6500; i++) {
      const x = Math.abs((Math.sin(i * 19.19) * 31415.9) % 1) * s;
      const y = Math.abs((Math.cos(i * 41.37) * 27182.8) % 1) * s;
      const g = 102 + (i % 34);
      ctx.fillStyle = `rgb(${Math.round(g * 0.64)},${g},${Math.round(g * 0.50)})`;
      ctx.fillRect(x, y, 3, 3);
    }
  });
  const m = new pc.StandardMaterial();
  m.diffuseMap = tex;
  m.diffuseMapTiling = new pc.Vec2(90, 90);
  m.useMetalness = true;
  m.metalness = 0.0;
  m.gloss = 0.12;
  m.update();
  return m;
}

function createPaverMaterial(device: pc.GraphicsDevice, tileX: number, tileY: number): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, 512, (ctx, s) => {
    ctx.fillStyle = '#cbc3b4';
    ctx.fillRect(0, 0, s, s);
    const step = 64;
    for (let y = 0; y < s; y += step) {
      const offset = (y / step) % 2 === 0 ? 0 : step * 0.5;
      for (let x = -step; x < s + step; x += step) {
        const shade = 194 + (((x * 7 + y * 13) & 31) - 15);
        ctx.fillStyle = `rgb(${shade + 8},${shade + 2},${shade - 10})`;
        ctx.fillRect(x + offset + 2, y + 2, step - 4, step - 4);
      }
    }
  });
  const m = new pc.StandardMaterial();
  m.diffuseMap = tex;
  m.diffuseMapTiling = new pc.Vec2(tileX, tileY);
  m.useMetalness = true;
  m.metalness = 0.06;
  m.gloss = 0.34;
  m.update();
  return m;
}

function createAnimatedWaterMaterial(device: pc.GraphicsDevice, tileX: number, tileY: number): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, 512, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#0d5e82');
    grad.addColorStop(0.5, '#1277a0');
    grad.addColorStop(1, '#0b5678');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Shimmering water caustics & gentle river current ripples
    for (let i = 0; i < 160; i++) {
      const x = Math.abs((Math.sin(i * 37.1) * 18371.7) % 1) * s;
      const y = Math.abs((Math.cos(i * 91.3) * 29481.3) % 1) * s;
      const rw = 26 + (i % 48);
      const rh = 4 + (i % 6);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(185, 240, 255, 0.22)' : 'rgba(110, 215, 245, 0.16)';
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 65; i++) {
      const x = Math.abs((Math.sin(i * 73.7) * 41231.1) % 1) * s;
      const y = Math.abs((Math.cos(i * 19.7) * 15912.9) % 1) * s;
      ctx.strokeStyle = 'rgba(220, 250, 255, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10 + (i % 18), 0, Math.PI * 1.4);
      ctx.stroke();
    }
  });

  const m = new pc.StandardMaterial();
  m.diffuseMap = tex;
  m.diffuseMapTiling = new pc.Vec2(tileX, tileY);
  m.diffuse.set(0.88, 0.96, 1.0);
  m.emissive.set(0.04, 0.16, 0.24);
  m.emissiveIntensity = 0.35;
  m.useMetalness = true;
  m.metalness = 0.22;
  m.gloss = 0.94;
  m.update();
  return m;
}

// ============================================================================
// Upright Illuminated Roadside Monument Signs ("SAMARQAND 2027" & "ABDURAZOKHOV")
// ============================================================================
function buildStandingLandmarkSign(
  device: pc.GraphicsDevice,
  opts: {
    name: string;
    title: string;
    subtitle: string;
    accentHex: string;
    bgTop: string;
    bgBot: string;
    width: number;
    height: number;
  }
): pc.Entity {
  const root = new pc.Entity(opts.name);

  const tex = makeCanvasTexture(
    device,
    1024,
    384,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, opts.bgTop);
      g.addColorStop(1, opts.bgBot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Decorative Samarkand / modern architectural gold border
      ctx.strokeStyle = opts.accentHex;
      ctx.lineWidth = 14;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      ctx.strokeRect(32, 32, w - 64, h - 64);

      // Top subtitle
      ctx.fillStyle = opts.accentHex;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 42px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(opts.subtitle.toUpperCase(), w * 0.5, h * 0.27);

      // Bold primary monument title (auto-fitted cleanly)
      let fontSize = 112;
      ctx.font = `900 ${fontSize}px "Arial Black", "Inter", system-ui, sans-serif`;
      while (fontSize > 58 && ctx.measureText(opts.title).width > w - 110) {
        fontSize -= 4;
        ctx.font = `900 ${fontSize}px "Arial Black", "Inter", system-ui, sans-serif`;
      }
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(opts.title, w * 0.5, h * 0.63);
      ctx.shadowBlur = 0;

      // Subtle glowing bottom accent stripe
      ctx.fillStyle = opts.accentHex;
      ctx.fillRect(w * 0.28, h * 0.84, w * 0.44, 7);
    },
    false
  );

  const faceMat = new pc.StandardMaterial();
  faceMat.diffuse.set(1, 1, 1);
  faceMat.diffuseMap = tex;
  faceMat.emissive.set(1, 1, 1);
  faceMat.emissiveMap = tex;
  faceMat.emissiveIntensity = 0.52;
  faceMat.useMetalness = true;
  faceMat.metalness = 0.15;
  faceMat.gloss = 0.65;
  faceMat.update();

  const frameMat = new pc.StandardMaterial();
  frameMat.diffuse.set(0.11, 0.14, 0.20);
  frameMat.useMetalness = true;
  frameMat.metalness = 0.65;
  frameMat.gloss = 0.72;
  frameMat.update();

  const goldMat = new pc.StandardMaterial();
  goldMat.diffuse.set(0.92, 0.75, 0.34);
  goldMat.useMetalness = true;
  goldMat.metalness = 0.82;
  goldMat.gloss = 0.82;
  goldMat.update();

  const postH = opts.height * 0.42;
  const boardCenterY = postH + opts.height * 0.5;

  // Two sleek upright steel columns
  for (const side of [-1, 1]) {
    const col = new pc.Entity(`${opts.name}_Post_${side}`);
    col.setLocalPosition(side * (opts.width * 0.38), postH * 0.5, 0);
    col.setLocalScale(0.28, postH + 0.4, 0.28);
    col.addComponent('render', { type: 'cylinder', material: frameMat, castShadows: true, receiveShadows: true });
    root.addChild(col);

    const baseCollar = new pc.Entity(`${opts.name}_Base_${side}`);
    baseCollar.setLocalPosition(side * (opts.width * 0.38), 0.12, 0);
    baseCollar.setLocalScale(0.56, 0.24, 0.56);
    baseCollar.addComponent('render', { type: 'cylinder', material: goldMat, castShadows: true, receiveShadows: true });
    root.addChild(baseCollar);
  }

  // Main architectural signboard cabinet
  const board = new pc.Entity(`${opts.name}_Board`);
  board.setLocalPosition(0, boardCenterY, 0);
  board.setLocalScale(opts.width + 0.22, opts.height + 0.18, 0.32);
  board.addComponent('render', { type: 'box', material: frameMat, castShadows: true, receiveShadows: true });
  root.addChild(board);

  // Gold top cap trim
  const trim = new pc.Entity(`${opts.name}_TopTrim`);
  trim.setLocalPosition(0, boardCenterY + opts.height * 0.5 + 0.12, 0);
  trim.setLocalScale(opts.width + 0.34, 0.1, 0.38);
  trim.addComponent('render', { type: 'box', material: goldMat, castShadows: false });
  root.addChild(trim);

  // Front crisp readable face (+Z)
  const faceFront = new pc.Entity(`${opts.name}_FaceFront`);
  faceFront.setLocalPosition(0, boardCenterY, 0.17);
  faceFront.setLocalEulerAngles(90, 0, 0);
  faceFront.setLocalScale(opts.width, 1, opts.height);
  faceFront.addComponent('render', { type: 'plane', material: faceMat, castShadows: false, receiveShadows: false });
  root.addChild(faceFront);

  // Back crisp readable face (-Z) so readable from both sides of the boulevard!
  const faceBack = new pc.Entity(`${opts.name}_FaceBack`);
  faceBack.setLocalPosition(0, boardCenterY, -0.17);
  faceBack.setLocalEulerAngles(-90, 180, 0);
  faceBack.setLocalScale(opts.width, 1, opts.height);
  faceBack.addComponent('render', { type: 'plane', material: faceMat, castShadows: false, receiveShadows: false });
  root.addChild(faceBack);

  return root;
}

// ============================================================================
// Architectural Tashkent TV Tower Stand-in (Clean flat base — ZERO stones!)
// Replaced automatically when models/tashkent.glb is loaded!
// ============================================================================
function buildArchitecturalTashkentTower(): pc.Entity {
  const tower = new pc.Entity('TashkentTower_Architectural');

  const mkMat = (
    r: number,
    g: number,
    b: number,
    metal: number,
    gloss: number,
    emissive?: [number, number, number],
    emissiveInt = 1.2
  ) => {
    const m = new pc.StandardMaterial();
    m.diffuse.set(r, g, b);
    m.useMetalness = true;
    m.metalness = metal;
    m.gloss = gloss;
    if (emissive) {
      m.emissive.set(emissive[0], emissive[1], emissive[2]);
      m.emissiveIntensity = emissiveInt;
    }
    m.update();
    return m;
  };

  const steelWhite = mkMat(0.88, 0.90, 0.94, 0.45, 0.62);
  const steelSilver = mkMat(0.74, 0.78, 0.84, 0.72, 0.76);
  const glassBlue = mkMat(0.14, 0.36, 0.56, 0.35, 0.95, [0.16, 0.45, 0.78], 0.35);
  const goldAccent = mkMat(0.94, 0.78, 0.36, 0.85, 0.84, [1.0, 0.76, 0.28], 0.55);
  const beaconRed = mkMat(1.0, 0.16, 0.12, 0.1, 0.8, [1.0, 0.18, 0.14], 2.8);

  const addCyl = (
    name: string,
    pos: [number, number, number],
    sx: number,
    sy: number,
    sz: number,
    mat: pc.Material,
    rot?: [number, number, number]
  ) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(sx, sy, sz);
    if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    e.addComponent('render', { type: 'cylinder', material: mat, castShadows: true, receiveShadows: true });
    tower.addChild(e);
    return e;
  };

  addCyl('Tower_Foyer_Glass', [0, 2.2, 0], 9.2, 4.4, 9.2, glassBlue);
  addCyl('Tower_Foyer_Crown', [0, 4.5, 0], 10.2, 0.65, 10.2, steelWhite);
  addCyl('Tower_Core_Lower', [0, 18.5, 0], 4.2, 28.0, 4.2, steelWhite);
  addCyl('Tower_Core_Upper', [0, 42.0, 0], 3.1, 22.0, 3.1, steelWhite);

  for (let i = 0; i < 3; i++) {
    const armHolder = new pc.Entity(`TripodLeg_${i}`);
    armHolder.setLocalEulerAngles(0, i * 120, 0);
    tower.addChild(armHolder);

    const leg = new pc.Entity(`LegShaft_${i}`);
    leg.setLocalPosition(0, 13.8, 6.0);
    leg.setLocalEulerAngles(-15.5, 0, 0);
    leg.setLocalScale(1.75, 29.0, 1.4);
    leg.addComponent('render', { type: 'cylinder', material: steelSilver, castShadows: true, receiveShadows: true });
    armHolder.addChild(leg);

    const rib = new pc.Entity(`LegRib_${i}`);
    rib.setLocalPosition(0, 10.0, 4.2);
    rib.setLocalEulerAngles(-24, 0, 0);
    rib.setLocalScale(0.55, 17.0, 1.7);
    rib.addComponent('render', { type: 'cylinder', material: steelWhite, castShadows: true });
    armHolder.addChild(rib);
  }

  addCyl('Pod_Underside', [0, 26.5, 0], 8.6, 1.6, 8.6, steelSilver);
  addCyl('Pod_GoldRing_Lower', [0, 27.7, 0], 10.8, 0.55, 10.8, goldAccent);
  addCyl('Pod_ObservationGlass', [0, 30.1, 0], 11.4, 4.1, 11.4, glassBlue);
  addCyl('Pod_MidCollar', [0, 32.4, 0], 11.8, 0.7, 11.8, steelWhite);
  addCyl('Pod_RestaurantGlass', [0, 34.4, 0], 10.2, 3.3, 10.2, glassBlue);
  addCyl('Pod_GoldRing_Upper', [0, 36.3, 0], 10.5, 0.55, 10.5, goldAccent);
  addCyl('Pod_RoofCap', [0, 37.7, 0], 8.0, 2.2, 8.0, steelSilver);

  addCyl('UpperDeck_1', [0, 48.2, 0], 6.2, 2.0, 6.2, steelWhite);
  addCyl('UpperDeck_Glass', [0, 50.2, 0], 5.6, 2.0, 5.6, glassBlue);
  addCyl('UpperDeck_Gold', [0, 51.5, 0], 6.4, 0.45, 6.4, goldAccent);

  addCyl('Spire_Stage1', [0, 57.2, 0], 1.75, 11.0, 1.75, steelSilver);
  addCyl('Spire_Stage2', [0, 66.7, 0], 1.05, 10.0, 1.05, steelWhite);
  addCyl('Spire_Stage3', [0, 75.7, 0], 0.52, 9.5, 0.52, steelSilver);
  addCyl('Spire_Needle', [0, 82.0, 0], 0.2, 4.5, 0.2, steelWhite);

  const beacon = new pc.Entity('Tashkent_PeakBeacon');
  beacon.setLocalPosition(0, 84.4, 0);
  beacon.setLocalScale(0.75, 0.75, 0.75);
  beacon.addComponent('render', { type: 'sphere', material: beaconRed, castShadows: false });
  tower.addChild(beacon);

  return tower;
}

// ============================================================================
// Grand Architectural Registon Square Stand-in (~96m x 84m, ~20% Map Footprint!)
// Automatically replaced when models/registon_opt.glb is dropped or loaded!
// ============================================================================
function buildArchitecturalRegistonSquare(device: pc.GraphicsDevice): pc.Entity {
  const registon = new pc.Entity('RegistonSquare_Architectural');

  // Authentic Samarkand Majolica Tile Texture (Cobalt Blue, Turquoise, Warm Ochre & Gold!)
  const tileTex = makeCanvasTexture(device, 512, 512, (ctx, s) => {
    ctx.fillStyle = '#c89e69';
    ctx.fillRect(0, 0, s, s);
    // Ornamental brick & turquoise geometric mosaic bands
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? '#114d7c' : '#18889c';
      ctx.fillRect(0, y, s, 8);
      for (let x = 0; x < s; x += 32) {
        ctx.fillStyle = (x + y) % 64 === 0 ? '#e6be58' : '#136592';
        ctx.fillRect(x + 6, y + 12, 20, 14);
      }
    }
  });

  const mosaicMat = new pc.StandardMaterial();
  mosaicMat.diffuseMap = tileTex;
  mosaicMat.diffuseMapTiling = new pc.Vec2(4, 3);
  mosaicMat.useMetalness = true;
  mosaicMat.metalness = 0.14;
  mosaicMat.gloss = 0.62;
  mosaicMat.update();

  const sandstoneMat = new pc.StandardMaterial();
  sandstoneMat.diffuse.set(0.81, 0.68, 0.49);
  sandstoneMat.useMetalness = true;
  sandstoneMat.metalness = 0.04;
  sandstoneMat.gloss = 0.25;
  sandstoneMat.update();

  const turquoiseDomeMat = new pc.StandardMaterial();
  turquoiseDomeMat.diffuse.set(0.08, 0.58, 0.74);
  turquoiseDomeMat.emissive.set(0.04, 0.24, 0.34);
  turquoiseDomeMat.emissiveIntensity = 0.32;
  turquoiseDomeMat.useMetalness = true;
  turquoiseDomeMat.metalness = 0.22;
  turquoiseDomeMat.gloss = 0.86;
  turquoiseDomeMat.update();

  const goldMat = new pc.StandardMaterial();
  goldMat.diffuse.set(0.95, 0.78, 0.30);
  goldMat.useMetalness = true;
  goldMat.metalness = 0.88;
  goldMat.gloss = 0.85;
  goldMat.update();

  const darkArchMat = new pc.StandardMaterial();
  darkArchMat.diffuse.set(0.11, 0.18, 0.30);
  darkArchMat.useMetalness = true;
  darkArchMat.metalness = 0.1;
  darkArchMat.gloss = 0.32;
  darkArchMat.update();

  const addShape = (
    parent: pc.Entity,
    name: string,
    type: 'box' | 'cylinder' | 'sphere' | 'cone',
    pos: [number, number, number],
    scale: [number, number, number],
    mat: pc.Material
  ) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    e.addComponent('render', { type, material: mat, castShadows: true, receiveShadows: true });
    parent.addChild(e);
    return e;
  };

  // Raised travertine stone podium platform (96m x 84m)
  addShape(registon, 'Registon_Podium', 'box', [0, 0.45, 0], [96, 0.9, 84], sandstoneMat);

  // Helper to construct a grand Samarkand Madrasa (Pishtaq Portal + Turquoise Dome + Flanking Wings + Minarets)
  const buildMadrasa = (
    name: string,
    x: number,
    z: number,
    yawDeg: number,
    width: number,
    height: number,
    withTwinDomes: boolean
  ) => {
    const m = new pc.Entity(name);
    m.setLocalPosition(x, 0.9, z);
    m.setLocalEulerAngles(0, yawDeg, 0);
    registon.addChild(m);

    // Main wing masonry walls
    addShape(m, `${name}_MainBlock`, 'box', [0, height * 0.36, -6], [width, height * 0.72, 16], sandstoneMat);
    addShape(m, `${name}_FrontFacade`, 'box', [0, height * 0.36, 2.2], [width * 0.96, height * 0.68, 1.2], mosaicMat);

    // Towering Central Pishtaq Portal Arch
    addShape(m, `${name}_Pishtaq`, 'box', [0, height * 0.56, 3.4], [width * 0.42, height * 1.12, 3.8], mosaicMat);
    addShape(m, `${name}_IwanRecess`, 'box', [0, height * 0.40, 4.9], [width * 0.25, height * 0.78, 1.6], darkArchMat);
    addShape(m, `${name}_PishtaqCrown`, 'box', [0, height * 1.13, 3.4], [width * 0.44, 0.8, 4.2], goldMat);

    // Iconic Samarkand Ribbed Turquoise Dome(s)
    if (withTwinDomes) {
      for (const sx of [-width * 0.27, width * 0.27]) {
        addShape(m, `${name}_Drum_${sx}`, 'cylinder', [sx, height * 0.80, -3], [9.2, 5.5, 9.2], mosaicMat);
        addShape(m, `${name}_Dome_${sx}`, 'sphere', [sx, height * 0.98, -3], [10.6, 11.2, 10.6], turquoiseDomeMat);
        addShape(m, `${name}_Finial_${sx}`, 'cone', [sx, height * 1.24, -3], [1.2, 3.6, 1.2], goldMat);
      }
    } else {
      addShape(m, `${name}_Drum`, 'cylinder', [0, height * 0.86, -5], [12.5, 6.8, 12.5], mosaicMat);
      addShape(m, `${name}_Dome`, 'sphere', [0, height * 1.08, -5], [14.2, 14.5, 14.2], turquoiseDomeMat);
      addShape(m, `${name}_Finial`, 'cone', [0, height * 1.40, -5], [1.4, 4.2, 1.4], goldMat);
    }

    // Corner Turquoise-Crowned Minarets
    for (const side of [-1, 1]) {
      const mx = side * (width * 0.51);
      addShape(m, `${name}_Minaret_${side}`, 'cylinder', [mx, height * 0.72, 2.5], [3.6, height * 1.44, 3.6], mosaicMat);
      addShape(m, `${name}_Lantern_${side}`, 'cylinder', [mx, height * 1.48, 2.5], [4.2, 2.6, 4.2], turquoiseDomeMat);
      addShape(m, `${name}_Cap_${side}`, 'sphere', [mx, height * 1.60, 2.5], [3.8, 3.0, 3.8], goldMat);
    }
  };

  // Classic 3-Madrasa U-shaped Registon Ensemble opening toward the front boulevard!
  // Center: Tilya-Kori Madrasa
  buildMadrasa('TilyaKori_Madrasa', 0, -24, 0, 56, 22, false);
  // West: Ulugh Beg Madrasa
  buildMadrasa('UlughBeg_Madrasa', -32, 8, 90, 48, 21, true);
  // East: Sher-Dor Madrasa
  buildMadrasa('SherDor_Madrasa', 32, 8, -90, 48, 21, true);

  // Ornamental perimeter stone balustrade so it looks authentically enclosed
  addShape(registon, 'FrontBalustrade_L', 'box', [-28, 1.5, 41], [36, 1.3, 1.4], sandstoneMat);
  addShape(registon, 'FrontBalustrade_R', 'box', [28, 1.5, 41], [36, 1.3, 1.4], sandstoneMat);
  addShape(registon, 'FrontGateArch', 'box', [0, 1.5, 41], [20, 1.2, 1.2], mosaicMat);

  return registon;
}

function loadContainerUrl(app: pc.Application, url: string, name: string): Promise<pc.ContainerResource> {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(name, 'container', { url });
    asset.once('load', () => {
      const res = asset.resource as pc.ContainerResource | null;
      if (!res) reject(new Error(`Empty GLB container: ${url}`));
      else resolve(res);
    });
    asset.once('error', (err) => reject(new Error(String(err || `Failed loading ${url}`))));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

function findChildByPattern(root: pc.Entity, pattern: RegExp): pc.Entity | null {
  if (pattern.test(root.name || '')) return root;
  for (const ch of root.children) {
    if (ch instanceof pc.Entity) {
      const found = findChildByPattern(ch, pattern);
      if (found) return found;
    }
  }
  return null;
}

function computeEntityBounds(root: pc.Entity): pc.BoundingBox | null {
  root.getWorldTransform();
  const comps = root.findComponents('render') as pc.RenderComponent[];
  let box: pc.BoundingBox | null = null;
  const tmp = new pc.BoundingBox();
  for (const rc of comps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || !mi.mesh) continue;
      // ALWAYS compute exact fresh world-space AABB directly from immutable local mesh AABB!
      // Prevents stale PlayCanvas mi.aabb cache from tipping/mis-scaling newly rotated/scaled GLBs!
      tmp.setFromTransformedAabb(mi.mesh.aabb, mi.node.getWorldTransform());
      if (!box) box = tmp.clone();
      else box.add(tmp);
    }
  }
  return box;
}

/**
 * Tunes shadow flags AND permanently fixes pure-white blown-out GLB building materials!
 * Specifically targets Mat_Pavilion_Arch_V5, Mat_Campus_Street_V3, Mat_Campus_Office_Parallax_Rooms_V6,
 * Mat_Visitor_Glazing_And_PoppyMural_V6 & glass materials which exported with emissive=[1,1,1] +
 * emissiveTexture + KHR_materials_emissive_strength that blew out facades pure white under ACES HDR!
 */
function tuneWorldEntityMaterials(entity: pc.Entity, castShadows: boolean, receiveShadows = true): void {
  const comps = entity.findComponents('render') as pc.RenderComponent[];
  const fixedMats = new Set<pc.Material>();
  for (const rc of comps) {
    rc.castShadows = castShadows;
    rc.receiveShadows = receiveShadows;
    for (const mi of rc.meshInstances) {
      const mat = mi.material;
      if (!(mat instanceof pc.StandardMaterial) || fixedMats.has(mat)) continue;
      fixedMats.add(mat);

      const mName = (mat.name || '').toLowerCase();
      const isLampGlow = /lamp|light|beacon|glow|neon|led/i.test(mName);
      if (isLampGlow) continue;

      const isArchGlass = /glass|glazing|window/i.test(mName);
      const isCampusBuildingMat =
        /pavilion_arch|campus_street|parallax_rooms|visitor_arch|limestone|terracotta|poppymural/i.test(mName);
      const em = mat.emissive;
      const emLum = em.r * 0.3 + em.g * 0.59 + em.b * 0.11;

      let dirty = false;

      // 1. Completely remove self-illuminating white emissive & emissiveMap on daytime campus buildings!
      if (isCampusBuildingMat || emLum > 0.25) {
        mat.emissiveMap = null;
        mat.emissive.set(0, 0, 0);
        mat.emissiveIntensity = 0;
        dirty = true;
      }

      // 2. Give glass facades sleek architectural slate-blue tint instead of milky white reflection
      if (isArchGlass) {
        mat.diffuse.set(0.30, 0.43, 0.56);
        mat.useMetalness = true;
        mat.metalness = 0.24;
        mat.gloss = 0.86;
        dirty = true;
      } else if (isCampusBuildingMat) {
        if (/parallax_rooms/i.test(mName)) {
          mat.diffuse.set(0.56, 0.54, 0.50);
        } else {
          mat.diffuse.set(0.72, 0.70, 0.67);
        }
        mat.useMetalness = true;
        mat.metalness = Math.min(mat.metalness, 0.10);
        mat.gloss = Math.min(mat.gloss, 0.28);
        dirty = true;
      } else if (!mat.diffuseMap && mat.diffuse.r > 0.86 && mat.diffuse.g > 0.86 && mat.diffuse.b > 0.86) {
        mat.diffuse.set(0.76, 0.74, 0.71);
        mat.gloss = Math.min(mat.gloss, 0.36);
        dirty = true;
      }

      if (dirty) mat.update();
    }
  }
}

/**
 * Finds the true architectural ground-floor Y of a photogrammetry/city GLB (such as registon_opt.glb)
 * by analyzing the vertical vertex distribution in the lower 35% of the model.
 * Prevents stray subterranean tree roots or photogrammetry edge skirts from lifting the whole square into the air!
 */
function computeRobustGroundY(root: pc.Entity, bounds: pc.BoundingBox): number {
  root.getWorldTransform();
  const minY = bounds.center.y - bounds.halfExtents.y;
  const totalH = Math.max(0.5, bounds.halfExtents.y * 2);
  const cutoffY = minY + totalH * 0.34;
  const comps = root.findComponents('render') as pc.RenderComponent[];
  const samples: number[] = [];
  const p = new pc.Vec3();

  for (const rc of comps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || !mi.mesh) continue;
      const pos: number[] = [];
      const nVerts = mi.mesh.getPositions(pos);
      if (nVerts < 3) continue;
      const worldMat = mi.node.getWorldTransform();
      const step = Math.max(1, Math.floor(nVerts / 2400));
      for (let i = 0; i < nVerts; i += step) {
        p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        worldMat.transformPoint(p, p);
        samples.push(p.y);
      }
    }
  }

  if (samples.length < 24) return minY;
  samples.sort((a, b) => a - b);

  // Build 0.35m vertical histogram inside the lower 34% band to locate the flat plaza floor plane
  const binSize = 0.35;
  const bins = new Map<number, { count: number; sumY: number }>();
  for (let i = 0; i < samples.length; i++) {
    const y = samples[i];
    if (y > cutoffY) break;
    const bIdx = Math.floor((y - minY) / binSize);
    const entry = bins.get(bIdx);
    if (entry) {
      entry.count++;
      entry.sumY += y;
    } else {
      bins.set(bIdx, { count: 1, sumY: y });
    }
  }

  let bestCount = 0;
  let bestY = samples[Math.floor(samples.length * 0.14)];
  for (const entry of bins.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count;
      bestY = entry.sumY / entry.count;
    }
  }

  const p14Y = samples[Math.floor(samples.length * 0.14)];
  const chosenY = bestCount >= samples.length * 0.04 ? Math.max(bestY, p14Y) : p14Y;
  // Never shift more than 28% of model height so domes & arches always stand tall above ground
  return Math.max(minY, Math.min(minY + Math.min(totalH * 0.28, 8.5), chosenY));
}

/**
 * Dedicated material tuner for Registon Square (registon_opt.glb):
 * - Disables blue distance fog & blue HDR skybox reflection that turn sandstone walls blue-gray
 * - Preserves authentic textured sandstone, terracotta & turquoise domes with warm indirect daylight bounce
 * - Disables floating shadow cast artifacts from photogrammetry edge skirts
 */
function tuneRegistonMaterials(entity: pc.Entity): void {
  const comps = entity.findComponents('render') as pc.RenderComponent[];
  const fixedMats = new Set<pc.Material>();
  for (const rc of comps) {
    rc.castShadows = false;
    rc.receiveShadows = false;
    for (const mi of rc.meshInstances) {
      const mat = mi.material;
      if (!(mat instanceof pc.StandardMaterial) || fixedMats.has(mat)) continue;
      fixedMats.add(mat);

      mat.useFog = false;
      mat.useSkybox = false;
      mat.envAtlas = null;
      mat.useMetalness = true;
      mat.metalness = 0.0;
      mat.gloss = 0.14;

      if (mat.diffuseMap) {
        mat.diffuse.set(1.0, 0.98, 0.94);
        // Gentle warm indirect daylight using the model's own real texture so shadowed facades stay rich sandstone instead of blue-gray
        mat.emissiveMap = mat.diffuseMap;
        mat.emissive.set(0.54, 0.50, 0.44);
        mat.emissiveIntensity = 0.62;
      } else {
        // Warm up untextured surfaces so they never look washed-out blue
        mat.diffuse.set(
          Math.min(1, mat.diffuse.r * 1.05 + 0.04),
          Math.min(1, mat.diffuse.g * 1.0 + 0.02),
          Math.max(0.15, mat.diffuse.b * 0.88)
        );
        mat.emissive.set(0.12, 0.10, 0.08);
        mat.emissiveIntensity = 0.35;
      }
      mat.update();
    }
  }
}

/**
 * Converts a closed road polygon into a smooth, natural-driving loop with rounded circular
 * intersection turn arcs (no sharp 90° snapping corners!).
 */
function buildSmoothRoadLoop(
  rawPoints: Array<{ x: number; z: number }>,
  defaultRadius = 9.0,
  arcSteps = 7
): Array<{ x: number; z: number }> {
  const n = rawPoints.length;
  if (n < 3) return rawPoints;
  const out: Array<{ x: number; z: number }> = [];

  for (let i = 0; i < n; i++) {
    const prev = rawPoints[(i - 1 + n) % n];
    const curr = rawPoints[i];
    const next = rawPoints[(i + 1) % n];

    const v1x = prev.x - curr.x;
    const v1z = prev.z - curr.z;
    const l1 = Math.hypot(v1x, v1z);

    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const l2 = Math.hypot(v2x, v2z);

    if (l1 < 0.5 || l2 < 0.5) {
      out.push(curr);
      continue;
    }

    const u1x = v1x / l1;
    const u1z = v1z / l1;
    const u2x = v2x / l2;
    const u2z = v2z / l2;

    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z));
    // Nearly collinear points (e.g. roundabout arc vertices) don't need extra filleting
    if (dot < -0.94) {
      out.push(curr);
      continue;
    }

    const cut = Math.min(defaultRadius, l1 * 0.36, l2 * 0.36);
    const pStartX = curr.x + u1x * cut;
    const pStartZ = curr.z + u1z * cut;
    const pEndX = curr.x + u2x * cut;
    const pEndZ = curr.z + u2z * cut;

    for (let s = 0; s <= arcSteps; s++) {
      const t = s / arcSteps;
      const omt = 1 - t;
      // Smooth quadratic Bezier corner fillet tangent to both road lanes
      const x = omt * omt * pStartX + 2 * omt * t * curr.x + t * t * pEndX;
      const z = omt * omt * pStartZ + 2 * omt * t * curr.z + t * t * pEndZ;
      out.push({ x, z });
    }
  }
  return out;
}

/** Generates smooth counter-clockwise right-hand roundabout arc around Tashkent Plaza (0, 29) */
function makeRoundaboutArc(
  cx: number,
  cz: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  steps = 8
): Array<{ x: number; z: number }> {
  const pts: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    pts.push({ x: cx + Math.sin(rad) * radius, z: cz + Math.cos(rad) * radius });
  }
  return pts;
}

// Smooth Natural Right-Hand Traffic Loops with Rounded Corners & True Circular Roundabout Curves!
const TRAFFIC_ROUTES: Array<Array<{ x: number; z: number }>> = [
  // Route 0: Outer Grand Campus Boulevard Loop (Charleston -> Bay View -> Amphitheatre -> West Campus)
  buildSmoothRoadLoop(
    [
      { x: -114.5, z: 79.4 },
      { x: 152.5, z: 79.4 },
      { x: 152.5, z: -21.4 },
      { x: -114.5, z: -21.4 },
    ],
    10.5,
    8
  ),
  // Route 1: West Loop curving naturally around the West half of Tashkent TV Tower Roundabout!
  buildSmoothRoadLoop(
    [
      { x: -121.5, z: -14.6 },
      { x: -121.5, z: 72.6 },
      { x: -3.5, z: 72.6 },
      { x: -3.5, z: 54.0 },
      ...makeRoundaboutArc(0, 29, 22.8, -16, -164, 9),
      { x: -3.5, z: 4.0 },
      { x: -3.5, z: -14.6 },
    ],
    7.5,
    6
  ),
  // Route 2: East & North Creek Loop curving naturally around the East half of Tashkent TV Tower Roundabout!
  buildSmoothRoadLoop(
    [
      { x: 3.5, z: 54.0 },
      { x: 3.5, z: 72.6 },
      { x: 159.5, z: 72.6 },
      { x: 159.5, z: -82.5 },
      { x: 3.5, z: -82.5 },
      { x: 3.5, z: 4.0 },
      ...makeRoundaboutArc(0, 29, 22.8, 164, 16, 9),
    ],
    7.5,
    6
  ),
];

// ============================================================================
// Build Full Mountain View Campus + Registon Square + River + Tashkent Plaza
// ============================================================================
export function buildPlayCanvasOpenWorld(app: pc.Application, isMobile: boolean): OpenWorldHandle {
  const root = new pc.Entity('CampusOpenWorldRoot');
  app.root.addChild(root);

  const hdrEnv = new HdrEnvironmentController(app, isMobile);
  const device = app.graphicsDevice;

  const colliders: WorldBoxCollider[] = [];
  const ramps: StuntRamp[] = [
    { x: -92.0, z: 76.0, yawDeg: -90, width: 3.8, length: 6.4, height: 1.15 },
    { x: 156.0, z: 32.0, yawDeg: 0, width: 4.4, length: 7.4, height: 1.42 },
  ];
  const trafficAgents: TrafficAgent[] = [];
  const pinwheelRotors: pc.Entity[] = [];
  const swayingFoliage: SwayItem[] = [];
  const animatedWaters: pc.StandardMaterial[] = [];

  const TASHKENT_CENTER = { x: 0, z: 29 };
  // Grand Registon Square right in front of the towering NW Santa Cruz mountains (~20% map footprint!)
  const REGISTON_CENTER = { x: -158, z: -156 };

  // 1. Expansive Campus Lawn Terrain Plane
  const grassMat = createGrassMaterial(device);
  const ground = new pc.Entity('CampusGrassTerrain');
  ground.setLocalPosition(0, -0.04, 0);
  ground.setLocalScale(1200, 1, 1200);
  ground.addComponent('render', {
    type: 'plane',
    material: grassMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(ground);

  // 2. Authentic Mountain View Campus Road Network + Registon Ceremonial Approach Boulevard
  const asphaltBikeMat = createAsphaltMaterial(device, true);
  const asphaltPlainMat = createAsphaltMaterial(device, false);
  const paverMat = createPaverMaterial(device, 8, 8);
  const plazaPaverMat = createPaverMaterial(device, 12, 12);

  const addRoadSegment = (
    name: string,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    width: number,
    y: number,
    mat: pc.StandardMaterial,
    repeatAlong = true
  ) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const cx = (x1 + x2) * 0.5;
    const cz = (z1 + z2) * 0.5;
    const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;

    let useMat = mat;
    if (repeatAlong && mat.diffuseMap) {
      const cloned = mat.clone();
      cloned.diffuseMapTiling = new pc.Vec2(1, Math.max(1, Math.round(len / 14)));
      cloned.update();
      useMat = cloned;
    }

    const seg = new pc.Entity(name);
    seg.setLocalPosition(cx, y, cz);
    seg.setLocalEulerAngles(0, yawDeg, 0);
    seg.setLocalScale(width, 1, len);
    seg.addComponent('render', {
      type: 'plane',
      material: useMat,
      castShadows: false,
      receiveShadows: true,
    });
    root.addChild(seg);
  };

  addRoadSegment('Charleston_Rd', -205, 76, 168, 76, 14.5, 0.03, asphaltBikeMat);
  addRoadSegment('Amphitheatre_Pkwy', -205, -18, 168, -18, 14.5, 0.03, asphaltBikeMat);
  addRoadSegment('Gradient_Dropoff', -56, 116, 56, 116, 11.0, 0.035, plazaPaverMat, false);
  addRoadSegment('North_Creek_Trail', 0, -86, 164, -86, 12.0, 0.03, asphaltBikeMat);
  addRoadSegment('Shoreline_Blvd_South', 0, 122, 0, 52, 14.5, 0.032, asphaltBikeMat);
  addRoadSegment('Shoreline_Blvd_North', 0, 6, 0, -86, 14.5, 0.032, asphaltBikeMat);
  addRoadSegment('West_Campus_Ave', -118, 92, -118, -18, 13.5, 0.03, asphaltBikeMat);
  addRoadSegment('Stan_Courtyard_Walk', -118, -18, -118, -104, 12.0, 0.036, paverMat, false);
  // Grand Samarqand / Registon Esplanade Avenue leading straight from Stan Plaza & North Creek to Registon Square!
  addRoadSegment('Registon_Esplanade', -118, -104, 0, -86, 12.5, 0.034, plazaPaverMat, false);
  addRoadSegment('Bay_View_Promenade', 156, 112, 156, -86, 16.5, 0.036, paverMat, false);
  addRoadSegment('Shoreline_Esplanade', 18, -158, 12, -192, 11.0, 0.036, paverMat, false);

  const intersections = [
    [0, 116, 10],
    [0, 76, 11],
    [-118, 76, 11],
    [156, 76, 11],
    [0, -18, 11],
    [-118, -18, 11],
    [156, -18, 11],
    [0, -86, 10],
    [52, -86, 9],
    [156, -86, 10],
    [-118, -102, 11],
  ];
  for (let i = 0; i < intersections.length; i++) {
    const [ix, iz, rad] = intersections[i];
    const pad = new pc.Entity(`Intersection_${i}`);
    pad.setLocalPosition(ix, 0.038, iz);
    pad.setLocalScale(rad * 1.75, 0.02, rad * 1.75);
    pad.addComponent('render', {
      type: 'cylinder',
      material: asphaltPlainMat,
      castShadows: false,
      receiveShadows: true,
    });
    root.addChild(pad);
  }

  // Clean Flat Central Roundabout Plaza for TASHKENT TV TOWER
  const roundaboutAsphalt = new pc.Entity('Tashkent_Roundabout_Road');
  roundaboutAsphalt.setLocalPosition(TASHKENT_CENTER.x, 0.034, TASHKENT_CENTER.z);
  roundaboutAsphalt.setLocalScale(54, 0.02, 54);
  roundaboutAsphalt.addComponent('render', {
    type: 'cylinder',
    material: asphaltPlainMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(roundaboutAsphalt);

  const plazaFlatSurface = new pc.Entity('Tashkent_Central_Plaza_Flat');
  plazaFlatSurface.setLocalPosition(TASHKENT_CENTER.x, 0.044, TASHKENT_CENTER.z);
  plazaFlatSurface.setLocalScale(34, 0.02, 34);
  plazaFlatSurface.addComponent('render', {
    type: 'cylinder',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(plazaFlatSurface);

  // ============================================================================
  // ANIMATED SHIMMERING WATER: Bay View Lake + Stevens Creek River UNDER THE BRIDGE!
  // ============================================================================
  const lakeWaterMat = createAnimatedWaterMaterial(device, 6, 11);
  const riverWaterMat = createAnimatedWaterMaterial(device, 2.5, 10);
  animatedWaters.push(lakeWaterMat, riverWaterMat);

  // 1. Bay View Waterfront Lake
  const bayPond = new pc.Entity('BayView_RetentionBasin');
  bayPond.setLocalPosition(198, -0.015, 14);
  bayPond.setLocalScale(78, 1, 166);
  bayPond.addComponent('render', {
    type: 'plane',
    material: lakeWaterMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(bayPond);

  // 2. Flowing Stevens Creek River passing directly UNDERNEATH Stevens Creek Bridge (35, -122)!
  // Bridge spans (52,-86) -> (18,-158), so river flows cleanly perpendicular across (35,-122)!
  const addRiverChannel = (name: string, x1: number, z1: number, x2: number, z2: number, width: number) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const cx = (x1 + x2) * 0.5;
    const cz = (z1 + z2) * 0.5;
    const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
    const ent = new pc.Entity(name);
    ent.setLocalPosition(cx, -0.012, cz);
    ent.setLocalEulerAngles(0, yawDeg, 0);
    ent.setLocalScale(width, 1, len);
    ent.addComponent('render', {
      type: 'plane',
      material: riverWaterMat,
      castShadows: false,
      receiveShadows: true,
    });
    root.addChild(ent);
  };

  // River runs from Bay View Lake -> North-East Reach -> Right under Stevens Creek Bridge -> West Creek Pool!
  addRiverChannel('StevensCreek_EastReach', 196, -68, 134, -148, 22);
  addRiverChannel('StevensCreek_BridgeReach', 138, -148, -28, -104, 24); // Passes directly underneath (35, -122)!
  addRiverChannel('StevensCreek_WestPool', -24, -104, -56, -158, 26);

  // Scenic Shoreline Lagoon near the West Creek outlet
  const creekLagoon = new pc.Entity('Shoreline_Creek_Lagoon');
  creekLagoon.setLocalPosition(-42, -0.015, -152);
  creekLagoon.setLocalScale(46, 0.02, 34);
  creekLagoon.addComponent('render', {
    type: 'cylinder',
    material: lakeWaterMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(creekLagoon);

  // Forecourt & Landmark Plaza Surfaces
  const forecourt = new pc.Entity('Gradient_Visitor_Forecourt');
  forecourt.setLocalPosition(0, 0.04, 126);
  forecourt.setLocalScale(68, 1, 24);
  forecourt.addComponent('render', {
    type: 'plane',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(forecourt);

  const androidPad = new pc.Entity('AndroidLawn_Plaza');
  androidPad.setLocalPosition(-118, 0.04, 96);
  androidPad.setLocalScale(32, 0.02, 26);
  androidPad.addComponent('render', {
    type: 'cylinder',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(androidPad);

  const stanPad = new pc.Entity('StanCourtyard_Plaza');
  stanPad.setLocalPosition(-118, 0.04, -50);
  stanPad.setLocalScale(24, 0.02, 24);
  stanPad.addComponent('render', {
    type: 'cylinder',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(stanPad);

  // Registon Forecourt Promenade (public viewing plaza in front of solid Registon monument!)
  const registonForecourt = new pc.Entity('Registon_Forecourt_Plaza');
  registonForecourt.setLocalPosition(-122, 0.042, -102);
  registonForecourt.setLocalScale(52, 1, 24);
  registonForecourt.addComponent('render', {
    type: 'plane',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(registonForecourt);

  // ============================================================================
  // 3. UPRIGHT ILLUMINATED ROADSIDE LANDMARK SIGNS
  //    • "ABDURAZOKHOV" right at the base/entrance of Tashkent TV Tower
  //    • "SAMARQAND 2027" right in front of Registon Square
  // ============================================================================
  const abduSign = buildStandingLandmarkSign(device, {
    name: 'Sign_Abdurazokhov',
    title: 'ABDURAZOKHOV',
    subtitle: 'TASHKENT TV TOWER',
    accentHex: '#f5c754',
    bgTop: '#0d1b36',
    bgBot: '#071022',
    width: 9.2,
    height: 3.2,
  });
  abduSign.setLocalPosition(0, 0.05, 43.2);
  abduSign.setLocalEulerAngles(0, 0, 0);
  root.addChild(abduSign);
  colliders.push({ minX: -4.8, maxX: 4.8, minZ: 42.4, maxZ: 44.0 });

  const samarqandSign = buildStandingLandmarkSign(device, {
    name: 'Sign_Samarqand2027',
    title: 'SAMARQAND 2027',
    subtitle: 'REGISTON MAYDONI',
    accentHex: '#38d9f5',
    bgTop: '#0a2948',
    bgBot: '#07172a',
    width: 11.4,
    height: 3.8,
  });
  samarqandSign.setLocalPosition(-106, 0.05, -104);
  samarqandSign.setLocalEulerAngles(0, 38, 0);
  root.addChild(samarqandSign);
  colliders.push({ minX: -110.5, maxX: -101.5, minZ: -108.5, maxZ: -99.5 });

  // ============================================================================
  // 4. TASHKENT TV TOWER at Central Plaza (0, 0.05, 29)
  // ============================================================================
  const tashkentHolder = new pc.Entity('Tashkent_TV_Tower_Holder');
  tashkentHolder.setLocalPosition(TASHKENT_CENTER.x, 0.05, TASHKENT_CENTER.z);
  root.addChild(tashkentHolder);

  let activeTashkentModel: pc.Entity = buildArchitecturalTashkentTower();
  let customTashkentLoaded = false;
  tashkentHolder.addChild(activeTashkentModel);

  colliders.push({
    minX: TASHKENT_CENTER.x - 6.5,
    maxX: TASHKENT_CENTER.x + 6.5,
    minZ: TASHKENT_CENTER.z - 6.5,
    maxZ: TASHKENT_CENTER.z + 6.5,
  });

  // ============================================================================
  // 5. REGISTON SQUARE (registon_opt.glb) IN FRONT OF MOUNTAINS (~20% MAP, SOLID!)
  // ============================================================================
  const registonHolder = new pc.Entity('Registon_Square_Holder');
  registonHolder.setLocalPosition(REGISTON_CENTER.x, 0.0, REGISTON_CENTER.z);
  registonHolder.setLocalEulerAngles(0, 32, 0);
  root.addChild(registonHolder);

  // Flush architectural sandstone plaza apron directly on the ground under Registon so it blends seamlessly with zero air gap!
  const registonGroundApron = new pc.Entity('Registon_Ground_Apron');
  registonGroundApron.setLocalPosition(0, 0.03, 0);
  registonGroundApron.setLocalScale(106, 0.06, 92);
  registonGroundApron.addComponent('render', {
    type: 'box',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  registonHolder.addChild(registonGroundApron);

  let activeRegistonModel: pc.Entity = buildArchitecturalRegistonSquare(device);
  let customRegistonLoaded = false;
  registonHolder.addChild(activeRegistonModel);

  // SOLID IMPASSABLE PERIMETER COLLIDER — neither cars nor player can enter inside Registon!
  colliders.push({
    minX: REGISTON_CENTER.x - 52,
    maxX: REGISTON_CENTER.x + 50,
    minZ: REGISTON_CENTER.z - 48,
    maxZ: REGISTON_CENTER.z + 44,
  });

  // Full Dense Mountain View Campus Building Plan (16 real GLB architectural buildings — clear view to Registon!)
  type BldgVariant = 'pavilion_v6' | 'pavilion_v5' | 'glass_v3';
  const campusBuildings: Array<{
    name: string;
    cx: number;
    cz: number;
    wx: number;
    wz: number;
    hy: number;
    yaw: number;
    variant: BldgVariant;
  }> = [
    { name: 'Visitor_Timber_West', cx: -156, cz: 104, wx: 34, wz: 22, hy: 11.5, yaw: 0, variant: 'pavilion_v6' },
    { name: 'Charleston_SW_Studio', cx: -66, cz: 46, wx: 48, wz: 24, hy: 13.0, yaw: 0, variant: 'glass_v3' },
    { name: 'Charleston_SE_Commons', cx: 78, cz: 46, wx: 54, wz: 24, hy: 13.5, yaw: 0, variant: 'glass_v3' },
    { name: 'Googleplex_Bldg_40', cx: -162, cz: -52, wx: 38, wz: 26, hy: 14.0, yaw: 90, variant: 'pavilion_v6' },
    { name: 'Googleplex_Bldg_41', cx: -74, cz: -52, wx: 36, wz: 24, hy: 13.5, yaw: 0, variant: 'pavilion_v5' },
    { name: 'Googleplex_Bldg_42', cx: -66, cz: 12, wx: 46, wz: 22, hy: 13.0, yaw: 180, variant: 'pavilion_v6' },
    { name: 'North_Bayshore_Hub', cx: 78, cz: 12, wx: 54, wz: 24, hy: 14.5, yaw: 180, variant: 'pavilion_v6' },
    { name: 'Shoreline_Tech_Pavilion', cx: -32, cz: -54, wx: 34, wz: 20, hy: 12.0, yaw: 180, variant: 'pavilion_v5' },
    { name: 'Charleston_North_West_HQ', cx: -66, cz: 104, wx: 44, wz: 22, hy: 13.0, yaw: 180, variant: 'pavilion_v6' },
    { name: 'Charleston_North_East_HQ', cx: 78, cz: 104, wx: 48, wz: 22, hy: 13.5, yaw: 180, variant: 'glass_v3' },
    { name: 'Gradient_East_Annex', cx: 112, cz: 136, wx: 44, wz: 24, hy: 14.0, yaw: 0, variant: 'pavilion_v5' },
    { name: 'Gradient_West_Annex', cx: -102, cz: 144, wx: 46, wz: 24, hy: 13.5, yaw: 0, variant: 'glass_v3' },
    { name: 'West_Campus_Solar_Wing', cx: -162, cz: 28, wx: 34, wz: 26, hy: 11.0, yaw: 90, variant: 'pavilion_v5' },
    { name: 'Amphitheatre_East_Studio', cx: 68, cz: -52, wx: 46, wz: 22, hy: 13.5, yaw: 0, variant: 'pavilion_v6' },
    { name: 'Amphitheatre_FarEast_Lab', cx: 124, cz: -52, wx: 36, wz: 22, hy: 12.5, yaw: 180, variant: 'glass_v3' },
    { name: 'North_Creek_Innovation', cx: 106, cz: -108, wx: 42, wz: 20, hy: 13.5, yaw: 0, variant: 'pavilion_v5' },
  ];

  for (const b of campusBuildings) {
    const hw = (b.yaw % 180 === 0 ? b.wx : b.wz) * 0.5;
    const hd = (b.yaw % 180 === 0 ? b.wz : b.wx) * 0.5;
    colliders.push({
      minX: b.cx - hw,
      maxX: b.cx + hw,
      minZ: b.cz - hd,
      maxZ: b.cz + hd,
    });
  }
  colliders.push({ minX: -38, maxX: 38, minZ: 132, maxZ: 168 });
  colliders.push({ minX: 180, maxX: 228, minZ: -44, maxZ: 68 });

  // ============================================================================
  // Dynamic GLB Loaders: tashkent.glb & registon_opt.glb
  // ============================================================================
  async function loadTashkentGlbUrl(url: string, name = 'tashkent.glb'): Promise<boolean> {
    try {
      const resource = await loadContainerUrl(app, url, name);
      const wrapper = new pc.Entity('TashkentTower_CustomGLB');
      const ent = resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      wrapper.addChild(ent);
      tashkentHolder.addChild(wrapper);

      const bounds = computeEntityBounds(wrapper);
      if (bounds) {
        // Only rotate upright if the tower's longest axis is genuinely horizontal (X or Z >> Y)
        const spanX = bounds.halfExtents.x * 2;
        const spanY = bounds.halfExtents.y * 2;
        const spanZ = bounds.halfExtents.z * 2;
        if (spanZ > spanY * 1.45 && spanZ >= spanX) {
          ent.setLocalEulerAngles(-90, 0, 0);
        } else if (spanX > spanY * 1.45 && spanX > spanZ) {
          ent.setLocalEulerAngles(0, 0, 90);
        }

        const uprightBounds = computeEntityBounds(wrapper) || bounds;
        const h = Math.max(0.2, uprightBounds.halfExtents.y * 2);
        const horiz = Math.max(0.2, uprightBounds.halfExtents.x * 2, uprightBounds.halfExtents.z * 2);
        // Scale cleanly to 86m tall AND guarantee base footprint never exceeds the 26m plaza!
        const sc = Math.min(86.0 / h, 26.0 / horiz);
        ent.setLocalScale(sc, sc, sc);

        const scaled = computeEntityBounds(wrapper);
        if (scaled) {
          const minY = scaled.center.y - scaled.halfExtents.y;
          const holderPos = tashkentHolder.getPosition();
          ent.setLocalPosition(
            holderPos.x - scaled.center.x,
            holderPos.y - minY,
            holderPos.z - scaled.center.z
          );
        }
      }

      tuneWorldEntityMaterials(wrapper, true, true);
      activeTashkentModel.destroy();
      activeTashkentModel = wrapper;
      customTashkentLoaded = true;
      return true;
    } catch (err) {
      console.warn('[World] Failed to load tashkent.glb:', err);
      return false;
    }
  }

  async function loadTashkentGlbFile(file: File): Promise<boolean> {
    const blobUrl = URL.createObjectURL(file);
    try {
      return await loadTashkentGlbUrl(blobUrl, file.name);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
    }
  }

  async function loadRegistonGlbUrl(url: string, name = 'registon_opt.glb'): Promise<boolean> {
    try {
      const resource = await loadContainerUrl(app, url, name);
      const wrapper = new pc.Entity('Registon_CustomGLB');
      const ent = resource.instantiateRenderEntity({ castShadows: false, receiveShadows: false });
      wrapper.addChild(ent);

      // Measure & normalize cleanly at world origin (unrotated!) BEFORE parenting to rotated registonHolder!
      app.root.addChild(wrapper);

      const bounds = computeEntityBounds(wrapper);
      if (bounds) {
        const maxSpan = Math.max(0.5, bounds.halfExtents.x * 2, bounds.halfExtents.z * 2);
        // Scale grandly to 102m wide (~20% of active map footprint!)
        const sc = 102.0 / maxSpan;
        ent.setLocalScale(sc, sc, sc);

        const scaled = computeEntityBounds(wrapper);
        if (scaled) {
          // Detect true plaza floor Y (ignoring stray hanging tree-roots/skirt vertices) and seat firmly INTO ground!
          const groundY = computeRobustGroundY(wrapper, scaled);
          ent.setLocalPosition(-scaled.center.x, -groundY - 0.35, -scaled.center.z);
        }
      }

      app.root.removeChild(wrapper);
      registonHolder.addChild(wrapper);

      tuneRegistonMaterials(wrapper);
      activeRegistonModel.destroy();
      activeRegistonModel = wrapper;
      customRegistonLoaded = true;
      return true;
    } catch (err) {
      console.warn('[World] Failed to load registon_opt.glb:', err);
      return false;
    }
  }

  async function loadRegistonGlbFile(file: File): Promise<boolean> {
    const blobUrl = URL.createObjectURL(file);
    try {
      return await loadRegistonGlbUrl(blobUrl, file.name);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
    }
  }

  function sampleRouteAtDist(
    route: Array<{ x: number; z: number }>,
    segLengths: number[],
    totalLen: number,
    distInput: number
  ): { x: number; z: number; yawDeg: number } {
    let dist = ((distInput % totalLen) + totalLen) % totalLen;
    let segIdx = 0;
    while (segIdx < segLengths.length - 1 && dist > segLengths[segIdx]) {
      dist -= segLengths[segIdx];
      segIdx++;
    }
    const a = route[segIdx];
    const b = route[(segIdx + 1) % route.length];
    const t = dist / Math.max(0.01, segLengths[segIdx]);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const yawDeg = (Math.atan2(-(b.x - a.x), -(b.z - a.z)) * 180) / Math.PI;
    return { x, z, yawDeg };
  }

  function registerTrafficCar(
    entity: pc.Entity,
    wheels: TrafficWheelRef[],
    routeIndex: number,
    phase: number,
    speed: number,
    opts?: { damageRig?: CarDamageRig | null; carWidth?: number; carLength?: number }
  ): void {
    const route = TRAFFIC_ROUTES[routeIndex % TRAFFIC_ROUTES.length];
    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < route.length; i++) {
      const a = route[i];
      const b = route[(i + 1) % route.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      segLengths.push(l);
      totalLen += l;
    }
    const normPhase = ((phase % 1) + 1) % 1;
    const initial = sampleRouteAtDist(route, segLengths, totalLen, normPhase * totalLen);
    entity.setLocalPosition(initial.x, getTerrainHeight(initial.x, initial.z), initial.z);
    entity.setLocalEulerAngles(0, initial.yawDeg, 0);
    root.addChild(entity);

    trafficAgents.push({
      entity,
      wheels,
      damageRig: opts?.damageRig ?? null,
      carWidth: opts?.carWidth ?? 1.9,
      carLength: opts?.carLength ?? 4.3,
      baseSpeed: speed,
      curSpeed: speed * 0.7,
      phase: normPhase,
      route,
      segLengths,
      totalLen,
      spinDeg: 0,
      steerDeg: 0,
      yaw: initial.yawDeg,
      x: initial.x,
      z: initial.z,
      offsetX: 0,
      offsetZ: 0,
      knockVx: 0,
      knockVz: 0,
      knockYaw: 0,
      knockYawVel: 0,
      stunTimer: 0,
    });
  }

  function applyTrafficCrash(
    agent: TrafficAgent,
    impulseVx: number,
    impulseVz: number,
    worldHitPoint: pc.Vec3,
    worldHitDir: pc.Vec3,
    intensity: number
  ): void {
    agent.knockVx += impulseVx;
    agent.knockVz += impulseVz;
    agent.knockYawVel += (Math.random() - 0.5) * 140 * intensity;
    agent.curSpeed *= 0.25;
    agent.stunTimer = Math.max(agent.stunTimer, 1.35 + intensity * 1.1);
    if (agent.damageRig) {
      agent.damageRig.applyImpact(worldHitPoint, worldHitDir, intensity);
    }
  }

  // 6. Real Campus GLB Environment Loader
  const campusGlbRoot = new pc.Entity('CampusRealGlbRoot');
  root.addChild(campusGlbRoot);

  function cloneExtractedNode(
    sourceScene: pc.Entity,
    pattern: RegExp,
    x: number,
    y: number,
    z: number,
    yawDeg: number,
    scaleX = 1,
    scaleY = scaleX,
    scaleZ = scaleX,
    castShadows = !isMobile
  ): pc.Entity | null {
    const proto = findChildByPattern(sourceScene, pattern);
    if (!proto) return null;
    const clone = proto.clone() as pc.Entity;
    clone.setLocalPosition(x, y, z);
    clone.setLocalEulerAngles(0, yawDeg, 0);
    clone.setLocalScale(scaleX, scaleY, scaleZ);
    tuneWorldEntityMaterials(clone, castShadows, true);
    campusGlbRoot.addChild(clone);
    return clone;
  }

  function registerSwayingNode(node: pc.Entity, ampDeg: number, speed: number): void {
    const e = node.getLocalEulerAngles();
    swayingFoliage.push({
      node,
      baseX: e.x,
      baseY: e.y,
      baseZ: e.z,
      phase: swayingFoliage.length * 0.73,
      ampDeg,
      speed,
    });
  }

  async function loadCampusAssets(
    tashkentUrl?: string | null,
    registonUrl?: string | null,
    onProgress?: (label: string, pct: number) => void
  ): Promise<void> {
    const safeLoad = async (path: string, label: string): Promise<pc.Entity | null> => {
      try {
        const res = await loadContainerUrl(app, path, label);
        return res.instantiateRenderEntity({ castShadows: !isMobile, receiveShadows: true });
      } catch (err) {
        console.warn(`[World] Skipped ${path}:`, err);
        return null;
      }
    };

    const tashkentPromise = tashkentUrl ? loadTashkentGlbUrl(tashkentUrl, 'tashkent.glb') : Promise.resolve(false);
    const registonPromise = registonUrl ? loadRegistonGlbUrl(registonUrl, 'registon_opt.glb') : Promise.resolve(false);

    onProgress?.('Loading Campus, Mountains & Registon Square…', 18);
    const [
      canopyScene,
      horizonScene,
      landmarksScene,
      propsScene,
      treesScene,
      androidScene,
      stanScene,
      envV3Scene,
    ] = await Promise.all([
      safeLoad('./assets/glb/gradient_canopy_v6.glb', 'gradient_canopy_v6'),
      safeLoad('./assets/glb/campus_horizon_arch_v5.glb', 'campus_horizon_arch_v5'),
      safeLoad('./assets/glb/campus_landmarks_v2.glb', 'campus_landmarks_v2'),
      safeLoad('./assets/glb/props_and_bridge_v6.glb', 'props_and_bridge_v6'),
      safeLoad('./assets/glb/trees_v4.glb', 'trees_v4'),
      safeLoad('./assets/glb/android_statues_v2.glb', 'android_statues_v2'),
      safeLoad('./assets/glb/stan_trex_v5.glb', 'stan_trex_v5'),
      safeLoad('./assets/glb/campus_environment_v3.glb', 'campus_environment_v3'),
    ]);

    await Promise.all([tashkentPromise, registonPromise]);
    onProgress?.('Assembling Buildings, Swaying Trees & River…', 52);

    const measureProto = (scene: pc.Entity | null, re: RegExp) => {
      if (!scene) return null;
      const proto = findChildByPattern(scene, re);
      if (!proto) return null;
      const temp = new pc.Entity('MeasureTemp');
      temp.addChild(proto.clone());
      app.root.addChild(temp);
      const b = computeEntityBounds(temp);
      app.root.removeChild(temp);
      temp.destroy();
      return {
        scene,
        re,
        w: b ? Math.max(4, b.halfExtents.x * 2) : 32,
        h: b ? Math.max(4, b.halfExtents.y * 2) : 13,
        d: b ? Math.max(4, b.halfExtents.z * 2) : 20,
      };
    };

    const pavV6 = measureProto(canopyScene, /^Campus_Office_Pavilion_V6$/i);
    const pavV5 = measureProto(horizonScene, /^Campus_Office_Pavilion_V5$/i);
    const glassV3 = measureProto(envV3Scene, /^Bldg_ModernGlass_Wing_V3$/i);

    // A. Gradient Canopy V6 + Bay View Waterfront Pavilions
    if (canopyScene) {
      const grad = cloneExtractedNode(canopyScene, /^Gradient_Canopy_Building_V6$/i, 0, 0, 145, 180, 1, 1, 1, true);
      if (grad) {
        const collectRotors = (n: pc.GraphNode) => {
          if (n instanceof pc.Entity && /Pinwheel.*Rotor|Rotor/i.test(n.name || '')) {
            pinwheelRotors.push(n);
          }
          for (const ch of n.children) collectRotors(ch);
        };
        collectRotors(grad);
      }

      cloneExtractedNode(canopyScene, /^Bay_View_Canopy_Pavilion_V6$/i, 202, 0.02, 38, -90, 1.0, 1.0, 1.0, !isMobile);
      cloneExtractedNode(canopyScene, /^Bay_View_Canopy_Pavilion_V6$/i, 205, 0.02, -20, -90, 0.84, 0.84, 0.84, !isMobile);
    }

    // B. Campus Architectural Office Buildings (all white emissive glitches fixed!)
    for (const spec of campusBuildings) {
      const tpl =
        spec.variant === 'glass_v3'
          ? glassV3 || pavV6 || pavV5
          : spec.variant === 'pavilion_v5'
            ? pavV5 || pavV6 || glassV3
            : pavV6 || pavV5 || glassV3;
      if (!tpl) continue;
      const sx = spec.wx / tpl.w;
      const sz = spec.wz / tpl.d;
      const sy = Math.max(0.85, Math.min(1.4, spec.hy / tpl.h));
      cloneExtractedNode(tpl.scene, tpl.re, spec.cx, 0, spec.cz, spec.yaw, sx, sy, sz, !isMobile);
    }

    // C. 360° Two-Tier Santa Cruz & Diablo Mountain Skyline (behind Registon Square & Campus!)
    if (horizonScene) {
      const mountainMatTier1 = new pc.StandardMaterial();
      mountainMatTier1.diffuse.set(0.32, 0.44, 0.30);
      mountainMatTier1.useMetalness = true;
      mountainMatTier1.metalness = 0.0;
      mountainMatTier1.gloss = 0.08;
      mountainMatTier1.update();

      const mountainMatTier2 = new pc.StandardMaterial();
      mountainMatTier2.diffuse.set(0.38, 0.48, 0.56);
      mountainMatTier2.useMetalness = true;
      mountainMatTier2.metalness = 0.0;
      mountainMatTier2.gloss = 0.06;
      mountainMatTier2.update();

      const applyMountainMat = (ent: pc.Entity, mat: pc.StandardMaterial) => {
        const comps = ent.findComponents('render') as pc.RenderComponent[];
        for (const rc of comps) {
          rc.castShadows = false;
          rc.receiveShadows = false;
          for (const mi of rc.meshInstances) mi.material = mat;
        }
      };

      for (let i = 0; i < 12; i++) {
        const azDeg = i * 30;
        const rad = (azDeg * Math.PI) / 180;
        const r = 284 + (i % 3) * 3;
        const mx = Math.sin(rad) * r;
        const mz = Math.cos(rad) * r;
        const yawDeg = (Math.atan2(-mx, -mz) * 180) / Math.PI;
        const sy = 1.82 + (i % 4) * 0.08;
        const seg = cloneExtractedNode(horizonScene, /^Santa_Cruz_Ridgeline_Arc_V5$/i, mx, -0.6, mz, yawDeg, 2.68, sy, 1.74, false);
        if (seg) applyMountainMat(seg, mountainMatTier1);
      }

      for (let i = 0; i < 12; i++) {
        const azDeg = i * 30 + 15;
        const rad = (azDeg * Math.PI) / 180;
        const r = 386 + (i % 3) * 5;
        const mx = Math.sin(rad) * r;
        const mz = Math.cos(rad) * r;
        const yawDeg = (Math.atan2(-mx, -mz) * 180) / Math.PI;
        const sy = 2.75 + (i % 4) * 0.14;
        const seg = cloneExtractedNode(horizonScene, /^Santa_Cruz_Ridgeline_Arc_V5$/i, mx, -1.2, mz, yawDeg, 3.8, sy, 2.56, false);
        if (seg) applyMountainMat(seg, mountainMatTier2);
      }

      const bermSpots = [
        [-42, 92, 20, 1.1],
        [44, 92, -25, 1.1],
        [-38, -4, 40, 1.0],
        [42, -4, -35, 1.0],
        [118, 36, 15, 1.2],
        [-88, 32, -10, 1.1],
      ];
      for (const [bx, bz, byaw, bs] of bermSpots) {
        cloneExtractedNode(horizonScene, /^Courtyard_Landscape_Berm_V5$/i, bx, 0, bz, byaw, bs, bs, bs, false);
      }
      horizonScene.destroy();
    }

    if (canopyScene) canopyScene.destroy();

    // D. Shoreline Amphitheatre Tensile Bowl & Monument Sign
    if (landmarksScene) {
      cloneExtractedNode(landmarksScene, /^Shoreline_Tensile_Bowl_V2$/i, 12, 0.2, -208, 0, 1.12, 1.12, 1.12, !isMobile);
      cloneExtractedNode(landmarksScene, /^Shoreline_Monument_Sign_V2$/i, 3.6, 0.04, -179.8, 16, 0.76, 0.76, 0.76, false);
      landmarksScene.destroy();
    }

    // E. Stevens Creek Bridge (over the river!), Jump Ramps, Cafes & SWAYING ORNAMENTAL GRASS PLUMES!
    if (propsScene) {
      const bridgeYaw = (Math.atan2(34.0, 72.0) * 180) / Math.PI;
      cloneExtractedNode(propsScene, /^Stevens_Creek_Bridge_V6$/i, 35.0, -0.15, -122.0, bridgeYaw, 1, 1, 1, !isMobile);
      cloneExtractedNode(propsScene, /^Campus_Jump_Ramp_V6$/i, -92.0, 0.02, 76.0, -90, 1, 1, 1, !isMobile);
      cloneExtractedNode(propsScene, /^Campus_Jump_Ramp_V6$/i, 156.0, 0.02, 32.0, 0, 1.12, 1.15, 1.12, !isMobile);
      cloneExtractedNode(propsScene, /^Campus_Landing_Ramp_V8$/i, 156.0, 0.02, 14.3, 0, 1.05, 1.05, 1.05, false);

      const cafeSpots = [
        [-18, 118, 15],
        [18, 118, -15],
        [146, 52, 90],
        [146, 6, 90],
        [-106, -38, 30],
        [-106, 86, -40],
      ];
      for (const [cx, cz, cyaw] of cafeSpots) {
        cloneExtractedNode(propsScene, /^Campus_Umbrella_Cafe_Set_V6$/i, cx, 0.04, cz, cyaw, 1, 1, 1, false);
      }
      cloneExtractedNode(propsScene, /^Campus_Snack_Cart_V6$/i, -26, 0.04, 62, 40, 1, 1, 1, false);
      cloneExtractedNode(propsScene, /^Campus_Snack_Cart_V6$/i, 146, 0.04, 62, -90, 1, 1, 1, false);

      // RESTORED SWAYING CAMPUS GRASS PLUMES & COASTAL SHRUBS along roadsides, riverbanks & plazas!
      const grassPlumeSpots: Array<[number, number, number, number]> = [
        [-12, 54, 15, 1.35],
        [12, 54, 110, 1.35],
        [-18, 44, 40, 1.4],
        [18, 44, 160, 1.4],
        [-28, 66, 20, 1.3],
        [28, 66, 80, 1.3],
        [-50, 66, 140, 1.45],
        [50, 66, 210, 1.45],
        [-74, 66, 55, 1.35],
        [74, 66, 175, 1.35],
        [-22, 86, 90, 1.4],
        [22, 86, 260, 1.4],
        [-68, 86, 30, 1.35],
        [68, 86, 150, 1.35],
        [-14, 108, 70, 1.3],
        [14, 108, 220, 1.3],
        [-30, -8, 15, 1.4],
        [30, -8, 125, 1.4],
        [-64, -8, 45, 1.35],
        [64, -8, 195, 1.35],
        // Riverbanks around Stevens Creek Bridge
        [14, -104, 25, 1.55],
        [26, -102, 85, 1.5],
        [54, -108, 145, 1.55],
        [68, -118, 210, 1.6],
        [10, -134, 40, 1.5],
        [48, -142, 160, 1.55],
        [88, -134, 95, 1.5],
        [122, -138, 200, 1.6],
        [-14, -116, 60, 1.5],
        // Bay View Waterfront shore grass
        [164, 58, 10, 1.5],
        [164, 34, 120, 1.5],
        [164, 8, 210, 1.5],
        [164, -22, 75, 1.5],
        [164, -52, 170, 1.5],
        // Registon Square approach gardens
        [-94, -92, 30, 1.45],
        [-104, -90, 110, 1.45],
        [-114, -90, 210, 1.45],
        [-92, -116, 45, 1.45],
        [-132, -88, 155, 1.45],
      ];

      for (let i = 0; i < grassPlumeSpots.length; i++) {
        const [gx, gz, gyaw, gs] = grassPlumeSpots[i];
        const pat = i % 3 === 0 ? /^Shrub_Coastal_Cluster_V6$/i : /^Ornamental_Grass_Plume_V6$/i;
        const gEnt = cloneExtractedNode(propsScene, pat, gx, 0.02, gz, gyaw, gs, gs, gs, false);
        if (gEnt) {
          registerSwayingNode(gEnt, i % 3 === 0 ? 1.8 : 4.2, 1.6 + (i % 5) * 0.22);
        }
      }

      propsScene.destroy();
    }

    // F. LUSH BOTANICAL FOREST: 78 Real Coast Live Oaks & Coast Redwoods WITH GENTLY SWAYING LEAVES!
    if (treesScene) {
      const treePlacements: Array<{ type: 'oak' | 'redwood'; x: number; z: number; s: number; yaw: number }> = [
        { type: 'oak', x: -24, z: 62, s: 1.05, yaw: 15 },
        { type: 'oak', x: 24, z: 62, s: 1.02, yaw: 110 },
        { type: 'redwood', x: -34, z: 32, s: 1.12, yaw: 40 },
        { type: 'redwood', x: 34, z: 32, s: 1.15, yaw: 160 },
        { type: 'oak', x: -34, z: 16, s: 1.0, yaw: 20 },
        { type: 'oak', x: 34, z: 16, s: 1.05, yaw: 135 },
        { type: 'oak', x: -24, z: -2, s: 1.02, yaw: 200 },
        { type: 'oak', x: 24, z: -2, s: 1.08, yaw: 75 },
        { type: 'redwood', x: -16, z: 96, s: 1.05, yaw: 15 },
        { type: 'redwood', x: 16, z: 96, s: 1.08, yaw: 140 },
        { type: 'oak', x: -36, z: 86, s: 1.05, yaw: 20 },
        { type: 'oak', x: -58, z: 86, s: 1.0, yaw: 120 },
        { type: 'oak', x: -84, z: 86, s: 1.12, yaw: 90 },
        { type: 'redwood', x: -102, z: 86, s: 1.08, yaw: 40 },
        { type: 'oak', x: -144, z: 86, s: 1.06, yaw: 185 },
        { type: 'redwood', x: -176, z: 86, s: 1.15, yaw: 50 },
        { type: 'redwood', x: 36, z: 86, s: 1.06, yaw: 30 },
        { type: 'oak', x: 58, z: 86, s: 1.05, yaw: 140 },
        { type: 'oak', x: 86, z: 86, s: 1.1, yaw: 220 },
        { type: 'redwood', x: 112, z: 86, s: 1.12, yaw: 60 },
        { type: 'oak', x: 136, z: 86, s: 1.04, yaw: 250 },
        { type: 'oak', x: -36, z: 65, s: 1.0, yaw: 75 },
        { type: 'oak', x: -96, z: 65, s: 1.06, yaw: 195 },
        { type: 'oak', x: 36, z: 65, s: 1.04, yaw: 310 },
        { type: 'oak', x: 112, z: 65, s: 1.02, yaw: 45 },
        { type: 'redwood', x: 136, z: 65, s: 1.1, yaw: 165 },
        { type: 'redwood', x: -46, z: 128, s: 1.18, yaw: 12 },
        { type: 'redwood', x: 46, z: 128, s: 1.18, yaw: 88 },
        { type: 'redwood', x: -58, z: 144, s: 1.22, yaw: 140 },
        { type: 'redwood', x: 58, z: 144, s: 1.2, yaw: 220 },
        { type: 'oak', x: -32, z: 104, s: 1.0, yaw: 195 },
        { type: 'oak', x: 32, z: 104, s: 1.0, yaw: 60 },
        { type: 'oak', x: -138, z: 126, s: 1.12, yaw: 35 },
        { type: 'redwood', x: 148, z: 118, s: 1.15, yaw: 175 },
        { type: 'oak', x: -138, z: 106, s: 1.1, yaw: 45 },
        { type: 'redwood', x: -100, z: 106, s: 1.08, yaw: 130 },
        { type: 'oak', x: -138, z: 64, s: 1.06, yaw: 215 },
        { type: 'redwood', x: -138, z: 36, s: 1.14, yaw: 85 },
        { type: 'oak', x: -138, z: 6, s: 1.04, yaw: 310 },
        { type: 'oak', x: -102, z: 36, s: 1.08, yaw: 15 },
        { type: 'oak', x: -102, z: 6, s: 1.02, yaw: 190 },
        { type: 'redwood', x: -186, z: 54, s: 1.2, yaw: 42 },
        { type: 'redwood', x: -186, z: -2, s: 1.18, yaw: 132 },
        { type: 'oak', x: -136, z: -38, s: 1.08, yaw: 210 },
        { type: 'redwood', x: -98, z: -66, s: 1.12, yaw: 300 },
        { type: 'oak', x: -138, z: -74, s: 1.06, yaw: 65 },
        { type: 'oak', x: -52, z: -76, s: 1.08, yaw: 25 },
        { type: 'oak', x: -56, z: -30, s: 1.04, yaw: 70 },
        { type: 'oak', x: -94, z: -30, s: 1.06, yaw: 155 },
        { type: 'redwood', x: -24, z: -32, s: 1.12, yaw: 245 },
        { type: 'redwood', x: 34, z: -32, s: 1.14, yaw: 145 },
        { type: 'oak', x: 96, z: -32, s: 1.06, yaw: 260 },
        { type: 'oak', x: 132, z: -32, s: 1.05, yaw: 110 },
        { type: 'oak', x: -38, z: -6, s: 1.02, yaw: 45 },
        { type: 'oak', x: 38, z: -6, s: 1.05, yaw: 215 },
        { type: 'oak', x: 116, z: -6, s: 1.04, yaw: 330 },
        { type: 'oak', x: -18, z: -68, s: 1.04, yaw: 170 },
        { type: 'oak', x: 24, z: -72, s: 1.06, yaw: 50 },
        { type: 'redwood', x: -18, z: -98, s: 1.14, yaw: 95 },
        { type: 'redwood', x: 18, z: -98, s: 1.16, yaw: 210 },
        { type: 'oak', x: 64, z: -98, s: 1.08, yaw: 35 },
        { type: 'redwood', x: 138, z: -56, s: 1.14, yaw: 30 },
        { type: 'redwood', x: 142, z: -102, s: 1.18, yaw: 145 },
        { type: 'oak', x: 138, z: 42, s: 1.04, yaw: 90 },
        { type: 'oak', x: 138, z: 12, s: 1.08, yaw: 220 },
        { type: 'redwood', x: 174, z: 86, s: 1.15, yaw: 65 },
        { type: 'redwood', x: 174, z: -68, s: 1.18, yaw: 195 },
        { type: 'redwood', x: -12, z: -158, s: 1.18, yaw: 15 },
        { type: 'redwood', x: 44, z: -162, s: 1.14, yaw: 105 },
        { type: 'oak', x: -24, z: -178, s: 1.12, yaw: 240 },
        { type: 'oak', x: 48, z: -184, s: 1.1, yaw: 75 },
        { type: 'redwood', x: 76, z: -152, s: 1.16, yaw: 120 },
        { type: 'oak', x: -162, z: 142, s: 1.15, yaw: 88 },
        { type: 'redwood', x: 154, z: 152, s: 1.2, yaw: 190 },
        { type: 'oak', x: -94, z: -122, s: 1.1, yaw: 55 },
        { type: 'redwood', x: -92, z: -162, s: 1.18, yaw: 270 },
      ];
      for (const t of treePlacements) {
        const pat = t.type === 'redwood' ? /^Tree_CoastRedwood_V4$/i : /^Tree_CoastLiveOak_V4$/i;
        const treeEnt = cloneExtractedNode(treesScene, pat, t.x, 0, t.z, t.yaw, t.s, t.s, t.s, false);
        if (treeEnt) {
          // Gently sway ONLY the foliage crowns in the wind (trunk stays rooted!)
          const crown = findChildByPattern(treeEnt, /FoliageCrown/i);
          if (crown) {
            registerSwayingNode(crown, t.type === 'redwood' ? 1.55 : 2.15, 1.05 + (swayingFoliage.length % 5) * 0.14);
          } else {
            registerSwayingNode(treeEnt, 1.35, 1.1);
          }
        }
      }
      treesScene.destroy();
    }

    // G. Android Lawn Sculptures
    if (androidScene) {
      cloneExtractedNode(androidScene, /^Bugdroid_V2$/i, -118, 0.05, 96, 0, 1.22, 1.22, 1.22, !isMobile);
      const desserts = [
        ['Statue_Donut_V2', -127.5, 98.5, 26, 1.18],
        ['Statue_Cupcake_V2', -104.6, 98.5, -20, 1.22],
        ['Statue_IceCreamSandwich_V2', -129.0, 88.5, 35, 1.2],
        ['Statue_Lollipop_V2', -104.8, 89.2, -30, 1.2],
        ['Statue_Gingerbread_V2', -125.2, 105.5, 10, 1.18],
        ['Statue_KitKat_V2', -121.6, 104.8, 8, 1.18],
      ] as const;
      for (const [nm, x, z, yaw, s] of desserts) {
        cloneExtractedNode(androidScene, new RegExp(`^${nm}$`, 'i'), x, 0.05, z, yaw, s, s, s, false);
      }
      androidScene.destroy();
    }

    // H. Bronze Stan T-Rex Statue
    if (stanScene) {
      cloneExtractedNode(stanScene, /^Stan_Plinth_V5$/i, -118, 0.04, -50, 0, 1, 1, 1, false);
      cloneExtractedNode(stanScene, /^Stan_Body_V5$/i, -118, 0.48, -50, 18, 1, 1, 1, !isMobile);
      stanScene.destroy();
    }

    // I. Modern Street Lamps along Boulevards
    if (envV3Scene) {
      const lampSpots = [
        [-10, 96, 90],
        [10, 96, -90],
        [-10, 62, 90],
        [10, 62, -90],
        [-38, 67, 0],
        [38, 67, 0],
        [-84, 67, 0],
        [84, 67, 0],
        [-38, -9, 180],
        [38, -9, 180],
        [146, 36, 90],
        [146, -42, 90],
        [-106, -86, 0],
      ];
      for (const [lx, lz, lyaw] of lampSpots) {
        cloneExtractedNode(envV3Scene, /^Street_Lamp_Modern_V3$/i, lx, 0, lz, lyaw, 1, 1, 1, false);
      }
      envV3Scene.destroy();
    }
  }

  function getTerrainHeight(x: number, z: number): number {
    let h = 0.04;

    // Stevens Creek Arched Bridge deck spanning over the flowing river!
    const bx1 = 52;
    const bz1 = -86;
    const bx2 = 18;
    const bz2 = -158;
    const bdx = bx2 - bx1;
    const bdz = bz2 - bz1;
    const bLenSq = bdx * bdx + bdz * bdz;
    const bt = ((x - bx1) * bdx + (z - bz1) * bdz) / bLenSq;
    if (bt >= 0 && bt <= 1) {
      const px = bx1 + bdx * bt;
      const pz = bz1 + bdz * bt;
      if (Math.hypot(x - px, z - pz) < 4.8) {
        h = Math.max(h, 0.04 + Math.sin(bt * Math.PI) * 1.45);
      }
    }

    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const rad = (r.yawDeg * Math.PI) / 180;
      const fwdX = -Math.sin(rad);
      const fwdZ = -Math.cos(rad);
      const rightX = Math.cos(rad);
      const rightZ = -Math.sin(rad);
      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * fwdX + dz * fwdZ;
      const across = dx * rightX + dz * rightZ;
      const halfL = r.length * 0.5;
      const halfW = r.width * 0.5 + 0.45;
      if (Math.abs(across) <= halfW && along >= -halfL && along <= halfL) {
        const t = (along + halfL) / r.length;
        h = Math.max(h, 0.04 + t * r.height);
      }
    }

    return h;
  }

  /** Spatial 0..1 proximity to Bay View Lake or Stevens Creek River for authentic water audio */
  function getWaterProximity(x: number, z: number): number {
    // Distance to Bay View Lake box [159..237, -69..97]
    const dxBay = Math.max(159 - x, 0, x - 237);
    const dzBay = Math.max(-69 - z, 0, z - 97);
    const dBay = Math.hypot(dxBay, dzBay);

    // Distance to Stevens Creek River bridge segment (-28,-104) -> (138,-148)
    const sx = 138 - -28;
    const sz = -148 - -104;
    const t = Math.max(0, Math.min(1, ((x - -28) * sx + (z - -104) * sz) / (sx * sx + sz * sz)));
    const rx = -28 + sx * t;
    const rz = -104 + sz * t;
    const dRiver = Math.max(0, Math.hypot(x - rx, z - rz) - 12);

    const dMin = Math.min(dBay, dRiver);
    return Math.max(0, Math.min(1, 1 - dMin / 58));
  }

  /** Spatial 0..1 proximity to closest moving AI traffic car for passing-car ambience */
  function getNearestTrafficProximity(x: number, z: number): number {
    let minD = 999;
    for (let i = 0; i < trafficAgents.length; i++) {
      const a = trafficAgents[i];
      const d = Math.hypot(x - a.x, z - a.z);
      if (d < minD) minD = d;
    }
    return Math.max(0, Math.min(1, 1 - minD / 36));
  }

  function setTimeOfDay(mode: TimeOfDay, camera?: pc.CameraComponent | null): void {
    hdrEnv.apply(mode, camera);
  }

  function update(
    dt: number,
    elapsedSec: number,
    playerPos: pc.Vec3,
    pedestrians?: Array<{ x: number; z: number }>
  ): void {
    for (let i = 0; i < pinwheelRotors.length; i++) {
      pinwheelRotors[i].rotateLocal(0, 0, dt * (58 + i * 14));
    }

    // Gently scroll shimmering water ripples along the river & lake!
    for (let i = 0; i < animatedWaters.length; i++) {
      const wm = animatedWaters[i];
      wm.diffuseMapOffset.set(
        (elapsedSec * (i === 0 ? 0.014 : 0.032)) % 1,
        (elapsedSec * (i === 0 ? 0.018 : 0.095)) % 1
      );
      wm.update();
    }

    // Gently sway tree leaves & ornamental grass plumes in the breeze!
    for (let i = 0; i < swayingFoliage.length; i++) {
      const s = swayingFoliage[i];
      const w1 = Math.sin(elapsedSec * s.speed + s.phase) * s.ampDeg;
      const w2 = Math.cos(elapsedSec * (s.speed * 0.72) + s.phase * 1.4) * (s.ampDeg * 0.65);
      s.node.setLocalEulerAngles(s.baseX + w1, s.baseY, s.baseZ + w2);
    }

    // Natural Intelligent AI Road Traffic:
    // - Smooth curved turns & circular Tashkent Roundabout arcs
    // - Looks ahead to slow down into curves & physically steer front wheels
    // - Yields/brakes cleanly behind other traffic cars, player car & crossing pedestrians
    // - Physically jolts, dents & briefly pauses when rammed, then smoothly rejoins its lane!
    for (let i = 0; i < trafficAgents.length; i++) {
      const agent = trafficAgents[i];
      const yawRad = (agent.yaw * Math.PI) / 180;
      const fwdX = -Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);

      // 1. Apply crash slide/jolt physics & smooth lane recovery
      if (agent.stunTimer > 0) {
        agent.stunTimer = Math.max(0, agent.stunTimer - dt);
      }
      if (Math.hypot(agent.knockVx, agent.knockVz) > 0.05) {
        agent.offsetX += agent.knockVx * dt;
        agent.offsetZ += agent.knockVz * dt;
        const damp = Math.exp(-5.2 * dt);
        agent.knockVx *= damp;
        agent.knockVz *= damp;
      }
      if (Math.abs(agent.knockYawVel) > 0.2) {
        agent.knockYaw += agent.knockYawVel * dt;
        agent.knockYawVel *= Math.exp(-5.5 * dt);
      }
      // Clamp lateral crash drift so AI doesn't get flung permanently off the map
      const offLen = Math.hypot(agent.offsetX, agent.offsetZ);
      if (offLen > 6.5) {
        agent.offsetX *= 6.5 / offLen;
        agent.offsetZ *= 6.5 / offLen;
      }

      // 2. Look ahead along road spline for curve anticipation!
      const curDist = agent.phase * agent.totalLen;
      const aheadNear = sampleRouteAtDist(agent.route, agent.segLengths, agent.totalLen, curDist + 6.0);
      const aheadFar = sampleRouteAtDist(agent.route, agent.segLengths, agent.totalLen, curDist + 14.5);
      const curveTurnDeg = ((aheadFar.yawDeg - aheadNear.yawDeg + 540) % 360) - 180;
      const curveSeverity = Math.min(1, Math.abs(curveTurnDeg) / 48);

      // Natural speed profile: slow down nicely before corners/roundabout, cruise on straights
      let targetSpeed = agent.baseSpeed * (1 - curveSeverity * 0.44);
      if (agent.stunTimer > 0) {
        targetSpeed = 0;
      }

      // 3. Yield / Brake naturally for the Player (in car or on foot) ahead in our lane cone
      const pDx = playerPos.x - agent.x;
      const pDz = playerPos.z - agent.z;
      const pFwd = pDx * fwdX + pDz * fwdZ;
      const pLat = Math.abs(pDx * rightX + pDz * rightZ);
      if (pFwd > 1.2 && pFwd < 15.0 && pLat < 3.4) {
        const factor = Math.max(0, (pFwd - 6.6) / 8.4);
        targetSpeed = Math.min(targetSpeed, agent.baseSpeed * factor);
      }

      // 4. Maintain safe following distance behind OTHER AI traffic cars ahead!
      for (let j = 0; j < trafficAgents.length; j++) {
        if (i === j) continue;
        const other = trafficAgents[j];
        const oDx = other.x - agent.x;
        const oDz = other.z - agent.z;
        const oFwd = oDx * fwdX + oDz * fwdZ;
        const oLat = Math.abs(oDx * rightX + oDz * rightZ);
        if (oFwd > 1.0 && oFwd < 16.5 && oLat < 3.1) {
          const factor = Math.max(0, (oFwd - 7.4) / 9.1);
          targetSpeed = Math.min(targetSpeed, Math.min(other.curSpeed + 0.6, agent.baseSpeed * factor));
        }
      }

      // 5. Gently yield for pedestrians near the road ahead
      if (pedestrians) {
        for (let k = 0; k < pedestrians.length; k++) {
          const ped = pedestrians[k];
          const dx = ped.x - agent.x;
          const dz = ped.z - agent.z;
          const f = dx * fwdX + dz * fwdZ;
          const l = Math.abs(dx * rightX + dz * rightZ);
          if (f > 1.0 && f < 10.5 && l < 2.6) {
            targetSpeed = Math.min(targetSpeed, agent.baseSpeed * Math.max(0, (f - 4.2) / 6.3));
          }
        }
      }

      // Smooth human-like acceleration & braking
      const rate = targetSpeed < agent.curSpeed ? 5.8 : 2.6;
      agent.curSpeed += (targetSpeed - agent.curSpeed) * Math.min(1, dt * rate);
      if (agent.curSpeed < 0.05 && targetSpeed < 0.05) agent.curSpeed = 0;

      // Gently steer back toward road centerline once unstunned and moving
      if (agent.stunTimer <= 0 && agent.curSpeed > 0.5) {
        const rec = Math.exp(-1.4 * dt);
        agent.offsetX *= rec;
        agent.offsetZ *= rec;
        agent.knockYaw *= Math.exp(-2.2 * dt);
      }

      // Advance smoothly along the curved road loop
      agent.phase = (agent.phase + (agent.curSpeed * dt) / agent.totalLen) % 1;
      const onRoute = sampleRouteAtDist(agent.route, agent.segLengths, agent.totalLen, agent.phase * agent.totalLen);
      const lookPt = sampleRouteAtDist(agent.route, agent.segLengths, agent.totalLen, agent.phase * agent.totalLen + 4.8);

      const wx = onRoute.x + agent.offsetX;
      const wz = onRoute.z + agent.offsetZ;
      agent.x = wx;
      agent.z = wz;

      // Smooth heading interpolation toward look-ahead target (zero jarring angle snaps!)
      const desiredYaw =
        (Math.atan2(-(lookPt.x - wx), -(lookPt.z - wz)) * 180) / Math.PI + agent.knockYaw;
      const yawDiff = ((desiredYaw - agent.yaw + 540) % 360) - 180;
      const turnLerp = agent.curSpeed > 0.3 ? Math.min(1, dt * 6.5) : Math.min(1, dt * 2.5);
      agent.yaw += yawDiff * turnLerp;

      agent.entity.setLocalPosition(wx, getTerrainHeight(wx, wz), wz);
      agent.entity.setLocalEulerAngles(0, agent.yaw, 0);

      // Physically steer front wheels into curves & spin all 4 wheels smoothly!
      const targetSteer = Math.max(-28, Math.min(28, yawDiff * 1.45));
      agent.steerDeg += (targetSteer - agent.steerDeg) * Math.min(1, dt * 9);

      if (agent.wheels.length > 0) {
        if (agent.curSpeed > 0.05) {
          const r = agent.wheels[0].radius || 0.35;
          agent.spinDeg += ((agent.curSpeed * dt) / Math.max(0.22, r)) * (180 / Math.PI);
        }
        for (let w = 0; w < agent.wheels.length; w++) {
          const wh = agent.wheels[w];
          wh.steerPivot.setLocalEulerAngles(0, wh.isFront ? agent.steerDeg : 0, 0);
          wh.spinPivot.setLocalEulerAngles(-agent.spinDeg, 0, 0);
        }
      }

      if (agent.damageRig) {
        agent.damageRig.updateSmoke(dt, agent.curSpeed);
      }
    }
  }

  return {
    root,
    hdrEnv,
    colliders,
    ramps,
    trafficAgents,
    worldRadius: 245,
    tashkentCenter: TASHKENT_CENTER,
    registonCenter: REGISTON_CENTER,
    getTerrainHeight,
    getWaterProximity,
    getNearestTrafficProximity,
    setTimeOfDay,
    update,
    applyTrafficCrash,
    loadCampusAssets,
    loadTashkentGlbUrl,
    loadTashkentGlbFile,
    loadRegistonGlbUrl,
    loadRegistonGlbFile,
    isCustomTashkentLoaded: () => customTashkentLoaded,
    isCustomRegistonLoaded: () => customRegistonLoaded,
    registerTrafficCar,
  };
}
