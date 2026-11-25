import * as pc from 'playcanvas';
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

export interface CheckpointRing {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
  entity: pc.Entity;
  ringMesh: pc.Entity;
}

interface WaymoAgent {
  entity: pc.Entity;
  speed: number;
  phase: number;
  route: Array<{ x: number; z: number }>;
  segLengths: number[];
  totalLen: number;
}

export interface OpenWorldHandle {
  root: pc.Entity;
  hdrEnv: HdrEnvironmentController;
  colliders: WorldBoxCollider[];
  ramps: StuntRamp[];
  checkpoints: CheckpointRing[];
  worldRadius: number;
  tashkentCenter: { x: number; z: number };
  getTerrainHeight: (x: number, z: number) => number;
  setTimeOfDay: (mode: TimeOfDay, camera?: pc.CameraComponent | null) => void;
  update: (dt: number, elapsedSec: number, playerPos: pc.Vec3) => number;
  resetCheckpoints: () => void;
  loadCampusAssets: (
    tashkentUrl?: string | null,
    onProgress?: (label: string, pct: number) => void
  ) => Promise<void>;
  loadTashkentGlbUrl: (url: string, name?: string) => Promise<boolean>;
  loadTashkentGlbFile: (file: File) => Promise<boolean>;
  isCustomTashkentLoaded: () => boolean;
}

// ============================================================================
// Crisp Procedural PBR Surface Textures (Asphalt, Granite Pavers, Lawn Grass)
// ============================================================================
function makeCanvasTexture(
  device: pc.GraphicsDevice,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const tex = new pc.Texture(device, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: Math.min(8, device.maxAnisotropy || 4),
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    srgb: true,
  });
  tex.setSource(canvas);
  return tex;
}

function createAsphaltMaterial(device: pc.GraphicsDevice, withBikeLane: boolean): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, (ctx, s) => {
    ctx.fillStyle = '#2d323a';
    ctx.fillRect(0, 0, s, s);
    // Fine asphalt aggregate grain
    for (let i = 0; i < 4200; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 19341.123) % 1;
      const v = 36 + (i % 24);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(Math.abs(x) * s, Math.abs(y) * s, 2, 2);
    }
    // Subtle wheel tire tracks
    ctx.fillStyle = 'rgba(18, 22, 28, 0.24)';
    ctx.fillRect(s * 0.24, 0, s * 0.16, s);
    ctx.fillRect(s * 0.6, 0, s * 0.16, s);

    // Side edge white lines
    ctx.fillStyle = '#e8edf4';
    ctx.fillRect(s * 0.04, 0, 5, s);
    ctx.fillRect(s * 0.96 - 5, 0, 5, s);

    // Optional green California protected bike lanes on shoulders
    if (withBikeLane) {
      ctx.fillStyle = 'rgba(42, 148, 86, 0.72)';
      ctx.fillRect(s * 0.055, 0, s * 0.065, s);
      ctx.fillRect(s * 0.88, 0, s * 0.065, s);
      ctx.fillStyle = '#edf2f7';
      ctx.fillRect(s * 0.125, 0, 3, s);
      ctx.fillRect(s * 0.875 - 3, 0, 3, s);
    }

    // Center dashed yellow double-line
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
  const tex = makeCanvasTexture(device, 512, (ctx, s) => {
    ctx.fillStyle = '#4e7942';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6500; i++) {
      const x = Math.abs((Math.sin(i * 19.19) * 31415.9) % 1) * s;
      const y = Math.abs((Math.cos(i * 41.37) * 27182.8) % 1) * s;
      const g = 104 + (i % 34);
      ctx.fillStyle = `rgb(${Math.round(g * 0.64)},${g},${Math.round(g * 0.52)})`;
      ctx.fillRect(x, y, 3, 3);
    }
  });
  const m = new pc.StandardMaterial();
  m.diffuseMap = tex;
  m.diffuseMapTiling = new pc.Vec2(72, 72);
  m.useMetalness = true;
  m.metalness = 0.0;
  m.gloss = 0.12;
  m.update();
  return m;
}

function createPaverMaterial(device: pc.GraphicsDevice, tileX: number, tileY: number): pc.StandardMaterial {
  const tex = makeCanvasTexture(device, 512, (ctx, s) => {
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

function createWaterMaterial(): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse.set(0.08, 0.34, 0.52);
  m.useMetalness = true;
  m.metalness = 0.25;
  m.gloss = 0.92;
  m.update();
  return m;
}

// ============================================================================
// Architectural Tashkent TV Tower Fallback (Sleek Sculpted Tripod + Spire)
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

  const steelWhite = mkMat(0.9, 0.92, 0.95, 0.45, 0.62);
  const steelSilver = mkMat(0.76, 0.8, 0.86, 0.72, 0.76);
  const marbleBase = mkMat(0.86, 0.83, 0.77, 0.12, 0.48);
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

  // Stepped circular marble podium + entrance rotunda
  addCyl('Tower_Podium_1', [0, 0.55, 0], 17.5, 1.1, 17.5, marbleBase);
  addCyl('Tower_Podium_2', [0, 1.5, 0], 13.5, 1.2, 13.5, marbleBase);
  addCyl('Tower_Foyer_Glass', [0, 3.6, 0], 10.6, 3.4, 10.6, glassBlue);
  addCyl('Tower_Foyer_Crown', [0, 5.5, 0], 11.4, 0.65, 11.4, steelWhite);

  // Central core shaft rising 52m
  addCyl('Tower_Core_Lower', [0, 19.5, 0], 4.2, 28.0, 4.2, steelWhite);
  addCyl('Tower_Core_Upper', [0, 43.0, 0], 3.1, 22.0, 3.1, steelWhite);

  // Signature Tashkent TV Tower 3 Inclined Tripod Lattice Buttresses (120° apart!)
  for (let i = 0; i < 3; i++) {
    const ang = (i * 120 * Math.PI) / 180;
    const armHolder = new pc.Entity(`TripodLeg_${i}`);
    armHolder.setLocalEulerAngles(0, i * 120, 0);
    tower.addChild(armHolder);

    // Tapered inclined outer leg leaning inward from r=9.8m at base to r=2.2m at y=28m
    const leg = new pc.Entity(`LegShaft_${i}`);
    leg.setLocalPosition(0, 14.2, 6.2);
    leg.setLocalEulerAngles(-15.5, 0, 0);
    leg.setLocalScale(1.85, 29.0, 1.45);
    leg.addComponent('render', { type: 'cylinder', material: steelSilver, castShadows: true, receiveShadows: true });
    armHolder.addChild(leg);

    // Fin rib bracing
    const rib = new pc.Entity(`LegRib_${i}`);
    rib.setLocalPosition(0, 10.5, 4.4);
    rib.setLocalEulerAngles(-24, 0, 0);
    rib.setLocalScale(0.6, 17.0, 1.8);
    rib.addComponent('render', { type: 'cylinder', material: steelWhite, castShadows: true });
    armHolder.addChild(rib);

    // Decorative base anchor foot
    const footX = Math.sin(ang) * 9.8;
    const footZ = Math.cos(ang) * 9.8;
    addCyl(`LegFoot_${i}`, [footX, 1.2, footZ], 3.0, 2.4, 3.0, marbleBase);
  }

  // Iconic Mid-Height Observation Deck & Rotating "Koinot" Restaurant Pod (y = 28..37m)
  addCyl('Pod_Underside', [0, 27.2, 0], 8.6, 1.6, 8.6, steelSilver);
  addCyl('Pod_GoldRing_Lower', [0, 28.4, 0], 10.8, 0.55, 10.8, goldAccent);
  addCyl('Pod_ObservationGlass', [0, 30.8, 0], 11.4, 4.1, 11.4, glassBlue);
  addCyl('Pod_MidCollar', [0, 33.1, 0], 11.8, 0.7, 11.8, steelWhite);
  addCyl('Pod_RestaurantGlass', [0, 35.1, 0], 10.2, 3.3, 10.2, glassBlue);
  addCyl('Pod_GoldRing_Upper', [0, 37.0, 0], 10.5, 0.55, 10.5, goldAccent);
  addCyl('Pod_RoofCap', [0, 38.4, 0], 8.0, 2.2, 8.0, steelSilver);

  // Upper Broadcast Galleries (y = 48..55m)
  addCyl('UpperDeck_1', [0, 49.0, 0], 6.2, 2.0, 6.2, steelWhite);
  addCyl('UpperDeck_Glass', [0, 51.0, 0], 5.6, 2.0, 5.6, glassBlue);
  addCyl('UpperDeck_Gold', [0, 52.3, 0], 6.4, 0.45, 6.4, goldAccent);

  // Slender Tapered Antenna Spire (y = 53..84m)
  addCyl('Spire_Stage1', [0, 58.0, 0], 1.75, 11.0, 1.75, steelSilver);
  addCyl('Spire_Stage2', [0, 67.5, 0], 1.05, 10.0, 1.05, steelWhite);
  addCyl('Spire_Stage3', [0, 76.5, 0], 0.52, 9.5, 0.52, steelSilver);
  addCyl('Spire_Needle', [0, 82.8, 0], 0.2, 4.5, 0.2, steelWhite);

  // Red Aviation Warning Beacon at peak
  const beacon = new pc.Entity('Tashkent_PeakBeacon');
  beacon.setLocalPosition(0, 85.2, 0);
  beacon.setLocalScale(0.75, 0.75, 0.75);
  beacon.addComponent('render', { type: 'sphere', material: beaconRed, castShadows: false });
  tower.addChild(beacon);

  return tower;
}

// ============================================================================
// Helper: Load GLB ContainerResource & Extract Named Sub-Entities Cleanly
// ============================================================================
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
  for (const rc of comps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible) continue;
      if (!box) box = mi.aabb.clone();
      else box.add(mi.aabb);
    }
  }
  return box;
}

function tuneWorldEntityShadows(entity: pc.Entity, castShadows: boolean, receiveShadows = true): void {
  const comps = entity.findComponents('render') as pc.RenderComponent[];
  for (const rc of comps) {
    rc.castShadows = castShadows;
    rc.receiveShadows = receiveShadows;
  }
}

// ============================================================================
// Build Full Mountain View Open Campus + Central Tashkent TV Tower Plaza
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
  const checkpoints: CheckpointRing[] = [];
  const waymoAgents: WaymoAgent[] = [];
  const pinwheelRotors: pc.Entity[] = [];

  const TASHKENT_CENTER = { x: 0, z: 29 };

  // 1. Expansive Campus Lawn Terrain Plane (zero void!)
  const grassMat = createGrassMaterial(device);
  const ground = new pc.Entity('CampusGrassTerrain');
  ground.setLocalPosition(0, -0.02, 0);
  ground.setLocalScale(960, 1, 960);
  ground.addComponent('render', {
    type: 'plane',
    material: grassMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(ground);

  // 2. Authentic Mountain View Campus Road Network (from contract.js)
  const asphaltBikeMat = createAsphaltMaterial(device, true);
  const asphaltPlainMat = createAsphaltMaterial(device, false);
  const paverMat = createPaverMaterial(device, 8, 8);
  const plazaPaverMat = createPaverMaterial(device, 12, 12);
  const waterMat = createWaterMaterial();

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

  // Main Boulevards
  addRoadSegment('Charleston_Rd', -195, 76, 164, 76, 14.5, 0.03, asphaltBikeMat);
  addRoadSegment('Amphitheatre_Pkwy', -195, -18, 164, -18, 14.5, 0.03, asphaltBikeMat);
  addRoadSegment('Gradient_Dropoff', -56, 116, 56, 116, 11.0, 0.035, plazaPaverMat, false);
  addRoadSegment('North_Creek_Trail', 0, -86, 164, -86, 12.0, 0.03, asphaltBikeMat);
  addRoadSegment('Shoreline_Blvd_South', 0, 122, 0, 52, 14.5, 0.032, asphaltBikeMat);
  addRoadSegment('Shoreline_Blvd_North', 0, 6, 0, -86, 14.5, 0.032, asphaltBikeMat);
  addRoadSegment('West_Campus_Ave', -118, 92, -118, -18, 13.5, 0.03, asphaltBikeMat);
  addRoadSegment('Stan_Courtyard_Walk', -118, -18, -118, -72, 10.5, 0.036, paverMat, false);
  addRoadSegment('Bay_View_Promenade', 156, 112, 156, -86, 16.5, 0.036, paverMat, false);
  addRoadSegment('Shoreline_Esplanade', 18, -158, 12, -192, 11.0, 0.036, paverMat, false);

  // Intersection Junction Pads (clean asphalt disks so road crossings never z-fight)
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

  // Grand Central Plaza & Roundabout for TASHKENT TV TOWER at (0, 0, 29)
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

  const plazaStone = new pc.Entity('Tashkent_Central_Plaza_Stone');
  plazaStone.setLocalPosition(TASHKENT_CENTER.x, 0.052, TASHKENT_CENTER.z);
  plazaStone.setLocalScale(36, 0.04, 36);
  plazaStone.addComponent('render', {
    type: 'cylinder',
    material: plazaPaverMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(plazaStone);

  // Decorative reflecting pool ring around the Tashkent TV Tower base
  const plazaPool = new pc.Entity('Tashkent_Plaza_ReflectingPool');
  plazaPool.setLocalPosition(TASHKENT_CENTER.x, 0.068, TASHKENT_CENTER.z);
  plazaPool.setLocalScale(22.5, 0.03, 22.5);
  plazaPool.addComponent('render', {
    type: 'cylinder',
    material: waterMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(plazaPool);

  // Bay View Waterfront Retention Basin Pond (east of Bay View Promenade)
  const bayPond = new pc.Entity('BayView_RetentionBasin');
  bayPond.setLocalPosition(200, -0.01, 14);
  bayPond.setLocalScale(78, 1, 152);
  bayPond.addComponent('render', {
    type: 'plane',
    material: waterMat,
    castShadows: false,
    receiveShadows: true,
  });
  root.addChild(bayPond);

  // Gradient Canopy Visitor Forecourt Paver Apron
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

  // Android Lawn & Stan Courtyard Paver Pads
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

  // 3. Tashkent TV Tower Container right at the center of the main plaza (0, 0, 29)
  const tashkentHolder = new pc.Entity('Tashkent_TV_Tower_Holder');
  tashkentHolder.setLocalPosition(TASHKENT_CENTER.x, 0.07, TASHKENT_CENTER.z);
  root.addChild(tashkentHolder);

  let activeTashkentModel: pc.Entity = buildArchitecturalTashkentTower();
  let customTashkentLoaded = false;
  tashkentHolder.addChild(activeTashkentModel);

  // Solid base collider for Tashkent TV Tower core so player/cars drive around its plaza cleanly
  colliders.push({
    minX: TASHKENT_CENTER.x - 8.5,
    maxX: TASHKENT_CENTER.x + 8.5,
    minZ: TASHKENT_CENTER.z - 8.5,
    maxZ: TASHKENT_CENTER.z + 8.5,
  });

  // Campus building footprint colliders (matching real GLB office wings & Gradient Canopy)
  const officeSpecs: Array<{ name: string; cx: number; cz: number; wx: number; wz: number; yaw: number }> = [
    { name: 'Visitor_Timber_West', cx: -156, cz: 104, wx: 32, wz: 20, yaw: 0 },
    { name: 'Charleston_SW_Studio', cx: -66, cz: 46, wx: 44, wz: 22, yaw: 0 },
    { name: 'Charleston_SE_Commons', cx: 78, cz: 46, wx: 48, wz: 22, yaw: 0 },
    { name: 'Googleplex_Bldg_40', cx: -162, cz: -52, wx: 36, wz: 24, yaw: 90 },
    { name: 'Googleplex_Bldg_41', cx: -74, cz: -52, wx: 34, wz: 22, yaw: 0 },
    { name: 'Googleplex_Bldg_42', cx: -66, cz: 12, wx: 42, wz: 20, yaw: 0 },
    { name: 'North_Bayshore_Hub', cx: 78, cz: 12, wx: 48, wz: 22, yaw: 0 },
    { name: 'Shoreline_Tech_Pavilion', cx: -32, cz: -54, wx: 32, wz: 20, yaw: 0 },
  ];
  for (const b of officeSpecs) {
    colliders.push({
      minX: b.cx - b.wx * 0.5,
      maxX: b.cx + b.wx * 0.5,
      minZ: b.cz - b.wz * 0.5,
      maxZ: b.cz + b.wz * 0.5,
    });
  }
  // Gradient Canopy collider
  colliders.push({ minX: -38, maxX: 38, minZ: 132, maxZ: 168 });
  // Bay View Pavilions collider
  colliders.push({ minX: 180, maxX: 228, minZ: -44, maxZ: 68 });

  // 4. Campus Exploration Checkpoints (Sleek golden rings at each landmark)
  const ringMat = new pc.StandardMaterial();
  ringMat.diffuse.set(1.0, 0.84, 0.28);
  ringMat.emissive.set(1.0, 0.78, 0.18);
  ringMat.emissiveIntensity = 1.6;
  ringMat.useMetalness = true;
  ringMat.metalness = 0.6;
  ringMat.gloss = 0.85;
  ringMat.update();

  const checkpointDefs = [
    { id: 'cp_tashkent_s', label: 'Tashkent Plaza', x: 0, z: 54 },
    { id: 'cp_tashkent_e', label: 'Tashkent Ring East', x: 24, z: 29 },
    { id: 'cp_tashkent_w', label: 'Tashkent Ring West', x: -24, z: 29 },
    { id: 'cp_canopy', label: 'Gradient Canopy', x: 0, z: 114 },
    { id: 'cp_charleston_w', label: 'Charleston West', x: -64, z: 76 },
    { id: 'cp_android', label: 'Android Lawn', x: -118, z: 86 },
    { id: 'cp_stan', label: 'Stan T-Rex Plaza', x: -118, z: -34 },
    { id: 'cp_amphitheatre', label: 'Amphitheatre Pkwy', x: 40, z: -18 },
    { id: 'cp_bayview_s', label: 'Bay View Promenade', x: 156, z: 58 },
    { id: 'cp_bayview_ramp', label: 'Bay View Jump', x: 156, z: 18 },
    { id: 'cp_bridge', label: 'Stevens Creek Bridge', x: 35, z: -122 },
    { id: 'cp_shoreline', label: 'Shoreline Bowl', x: 14, z: -176 },
  ];

  for (const cp of checkpointDefs) {
    const holder = new pc.Entity(`Checkpoint_${cp.id}`);
    holder.setLocalPosition(cp.x, 1.45, cp.z);
    const torus = new pc.Entity(`CheckpointRing_${cp.id}`);
    torus.setLocalScale(2.8, 0.35, 2.8);
    torus.setLocalEulerAngles(90, 0, 0);
    torus.addComponent('render', {
      type: 'torus',
      material: ringMat,
      castShadows: false,
      receiveShadows: false,
    });
    holder.addChild(torus);
    root.addChild(holder);
    checkpoints.push({
      id: cp.id,
      label: cp.label,
      x: cp.x,
      y: 1.45,
      z: cp.z,
      radius: 4.5,
      collected: false,
      entity: holder,
      ringMesh: torus,
    });
  }

  // 5. Dynamic Tashkent TV Tower GLB Loader (models/tashkent.glb or live local upload!)
  async function loadTashkentGlbUrl(url: string, name = 'tashkent.glb'): Promise<boolean> {
    try {
      const resource = await loadContainerUrl(app, url, name);
      const wrapper = new pc.Entity('TashkentTower_CustomGLB');
      const ent = resource.instantiateRenderEntity({
        castShadows: true,
        receiveShadows: true,
      });
      wrapper.addChild(ent);
      tashkentHolder.addChild(wrapper);

      const bounds = computeEntityBounds(wrapper);
      if (bounds) {
        const h = Math.max(0.2, bounds.halfExtents.y * 2);
        const targetHeight = 84.0;
        const sc = targetHeight / h;
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

      tuneWorldEntityShadows(wrapper, true, true);
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

  // 6. Real Campus GLB Environment Loader (Replaces ALL simple boxes with real Mountain View campus!)
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
    tuneWorldEntityShadows(clone, castShadows, true);
    campusGlbRoot.addChild(clone);
    return clone;
  }

  async function loadCampusAssets(
    tashkentUrl?: string | null,
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

    // Load custom tashkent.glb in parallel if present in models/
    const tashkentPromise = tashkentUrl ? loadTashkentGlbUrl(tashkentUrl, 'tashkent.glb') : Promise.resolve(false);

    onProgress?.('Loading Gradient Canopy & Campus Buildings…', 18);
    const [
      canopyScene,
      horizonScene,
      landmarksScene,
      propsScene,
      treesScene,
      androidScene,
      stanScene,
      waymoScene,
      envV3Scene,
    ] = await Promise.all([
      safeLoad('./assets/glb/gradient_canopy_v6.glb', 'gradient_canopy_v6'),
      safeLoad('./assets/glb/campus_horizon_arch_v5.glb', 'campus_horizon_arch_v5'),
      safeLoad('./assets/glb/campus_landmarks_v2.glb', 'campus_landmarks_v2'),
      safeLoad('./assets/glb/props_and_bridge_v6.glb', 'props_and_bridge_v6'),
      safeLoad('./assets/glb/trees_v4.glb', 'trees_v4'),
      safeLoad('./assets/glb/android_statues_v2.glb', 'android_statues_v2'),
      safeLoad('./assets/glb/stan_trex_v5.glb', 'stan_trex_v5'),
      safeLoad('./assets/glb/waymo_gen6_v4.glb', 'waymo_gen6_v4'),
      safeLoad('./assets/glb/campus_environment_v3.glb', 'campus_environment_v3'),
    ]);

    await tashkentPromise;
    onProgress?.('Assembling Mountain View Campus…', 52);

    // A. Gradient Canopy V6 + Bay View Canopies + Campus Office Pavilions V6
    if (canopyScene) {
      const grad = cloneExtractedNode(
        canopyScene,
        /^Gradient_Canopy_Building_V6$/i,
        0,
        0,
        145,
        180,
        1,
        1,
        1,
        true
      );
      if (grad) {
        // Collect pinwheel rotors for gentle wind spin
        const collectRotors = (n: pc.GraphNode) => {
          if (n instanceof pc.Entity && /Pinwheel.*Rotor|Rotor/i.test(n.name || '')) {
            pinwheelRotors.push(n);
          }
          for (const ch of n.children) collectRotors(ch);
        };
        collectRotors(grad);
      }

      // Bay View Dragonscale Waterfront Pavilions
      cloneExtractedNode(canopyScene, /^Bay_View_Canopy_Pavilion_V6$/i, 202, 0.02, 38, -90, 1.0, 1.0, 1.0, !isMobile);
      cloneExtractedNode(canopyScene, /^Bay_View_Canopy_Pavilion_V6$/i, 205, 0.02, -20, -90, 0.84, 0.84, 0.84, !isMobile);

      // Authentic Limestone + Glass Campus Office Pavilions across all 8 campus blocks!
      const officeProto = findChildByPattern(canopyScene, /^Campus_Office_Pavilion_V6$/i);
      if (officeProto) {
        const tempHolder = new pc.Entity('TempOfficeMeasure');
        tempHolder.addChild(officeProto.clone());
        app.root.addChild(tempHolder);
        const ob = computeEntityBounds(tempHolder);
        app.root.removeChild(tempHolder);
        tempHolder.destroy();

        const baseW = ob ? Math.max(4, ob.halfExtents.x * 2) : 28;
        const baseD = ob ? Math.max(4, ob.halfExtents.z * 2) : 18;

        for (const spec of officeSpecs) {
          const sx = spec.wx / baseW;
          const sz = spec.wz / baseD;
          const sy = Math.min(1.25, Math.max(0.85, (sx + sz) * 0.5));
          cloneExtractedNode(
            canopyScene,
            /^Campus_Office_Pavilion_V6$/i,
            spec.cx,
            0,
            spec.cz,
            spec.yaw,
            sx,
            sy,
            sz,
            !isMobile
          );
        }
      }
      canopyScene.destroy();
    }

    // B. Santa Cruz Mountains Horizon Ridgeline & Landscaped Berms
    if (horizonScene) {
      for (const yaw of [0, 90, 180, 270]) {
        cloneExtractedNode(
          horizonScene,
          /^Santa_Cruz_Ridgeline_Arc_V5$/i,
          0,
          -1.5,
          0,
          yaw,
          1.05,
          1.0,
          1.05,
          false
        );
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

    // C. Shoreline Amphitheatre Tensile Bowl & Monument Sign
    if (landmarksScene) {
      cloneExtractedNode(landmarksScene, /^Shoreline_Tensile_Bowl_V2$/i, 12, 0.2, -208, 0, 1.12, 1.12, 1.12, !isMobile);
      cloneExtractedNode(landmarksScene, /^Shoreline_Monument_Sign_V2$/i, 3.6, 0.04, -179.8, 16, 0.76, 0.76, 0.76, false);
      landmarksScene.destroy();
    }

    // D. Stevens Creek Arched Bridge, Jump Ramps, Cafe Umbrellas, Snack Carts, Planters & Boulders
    if (propsScene) {
      const bridgeYaw = (Math.atan2(34.0, 72.0) * 180) / Math.PI;
      cloneExtractedNode(propsScene, /^Stevens_Creek_Bridge_V6$/i, 35.0, -0.25, -122.0, bridgeYaw, 1, 1, 1, !isMobile);

      // Physical Jump Ramps matching ramps[]
      cloneExtractedNode(propsScene, /^Campus_Jump_Ramp_V6$/i, -92.0, 0.02, 76.0, -90, 1, 1, 1, !isMobile);
      cloneExtractedNode(propsScene, /^Campus_Jump_Ramp_V6$/i, 156.0, 0.02, 32.0, 0, 1.12, 1.15, 1.12, !isMobile);
      cloneExtractedNode(propsScene, /^Campus_Landing_Ramp_V8$/i, 156.0, 0.02, 14.3, 0, 1.05, 1.05, 1.05, false);

      // Cafe Umbrellas & Snack Carts around Tashkent Plaza, Gradient Canopy & Bay View
      const cafeSpots = [
        [-17, 46, 20],
        [17, 46, -20],
        [-17, 12, 45],
        [17, 12, -45],
        [-18, 118, 15],
        [18, 118, -15],
        [146, 52, 90],
        [146, 6, 90],
        [-106, -38, 30],
      ];
      for (const [cx, cz, cyaw] of cafeSpots) {
        cloneExtractedNode(propsScene, /^Campus_Umbrella_Cafe_Set_V6$/i, cx, 0.04, cz, cyaw, 1, 1, 1, false);
      }
      cloneExtractedNode(propsScene, /^Campus_Snack_Cart_V6$/i, -19, 0.04, 58, 40, 1, 1, 1, false);
      cloneExtractedNode(propsScene, /^Campus_Snack_Cart_V6$/i, 146, 0.04, 62, -90, 1, 1, 1, false);

      // Decorative Planters & Shrubs around the Tashkent Central Plaza ring
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const px = TASHKENT_CENTER.x + Math.sin(a) * 16.5;
        const pz = TASHKENT_CENTER.z + Math.cos(a) * 16.5;
        cloneExtractedNode(propsScene, /^Campus_Planter_Box_V6$/i, px, 0.05, pz, (a * 180) / Math.PI, 0.9, 0.9, 0.9, false);
      }
      propsScene.destroy();
    }

    // E. Real Botanical Coast Live Oaks & Coast Redwoods (ZERO cone/sphere trees!)
    if (treesScene) {
      const treePlacements: Array<{ type: 'oak' | 'redwood'; x: number; z: number; s: number; yaw: number }> = [
        // Surrounding Tashkent Plaza & N Shoreline Blvd
        { type: 'oak', x: -24, z: 62, s: 1.05, yaw: 15 },
        { type: 'oak', x: 24, z: 62, s: 1.0, yaw: 110 },
        { type: 'redwood', x: -34, z: 32, s: 1.05, yaw: 40 },
        { type: 'redwood', x: 34, z: 32, s: 1.1, yaw: 160 },
        { type: 'oak', x: -26, z: -2, s: 1.0, yaw: 200 },
        { type: 'oak', x: 26, z: -2, s: 1.08, yaw: 75 },
        // Charleston Rd boulevard trees
        { type: 'oak', x: -45, z: 88, s: 1.0, yaw: 20 },
        { type: 'oak', x: -82, z: 88, s: 1.12, yaw: 90 },
        { type: 'redwood', x: 45, z: 88, s: 1.0, yaw: 30 },
        { type: 'oak', x: 92, z: 88, s: 1.05, yaw: 140 },
        { type: 'oak', x: 132, z: 88, s: 1.0, yaw: 250 },
        // Gradient Canopy flank
        { type: 'redwood', x: -46, z: 128, s: 1.15, yaw: 12 },
        { type: 'redwood', x: 46, z: 128, s: 1.15, yaw: 88 },
        { type: 'oak', x: -32, z: 104, s: 0.95, yaw: 195 },
        { type: 'oak', x: 32, z: 104, s: 0.95, yaw: 60 },
        // Android Lawn & Stan T-Rex Park
        { type: 'oak', x: -138, z: 106, s: 1.1, yaw: 45 },
        { type: 'redwood', x: -100, z: 106, s: 1.05, yaw: 130 },
        { type: 'oak', x: -136, z: -38, s: 1.08, yaw: 210 },
        { type: 'redwood', x: -98, z: -66, s: 1.12, yaw: 300 },
        // Amphitheatre Pkwy & North Shoreline
        { type: 'oak', x: -56, z: -32, s: 1.0, yaw: 70 },
        { type: 'redwood', x: 38, z: -34, s: 1.1, yaw: 145 },
        { type: 'oak', x: 96, z: -34, s: 1.05, yaw: 260 },
        { type: 'redwood', x: 138, z: -56, s: 1.12, yaw: 30 },
        { type: 'oak', x: -18, z: -68, s: 1.02, yaw: 170 },
        { type: 'oak', x: 24, z: -72, s: 1.04, yaw: 50 },
        // Bay View Promenade & Shoreline Meadow
        { type: 'oak', x: 138, z: 62, s: 1.0, yaw: 90 },
        { type: 'oak', x: 138, z: 10, s: 1.05, yaw: 220 },
        { type: 'redwood', x: -10, z: -150, s: 1.15, yaw: 15 },
        { type: 'redwood', x: 42, z: -162, s: 1.1, yaw: 105 },
      ];
      const maxTrees = isMobile ? 20 : treePlacements.length;
      for (let i = 0; i < maxTrees; i++) {
        const t = treePlacements[i];
        const pat = t.type === 'redwood' ? /^Tree_CoastRedwood_V4$/i : /^Tree_CoastLiveOak_V4$/i;
        cloneExtractedNode(treesScene, pat, t.x, 0, t.z, t.yaw, t.s, t.s, t.s, false);
      }
      treesScene.destroy();
    }

    // F. Android Lawn Sculptures (Bugdroid + 6 Dessert Statues)
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

    // G. Bronze Stan T-Rex Statue at Googleplex Courtyard
    if (stanScene) {
      cloneExtractedNode(stanScene, /^Stan_Plinth_V5$/i, -118, 0.04, -50, 0, 1, 1, 1, false);
      cloneExtractedNode(stanScene, /^Stan_Body_V5$/i, -118, 0.48, -50, 18, 1, 1, 1, !isMobile);
      stanScene.destroy();
    }

    // H. Modern Campus Street Lamps along main boulevards
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
      ];
      for (const [lx, lz, lyaw] of lampSpots) {
        cloneExtractedNode(envV3Scene, /^Street_Lamp_Modern_V3$/i, lx, 0, lz, lyaw, 1, 1, 1, false);
      }
      envV3Scene.destroy();
    }

    // I. Live Autonomous Waymo Gen6 Traffic Cruisers (3 cars looping campus boulevards!)
    if (waymoScene) {
      const routeA = [
        { x: -114, z: 79.5 },
        { x: 152, z: 79.5 },
        { x: 152, z: -21.5 },
        { x: -114, z: -21.5 },
      ];
      const spawnWaymo = (phase: number, speed: number) => {
        const wEnt = cloneExtractedNode(waymoScene, /^Waymo_Gen6_V4$/i, 0, 0.04, 0, 0, 1, 1, 1, !isMobile);
        if (!wEnt) return;
        const segLengths: number[] = [];
        let totalLen = 0;
        for (let i = 0; i < routeA.length; i++) {
          const a = routeA[i];
          const b = routeA[(i + 1) % routeA.length];
          const l = Math.hypot(b.x - a.x, b.z - a.z);
          segLengths.push(l);
          totalLen += l;
        }
        waymoAgents.push({ entity: wEnt, speed, phase, route: routeA, segLengths, totalLen });
      };
      spawnWaymo(0.08, 9.2);
      spawnWaymo(0.42, 8.6);
      if (!isMobile) spawnWaymo(0.75, 9.0);
      waymoScene.destroy();
    }
  }

  // 7. Terrain + Jump Ramp + Arched Bridge Height Query
  function getTerrainHeight(x: number, z: number): number {
    let h = 0.04;

    // Stevens Creek Arched Bridge corridor: (52, -86) -> (18, -158)
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
      if (Math.hypot(x - px, z - pz) < 4.5) {
        h = Math.max(h, 0.04 + Math.sin(bt * Math.PI) * 1.18);
      }
    }

    // Physical Stunt Jump Ramps
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

  function setTimeOfDay(mode: TimeOfDay, camera?: pc.CameraComponent | null): void {
    hdrEnv.apply(mode, camera);
  }

  function update(dt: number, elapsedSec: number, playerPos: pc.Vec3): number {
    // Gently spin Gradient Canopy origami pinwheels
    for (let i = 0; i < pinwheelRotors.length; i++) {
      pinwheelRotors[i].rotateLocal(0, 0, dt * (58 + i * 14));
    }

    // Move autonomous Waymo traffic smoothly along campus perimeter loop
    for (let i = 0; i < waymoAgents.length; i++) {
      const w = waymoAgents[i];
      w.phase = (w.phase + (w.speed * dt) / w.totalLen) % 1;
      let dist = w.phase * w.totalLen;
      let segIdx = 0;
      while (segIdx < w.segLengths.length - 1 && dist > w.segLengths[segIdx]) {
        dist -= w.segLengths[segIdx];
        segIdx++;
      }
      const a = w.route[segIdx];
      const b = w.route[(segIdx + 1) % w.route.length];
      const t = dist / Math.max(0.01, w.segLengths[segIdx]);
      const wx = a.x + (b.x - a.x) * t;
      const wz = a.z + (b.z - a.z) * t;
      const yawDeg = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI;
      w.entity.setLocalPosition(wx, 0.04, wz);
      w.entity.setLocalEulerAngles(0, yawDeg, 0);
    }

    // Animate & check checkpoints
    let newlyCollected = 0;
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (cp.collected) continue;
      cp.ringMesh.setLocalEulerAngles(90, elapsedSec * 92 + i * 32, 0);
      cp.entity.setLocalPosition(cp.x, cp.y + Math.sin(elapsedSec * 2.4 + i) * 0.16, cp.z);

      const dx = playerPos.x - cp.x;
      const dz = playerPos.z - cp.z;
      if (dx * dx + dz * dz < cp.radius * cp.radius) {
        cp.collected = true;
        cp.entity.enabled = false;
        newlyCollected += 1;
      }
    }
    return newlyCollected;
  }

  function resetCheckpoints(): void {
    for (const cp of checkpoints) {
      cp.collected = false;
      cp.entity.enabled = true;
    }
  }

  return {
    root,
    hdrEnv,
    colliders,
    ramps,
    checkpoints,
    worldRadius: 235,
    tashkentCenter: TASHKENT_CENTER,
    getTerrainHeight,
    setTimeOfDay,
    update,
    resetCheckpoints,
    loadCampusAssets,
    loadTashkentGlbUrl,
    loadTashkentGlbFile,
    isCustomTashkentLoaded: () => customTashkentLoaded,
  };
}
