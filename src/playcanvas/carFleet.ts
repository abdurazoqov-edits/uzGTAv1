import * as pc from 'playcanvas';
import {
  CarLicensePlateRig,
  LicensePlateConfig,
  loadSavedPlateConfig,
  savePlateConfig,
} from './licensePlate';

export interface CarManifestItem {
  id: string;
  fileName: string;
  url: string;
  name: string;
  sizeBytes?: number;
  source?: string;
}

export interface SpecialAssetManifestItem {
  fileName: string;
  url: string;
  sizeBytes?: number;
  source?: string;
}

export interface ModelsManifest {
  version?: number;
  cars: CarManifestItem[];
  character?: SpecialAssetManifestItem | null;
  landmarkTashkent?: SpecialAssetManifestItem | null;
}

export interface WheelRig {
  steerPivot: pc.Entity;
  spinPivot: pc.Entity;
  isFront: boolean;
  radius: number;
}

export interface PlayCanvasCar {
  id: string;
  name: string;
  source: 'models' | 'builtin' | 'local';
  root: pc.Entity;
  tiltPivot: pc.Entity;
  userAdjust: pc.Entity;
  wheels: WheelRig[];
  plateRig: CarLicensePlateRig;
  spawnX: number;
  spawnZ: number;
  spawnYaw: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  flip180: boolean;
  scaleMul: number;
  carWidth: number;
  carLength: number;
}

export interface CarSummary {
  id: string;
  name: string;
  source: 'models' | 'builtin' | 'local';
  flip180: boolean;
  scaleMul: number;
  wheelCount: number;
  plate: LicensePlateConfig;
}

const TARGET_CAR_LENGTH = 4.45;

// Parked right along the sunlit boulevard facing North toward the Tashkent TV Tower at (0, 0, 29)!
const PARKING_BAYS: Array<{ x: number; z: number; yaw: number }> = [
  { x: 0, z: 60, yaw: 0 },
  { x: -6.8, z: 62.5, yaw: 10 },
  { x: 6.8, z: 62.5, yaw: -10 },
  { x: -13.6, z: 64.5, yaw: 18 },
  { x: 13.6, z: 64.5, yaw: -18 },
  { x: -19.5, z: 66.5, yaw: 24 },
  { x: 19.5, z: 66.5, yaw: -24 },
];

const HELPER_MESH_RE = /colmesh|collision_?mesh|shadow_?plane|hitbox/i;
const WHEEL_NAME_RE = /wheel|tire|tyre|rim|hub|roue|rad|rueda|ko.?l|g.?ildirak|balon|shina|brake|disc/i;
const FRONT_NAME_RE = /front|fl|fr|_f_|_f$|перед|old/i;

function createShadowPlaneTexture(device: pc.GraphicsDevice): pc.Texture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.5);
    grad.addColorStop(0, 'rgba(6, 10, 18, 0.72)');
    grad.addColorStop(0.65, 'rgba(6, 10, 18, 0.36)');
    grad.addColorStop(1, 'rgba(6, 10, 18, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new pc.Texture(device, {
    width: w,
    height: h,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(canvas);
  return tex;
}

/**
 * Builds a sleek PlayCanvas native GT Sports Coupe starter car (forward = -Z, grounded at y = 0).
 */
function buildStarterGtEntity(): { model: pc.Entity; wheels: WheelRig[] } {
  const model = new pc.Entity('CampusGT_Model');
  const wheels: WheelRig[] = [];

  const mkMat = (
    r: number,
    g: number,
    b: number,
    metalness: number,
    gloss: number,
    emissive?: [number, number, number]
  ) => {
    const m = new pc.StandardMaterial();
    m.diffuse.set(r, g, b);
    m.useMetalness = true;
    m.metalness = metalness;
    m.gloss = gloss;
    if (emissive) {
      m.emissive.set(emissive[0], emissive[1], emissive[2]);
      m.emissiveIntensity = 1.8;
    }
    m.update();
    return m;
  };

  const paintMat = mkMat(0.11, 0.34, 0.88, 0.72, 0.88);
  const darkTrimMat = mkMat(0.1, 0.12, 0.16, 0.35, 0.55);
  const glassMat = mkMat(0.08, 0.14, 0.24, 0.25, 0.96);
  const tireMat = mkMat(0.1, 0.11, 0.13, 0.05, 0.22);
  const alloyMat = mkMat(0.84, 0.88, 0.92, 0.92, 0.88);
  const headMat = mkMat(1, 0.98, 0.92, 0.1, 0.8, [1, 0.95, 0.82]);
  const tailMat = mkMat(0.9, 0.12, 0.12, 0.1, 0.8, [1, 0.14, 0.12]);

  const addPart = (
    name: string,
    type: 'box' | 'cylinder',
    pos: [number, number, number],
    scale: [number, number, number],
    mat: pc.Material,
    rot?: [number, number, number]
  ) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    e.addComponent('render', { type, material: mat, castShadows: true, receiveShadows: true });
    model.addChild(e);
    return e;
  };

  addPart('ChassisMain', 'box', [0, 0.56, 0], [1.92, 0.54, 4.35], paintMat);
  addPart('FrontSplitter', 'box', [0, 0.26, -2.08], [1.96, 0.1, 0.42], darkTrimMat);
  addPart('RearDiffuser', 'box', [0, 0.28, 2.1], [1.86, 0.18, 0.3], darkTrimMat);
  addPart('CabinGlass', 'box', [0, 1.04, 0.18], [1.52, 0.48, 2.05], glassMat);
  addPart('CabinRoof', 'box', [0, 1.29, 0.24], [1.46, 0.08, 1.55], paintMat);
  addPart('SpoilerBlade', 'box', [0, 1.12, 2.02], [1.88, 0.06, 0.28], darkTrimMat);
  addPart('SpoilerStrutL', 'box', [-0.58, 0.95, 1.98], [0.06, 0.28, 0.18], darkTrimMat);
  addPart('SpoilerStrutR', 'box', [0.58, 0.95, 1.98], [0.06, 0.28, 0.18], darkTrimMat);
  addPart('HeadlightL', 'box', [-0.66, 0.64, -2.17], [0.42, 0.1, 0.08], headMat);
  addPart('HeadlightR', 'box', [0.66, 0.64, -2.17], [0.42, 0.1, 0.08], headMat);
  addPart('TailBar', 'box', [0, 0.72, 2.18], [1.72, 0.1, 0.08], tailMat);

  const wheelCoords: Array<{ name: string; x: number; z: number; isFront: boolean }> = [
    { name: 'Wheel_FL', x: -0.94, z: -1.34, isFront: true },
    { name: 'Wheel_FR', x: 0.94, z: -1.34, isFront: true },
    { name: 'Wheel_RL', x: -0.95, z: 1.34, isFront: false },
    { name: 'Wheel_RR', x: 0.95, z: 1.34, isFront: false },
  ];

  for (const wc of wheelCoords) {
    const steerPivot = new pc.Entity(`${wc.name}_Steer`);
    steerPivot.setLocalPosition(wc.x, 0.36, wc.z);
    model.addChild(steerPivot);

    const spinPivot = new pc.Entity(`${wc.name}_Spin`);
    steerPivot.addChild(spinPivot);

    const tire = new pc.Entity(`${wc.name}_Tire`);
    tire.setLocalEulerAngles(0, 0, 90);
    tire.setLocalScale(0.72, 0.26, 0.72);
    tire.addComponent('render', { type: 'cylinder', material: tireMat, castShadows: true });
    spinPivot.addChild(tire);

    const rim = new pc.Entity(`${wc.name}_Rim`);
    rim.setLocalEulerAngles(0, 0, 90);
    rim.setLocalScale(0.46, 0.28, 0.46);
    rim.addComponent('render', { type: 'cylinder', material: alloyMat });
    spinPivot.addChild(rim);

    // Visual spoke bar so rotation is unmistakably clear!
    const spoke = new pc.Entity(`${wc.name}_Spoke`);
    spoke.setLocalScale(0.29, 0.44, 0.08);
    spoke.addComponent('render', { type: 'box', material: darkTrimMat });
    spinPivot.addChild(spoke);

    wheels.push({ steerPivot, spinPivot, isFront: wc.isFront, radius: 0.36 });
  }

  return { model, wheels };
}

// ============================================================================
// REAL WHEEL EXTRACTION ENGINE (Supports GPU Instanced, Merged 4-Wheel, & Named Wheels!)
// ============================================================================

/**
 * Creates a new pc.Mesh from an existing MeshInstance, with vertices pre-baked into
 * wrapper-relative coordinates centered around `(centerX, centerY, centerZ)`.
 */
function buildCenteredSubMesh(
  device: pc.GraphicsDevice,
  srcMesh: pc.Mesh,
  toWrapperMat: pc.Mat4,
  center: pc.Vec3,
  triangleFilter?: (v0: pc.Vec3, v1: pc.Vec3, v2: pc.Vec3) => boolean
): { mesh: pc.Mesh; bounds: pc.BoundingBox } | null {
  const posArr: number[] = [];
  const normArr: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  const numVerts = srcMesh.getPositions(posArr);
  if (numVerts < 3) return null;
  const numNorms = srcMesh.getNormals(normArr);
  const numUvs = srcMesh.getUvs(0, uvArr);
  const numIdx = srcMesh.getIndices(idxArr);

  // Build normal matrix (inverse transpose of upper 3x3)
  const normMat = new pc.Mat3();
  normMat.setFromMat4(toWrapperMat);
  // Check determinant for negative-scale mirroring (common on mirrored right-side wheels!)
  const det =
    toWrapperMat.data[0] * (toWrapperMat.data[5] * toWrapperMat.data[10] - toWrapperMat.data[6] * toWrapperMat.data[9]) -
    toWrapperMat.data[1] * (toWrapperMat.data[4] * toWrapperMat.data[10] - toWrapperMat.data[6] * toWrapperMat.data[8]) +
    toWrapperMat.data[2] * (toWrapperMat.data[4] * toWrapperMat.data[9] - toWrapperMat.data[5] * toWrapperMat.data[8]);
  const flipWinding = det < 0;

  const outPos: number[] = [];
  const outNorm: number[] = [];
  const outUv: number[] = [];
  const outIdx: number[] = [];
  const vertRemap = new Map<number, number>();

  const v0 = new pc.Vec3();
  const v1 = new pc.Vec3();
  const v2 = new pc.Vec3();
  const tmpP = new pc.Vec3();
  const tmpN = new pc.Vec3();

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const pushVert = (origIdx: number): number => {
    const existing = vertRemap.get(origIdx);
    if (existing !== undefined) return existing;

    tmpP.set(posArr[origIdx * 3], posArr[origIdx * 3 + 1], posArr[origIdx * 3 + 2]);
    toWrapperMat.transformPoint(tmpP, tmpP);
    const lx = tmpP.x - center.x;
    const ly = tmpP.y - center.y;
    const lz = tmpP.z - center.z;
    outPos.push(lx, ly, lz);

    if (lx < minX) minX = lx;
    if (ly < minY) minY = ly;
    if (lz < minZ) minZ = lz;
    if (lx > maxX) maxX = lx;
    if (ly > maxY) maxY = ly;
    if (lz > maxZ) maxZ = lz;

    if (numNorms >= numVerts) {
      tmpN.set(normArr[origIdx * 3], normArr[origIdx * 3 + 1], normArr[origIdx * 3 + 2]);
      toWrapperMat.transformVector(tmpN, tmpN);
      tmpN.normalize();
      outNorm.push(tmpN.x, tmpN.y, tmpN.z);
    }
    if (numUvs >= numVerts) {
      outUv.push(uvArr[origIdx * 2], uvArr[origIdx * 2 + 1]);
    }

    const newIdx = vertRemap.size;
    vertRemap.set(origIdx, newIdx);
    return newIdx;
  };

  const triCount = numIdx > 0 ? Math.floor(numIdx / 3) : Math.floor(numVerts / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = numIdx > 0 ? idxArr[t * 3] : t * 3;
    const i1 = numIdx > 0 ? idxArr[t * 3 + 1] : t * 3 + 1;
    const i2 = numIdx > 0 ? idxArr[t * 3 + 2] : t * 3 + 2;

    if (triangleFilter) {
      v0.set(posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]);
      v1.set(posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]);
      v2.set(posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]);
      toWrapperMat.transformPoint(v0, v0);
      toWrapperMat.transformPoint(v1, v1);
      toWrapperMat.transformPoint(v2, v2);
      if (!triangleFilter(v0, v1, v2)) continue;
    }

    const n0 = pushVert(i0);
    const n1 = pushVert(i1);
    const n2 = pushVert(i2);
    if (flipWinding) {
      outIdx.push(n0, n2, n1);
    } else {
      outIdx.push(n0, n1, n2);
    }
  }

  if (outIdx.length < 3) return null;

  const mesh = new pc.Mesh(device);
  mesh.setPositions(outPos);
  if (outNorm.length === outPos.length) {
    mesh.setNormals(outNorm);
  } else {
    mesh.setNormals(pc.calculateNormals(outPos, outIdx));
  }
  if (outUv.length === (outPos.length / 3) * 2) {
    mesh.setUvs(0, outUv);
  }
  mesh.setIndices(outIdx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  const bounds = new pc.BoundingBox();
  bounds.setMinMax(new pc.Vec3(minX, minY, minZ), new pc.Vec3(maxX, maxY, maxZ));
  return { mesh, bounds };
}

/**
 * Strategy 1: Extract GPU-Instanced 4-wheel parts (like cobalt_opt.glb nodes 6, 7, 8, 9!)
 * into 4 real independent SteerPivot -> SpinPivot assemblies!
 */
function extractGpuInstancedWheels(
  device: pc.GraphicsDevice,
  wrapper: pc.Entity,
  renderComps: pc.RenderComponent[]
): WheelRig[] {
  const instancedMis: Array<{ rc: pc.RenderComponent; mi: pc.MeshInstance }> = [];
  for (const rc of renderComps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (mi.instancingData && mi.instancingData.count === 4 && mi.instancingData.vertexBuffer) {
        instancedMis.push({ rc, mi });
      }
    }
  }
  if (instancedMis.length === 0) return [];

  const invWrapper = wrapper.getWorldTransform().clone().invert();
  interface WheelPart {
    mi: pc.MeshInstance;
    toWrapper: pc.Mat4;
    worldCenter: pc.Vec3;
    radius: number;
  }

  // Group all instanced wheel parts (tire, rim, brake disc, hub cap) into 4 corner buckets
  const buckets = new Map<string, { parts: WheelPart[]; sumPos: pc.Vec3; count: number; maxRadius: number }>();
  const instMat = new pc.Mat4();
  const nodeWorld = new pc.Mat4();
  const combined = new pc.Mat4();
  const meshCenter = new pc.Vec3();

  for (const { mi } of instancedMis) {
    const srcMesh = mi.mesh;
    const srcMat = mi.material;
    if (!srcMesh || !srcMat) continue;
    const vb = mi.instancingData!.vertexBuffer!;
    const locked = vb.lock();
    const floats =
      locked instanceof Float32Array
        ? locked
        : ArrayBuffer.isView(locked)
          ? new Float32Array(locked.buffer, locked.byteOffset, Math.floor(locked.byteLength / 4))
          : new Float32Array(locked);
    const count = mi.instancingData!.count;
    nodeWorld.copy(mi.node.getWorldTransform());
    const localBox = srcMesh.aabb;

    for (let k = 0; k < count; k++) {
      const off = k * 16;
      if (off + 15 >= floats.length) break;
      instMat.data.set(floats.subarray(off, off + 16));

      // Combined matrix from mesh local -> wrapper local
      combined.mul2(nodeWorld, instMat);
      combined.mul2(invWrapper, combined);

      meshCenter.copy(localBox.center);
      combined.transformPoint(meshCenter, meshCenter);

      const scaleVec = new pc.Vec3();
      combined.getScale(scaleVec);
      const radius = Math.max(
        localBox.halfExtents.y * Math.abs(scaleVec.y),
        localBox.halfExtents.z * Math.abs(scaleVec.z)
      );

      const key = `${meshCenter.x < 0 ? 'L' : 'R'}_${meshCenter.z < 0 ? 'F' : 'R'}`;
      let b = buckets.get(key);
      if (!b) {
        b = { parts: [], sumPos: new pc.Vec3(), count: 0, maxRadius: 0.34 };
        buckets.set(key, b);
      }
      b.parts.push({
        mi,
        toWrapper: combined.clone(),
        worldCenter: meshCenter.clone(),
        radius,
      });
      b.sumPos.add(meshCenter);
      b.count += 1;
      if (radius > b.maxRadius) b.maxRadius = radius;
    }
    vb.unlock();

    // Hide the original GPU-instanced draw so our 4 rigged wheels take over cleanly!
    mi.visible = false;
  }

  const rigs: WheelRig[] = [];
  for (const [key, bucket] of buckets.entries()) {
    const center = bucket.sumPos.clone().mulScalar(1 / Math.max(1, bucket.count));
    const isFront = key.endsWith('_F');

    const steerPivot = new pc.Entity(`Wheel_${key}_Steer`);
    steerPivot.setLocalPosition(center.x, center.y, center.z);
    wrapper.addChild(steerPivot);

    const spinPivot = new pc.Entity(`Wheel_${key}_Spin`);
    steerPivot.addChild(spinPivot);

    for (let p = 0; p < bucket.parts.length; p++) {
      const part = bucket.parts[p];
      if (!part.mi.mesh || !part.mi.material) continue;
      const built = buildCenteredSubMesh(device, part.mi.mesh, part.toWrapper, center);
      if (!built) continue;
      const partEnt = new pc.Entity(`Wheel_${key}_Part_${p}`);
      const newMi = new pc.MeshInstance(built.mesh, part.mi.material);
      partEnt.addComponent('render', {
        meshInstances: [newMi],
        castShadows: true,
        receiveShadows: true,
      });
      spinPivot.addChild(partEnt);
    }

    rigs.push({
      steerPivot,
      spinPivot,
      isFront,
      radius: Math.max(0.24, Math.min(0.55, bucket.maxRadius)),
    });
  }

  return rigs;
}

/**
 * Strategy 2: Split a merged 4-wheel mesh (like damas_opt.glb Object_11!) into 4 centered
 * corner wheels (`FL, FR, RL, RR`) wrapped in SteerPivot -> SpinPivot!
 */
function extractMergedFourCornerWheels(
  device: pc.GraphicsDevice,
  wrapper: pc.Entity,
  renderComps: pc.RenderComponent[],
  carWidth: number,
  carLength: number
): WheelRig[] {
  const invWrapper = wrapper.getWorldTransform().clone().invert();
  const toWrapper = new pc.Mat4();
  const tmpP = new pc.Vec3();

  // Look for a low-riding mesh whose vertices cluster neatly into all 4 corners (FL, FR, RL, RR)
  let bestCandidate: { mi: pc.MeshInstance; toWrapper: pc.Mat4; cornerCenters: Record<string, pc.Vec3>; radius: number } | null = null;

  for (const rc of renderComps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || mi.instancingData || !mi.mesh || !mi.material) continue;

      toWrapper.mul2(invWrapper, mi.node.getWorldTransform());
      const posArr: number[] = [];
      const nVerts = mi.mesh.getPositions(posArr);
      if (nVerts < 48) continue;

      let minY = Infinity;
      let maxY = -Infinity;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;

      const cornerMin: Record<string, pc.Vec3> = {
        LF: new pc.Vec3(Infinity, Infinity, Infinity),
        RF: new pc.Vec3(Infinity, Infinity, Infinity),
        LR: new pc.Vec3(Infinity, Infinity, Infinity),
        RR: new pc.Vec3(Infinity, Infinity, Infinity),
      };
      const cornerMax: Record<string, pc.Vec3> = {
        LF: new pc.Vec3(-Infinity, -Infinity, -Infinity),
        RF: new pc.Vec3(-Infinity, -Infinity, -Infinity),
        LR: new pc.Vec3(-Infinity, -Infinity, -Infinity),
        RR: new pc.Vec3(-Infinity, -Infinity, -Infinity),
      };
      const cornerCount: Record<string, number> = { LF: 0, RF: 0, LR: 0, RR: 0 };
      let midBandVerts = 0;

      for (let i = 0; i < nVerts; i++) {
        tmpP.set(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
        toWrapper.transformPoint(tmpP, tmpP);
        if (tmpP.x < minX) minX = tmpP.x;
        if (tmpP.x > maxX) maxX = tmpP.x;
        if (tmpP.y < minY) minY = tmpP.y;
        if (tmpP.y > maxY) maxY = tmpP.y;
        if (tmpP.z < minZ) minZ = tmpP.z;
        if (tmpP.z > maxZ) maxZ = tmpP.z;

        // Wheel vertices stay away from centerline X=0 and center Z=0
        if (Math.abs(tmpP.x) < carWidth * 0.14 || Math.abs(tmpP.z) < carLength * 0.12) {
          midBandVerts++;
        }

        const key = `${tmpP.x < 0 ? 'L' : 'R'}${tmpP.z < 0 ? 'F' : 'R'}`;
        cornerCount[key]++;
        cornerMin[key].min(tmpP);
        cornerMax[key].max(tmpP);
      }

      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const spanZ = maxZ - minZ;

      // Signature of a merged 4-wheel tire/rim mesh:
      // 1) Low to the ground (minY < 0.25, maxY < 1.05, spanY between 0.35 and 0.95)
      // 2) Spans both sides & both axles (spanX > 65% carWidth, spanZ > 45% carLength)
      // 3) Almost zero vertices in the middle X/Z gap between wheels (< 5% of vertices)
      // 4) All 4 corners populated with balanced wheel geometry!
      const isWheelHeight = minY < 0.28 && maxY < 1.08 && spanY > 0.32 && spanY < 0.95;
      const isWideSpan = spanX > carWidth * 0.62 && spanZ > carLength * 0.42;
      const hasCleanGap = midBandVerts / nVerts < 0.06;
      const allFour =
        cornerCount.LF > 16 && cornerCount.RF > 16 && cornerCount.LR > 16 && cornerCount.RR > 16;

      if (isWheelHeight && isWideSpan && hasCleanGap && allFour) {
        const cornerCenters: Record<string, pc.Vec3> = {};
        for (const k of ['LF', 'RF', 'LR', 'RR']) {
          cornerCenters[k] = new pc.Vec3().add2(cornerMin[k], cornerMax[k]).mulScalar(0.5);
        }
        bestCandidate = {
          mi,
          toWrapper: toWrapper.clone(),
          cornerCenters,
          radius: Math.max(0.24, spanY * 0.5),
        };
        break;
      }
    }
    if (bestCandidate) break;
  }

  if (!bestCandidate) return [];

  const rigs: WheelRig[] = [];
  const corners: Array<{ key: string; wantNegX: boolean; wantNegZ: boolean; isFront: boolean }> = [
    { key: 'LF', wantNegX: true, wantNegZ: true, isFront: true },
    { key: 'RF', wantNegX: false, wantNegZ: true, isFront: true },
    { key: 'LR', wantNegX: true, wantNegZ: false, isFront: false },
    { key: 'RR', wantNegX: false, wantNegZ: false, isFront: false },
  ];

  const candMesh = bestCandidate.mi.mesh;
  const candMat = bestCandidate.mi.material;
  if (!candMesh || !candMat) return [];

  for (const c of corners) {
    const center = bestCandidate.cornerCenters[c.key];
    const built = buildCenteredSubMesh(
      device,
      candMesh,
      bestCandidate.toWrapper,
      center,
      (v0, v1, v2) => {
        const cx = (v0.x + v1.x + v2.x) / 3;
        const cz = (v0.z + v1.z + v2.z) / 3;
        return (cx < 0) === c.wantNegX && (cz < 0) === c.wantNegZ;
      }
    );
    if (!built) continue;

    const steerPivot = new pc.Entity(`Wheel_${c.key}_Steer`);
    steerPivot.setLocalPosition(center.x, center.y, center.z);
    wrapper.addChild(steerPivot);

    const spinPivot = new pc.Entity(`Wheel_${c.key}_Spin`);
    steerPivot.addChild(spinPivot);

    const wheelEnt = new pc.Entity(`Wheel_${c.key}_Mesh`);
    wheelEnt.addComponent('render', {
      meshInstances: [new pc.MeshInstance(built.mesh, candMat)],
      castShadows: true,
      receiveShadows: true,
    });
    spinPivot.addChild(wheelEnt);

    rigs.push({
      steerPivot,
      spinPivot,
      isFront: c.isFront,
      radius: bestCandidate.radius,
    });
  }

  if (rigs.length === 4) {
    bestCandidate.mi.visible = false;
    return rigs;
  }
  return [];
}

/**
 * Strategy 3: Individual named wheel entities (`Wheel_FL`, `Tire_FR`, etc.) re-centered cleanly into SteerPivot -> SpinPivot.
 */
function extractNamedWheelEntities(
  device: pc.GraphicsDevice,
  wrapper: pc.Entity,
  renderComps: pc.RenderComponent[]
): WheelRig[] {
  const invWrapper = wrapper.getWorldTransform().clone().invert();
  const toWrapper = new pc.Mat4();
  const rigs: WheelRig[] = [];

  for (const rc of renderComps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    const ent = rc.entity;
    if (!WHEEL_NAME_RE.test(ent.name || '')) continue;

    let box: pc.BoundingBox | null = null;
    for (const mi of rc.meshInstances) {
      if (!mi.visible) continue;
      if (!box) box = mi.aabb.clone();
      else box.add(mi.aabb);
    }
    if (!box) continue;

    const maxDim = Math.max(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z) * 2;
    if (maxDim < 0.2 || maxDim > 1.25) continue;

    const center = new pc.Vec3();
    invWrapper.transformPoint(box.center, center);
    const isFront = FRONT_NAME_RE.test(ent.name || '') || center.z < -0.25;

    const steerPivot = new pc.Entity(`NamedWheel_${rigs.length}_Steer`);
    steerPivot.setLocalPosition(center.x, center.y, center.z);
    wrapper.addChild(steerPivot);

    const spinPivot = new pc.Entity(`NamedWheel_${rigs.length}_Spin`);
    steerPivot.addChild(spinPivot);

    let addedParts = 0;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || !mi.mesh || !mi.material) continue;
      toWrapper.mul2(invWrapper, mi.node.getWorldTransform());
      const built = buildCenteredSubMesh(device, mi.mesh, toWrapper, center);
      if (!built) continue;
      const part = new pc.Entity(`NamedWheelPart_${addedParts++}`);
      part.addComponent('render', {
        meshInstances: [new pc.MeshInstance(built.mesh, mi.material)],
        castShadows: true,
        receiveShadows: true,
      });
      spinPivot.addChild(part);
      mi.visible = false;
    }

    if (addedParts > 0) {
      rigs.push({
        steerPivot,
        spinPivot,
        isFront,
        radius: Math.max(0.24, Math.min(0.55, box.halfExtents.y)),
      });
    }
  }

  return rigs;
}

// ============================================================================
// Car Fleet Manager
// ============================================================================
export class PlayCanvasCarFleet {
  public readonly app: pc.Application;
  public readonly root: pc.Entity;
  public cars: PlayCanvasCar[] = [];
  public activeCarId: string | null = null;
  public manifestCharacter: SpecialAssetManifestItem | null = null;
  public manifestTashkent: SpecialAssetManifestItem | null = null;

  private shadowMat: pc.StandardMaterial;
  private localCounter = 0;

  constructor(app: pc.Application) {
    this.app = app;
    this.root = new pc.Entity('CarFleetRoot');
    this.app.root.addChild(this.root);

    // Offline Draco WASM decoder bundled inside /public/draco/gltf/
    try {
      const base = typeof window !== 'undefined' ? window.location.href : '';
      const jsUrl = base ? new URL('./draco/gltf/draco_wasm_wrapper.js', base).href : './draco/gltf/draco_wasm_wrapper.js';
      const wasmUrl = base ? new URL('./draco/gltf/draco_decoder.wasm', base).href : './draco/gltf/draco_decoder.wasm';
      pc.dracoInitialize({
        jsUrl,
        wasmUrl,
        numWorkers: 2,
        lazyInit: false,
      });
    } catch (err) {
      console.warn('[PlayCanvasCarFleet] Draco init warning:', err);
    }

    const shadowTex = createShadowPlaneTexture(app.graphicsDevice);
    const sm = new pc.StandardMaterial();
    sm.diffuse.set(1, 1, 1);
    sm.diffuseMap = shadowTex;
    sm.opacityMap = shadowTex;
    sm.opacityMapChannel = 'a';
    sm.blendType = pc.BLEND_NORMAL;
    sm.depthWrite = false;
    sm.useLighting = false;
    sm.useFog = false;
    sm.update();
    this.shadowMat = sm;
  }

  private getBay(idx: number): { x: number; z: number; yaw: number } {
    if (idx < PARKING_BAYS.length) return PARKING_BAYS[idx];
    const extra = idx - PARKING_BAYS.length;
    return {
      x: -18 + (extra % 6) * 7.2,
      z: 69 + Math.floor(extra / 6) * 8,
      yaw: 0,
    };
  }

  private normalizeGlbEntity(rawEntity: pc.Entity, carName: string): {
    wrapper: pc.Entity;
    wheels: WheelRig[];
    width: number;
    length: number;
  } {
    const wrapper = new pc.Entity('NormalizedGlbWrapper');
    const orientGroup = new pc.Entity('CarOrientGroup');
    orientGroup.addChild(rawEntity);
    wrapper.addChild(orientGroup);

    this.app.root.addChild(wrapper);

    // 1. Hide exported collision / GTA ColMesh helper meshes & tune HDR clearcoat reflections
    const renderComps = rawEntity.findComponents('render') as pc.RenderComponent[];
    for (const rc of renderComps) {
      if (HELPER_MESH_RE.test(rc.entity.name || '')) {
        rc.enabled = false;
        rc.entity.enabled = false;
        continue;
      }
      rc.castShadows = true;
      rc.receiveShadows = true;
      for (const mi of rc.meshInstances) {
        const mat = mi.material;
        if (mat instanceof pc.StandardMaterial) {
          // Ensure car paint responds vividly to HDR environment lighting
          mat.envAtlas = null; // inherit scene.envAtlas
          if (mat.gloss < 0.35 && !/tire|rubber|wheel|seat|interior/i.test(mat.name || '')) {
            mat.gloss = Math.max(mat.gloss, 0.52);
          }
          mat.update();
        }
      }
    }

    const computeVisibleBounds = (node: pc.Entity): pc.BoundingBox | null => {
      node.getWorldTransform();
      const comps = node.findComponents('render') as pc.RenderComponent[];
      let combined: pc.BoundingBox | null = null;
      for (const rc of comps) {
        if (!rc.enabled || !rc.entity.enabled) continue;
        for (const mi of rc.meshInstances) {
          if (!mi.visible) continue;
          if (!combined) combined = mi.aabb.clone();
          else combined.add(mi.aabb);
        }
      }
      return combined;
    };

    const rawBounds = computeVisibleBounds(rawEntity);
    if (rawBounds) {
      const sizeX = Math.max(rawBounds.halfExtents.x * 2, 0.001);
      const sizeZ = Math.max(rawBounds.halfExtents.z * 2, 0.001);
      const maxHoriz = Math.max(sizeX, sizeZ);
      const targetLen = /damas/i.test(carName) ? 3.55 : TARGET_CAR_LENGTH;
      const scale = targetLen / maxHoriz;
      orientGroup.setLocalScale(scale, scale, scale);

      if (sizeX > sizeZ * 1.12) {
        orientGroup.setLocalEulerAngles(0, 90, 0);
      }

      const scaledBounds = computeVisibleBounds(orientGroup);
      if (scaledBounds) {
        const minY = scaledBounds.center.y - scaledBounds.halfExtents.y;
        orientGroup.setLocalPosition(-scaledBounds.center.x, -minY, -scaledBounds.center.z);
      }
    }

    const finalBounds = computeVisibleBounds(wrapper);
    const width = finalBounds ? Math.max(1.35, Math.min(2.5, finalBounds.halfExtents.x * 2)) : 1.9;
    const length = finalBounds ? Math.max(2.8, Math.min(5.8, finalBounds.halfExtents.z * 2)) : 4.45;

    // 2. REAL WHEEL EXTRACTION (Spin + Front Steering!)
    wrapper.getWorldTransform();
    let wheels = extractGpuInstancedWheels(this.app.graphicsDevice, wrapper, renderComps);
    if (wheels.length < 4) {
      const merged = extractMergedFourCornerWheels(
        this.app.graphicsDevice,
        wrapper,
        renderComps,
        width,
        length
      );
      if (merged.length >= 4) wheels = merged;
    }
    if (wheels.length < 2) {
      const named = extractNamedWheelEntities(this.app.graphicsDevice, wrapper, renderComps);
      if (named.length > 0) wheels = named;
    }

    this.app.root.removeChild(wrapper);
    return { wrapper, wheels, width, length };
  }

  private registerCarEntity(opts: {
    id: string;
    name: string;
    source: 'models' | 'builtin' | 'local';
    modelWrapper: pc.Entity;
    wheels: WheelRig[];
    width: number;
    length: number;
  }): PlayCanvasCar {
    const bay = this.getBay(this.cars.length);

    const root = new pc.Entity(`DrivableCar_${opts.id}`);
    root.setLocalPosition(bay.x, 0.04, bay.z);
    root.setLocalEulerAngles(0, bay.yaw, 0);

    const tiltPivot = new pc.Entity('CarTiltPivot');
    const userAdjust = new pc.Entity('CarUserAdjust');
    userAdjust.addChild(opts.modelWrapper);
    tiltPivot.addChild(userAdjust);
    root.addChild(tiltPivot);

    // Mount crisp, editable Uzbekistan License Plate (front & rear bumper slots!)
    const plateKey = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const plateCfg = loadSavedPlateConfig(plateKey, opts.name, opts.length);
    const plateRig = new CarLicensePlateRig(this.app.graphicsDevice, opts.modelWrapper, plateCfg);

    // Contact shadow plane under car
    const shadowPlane = new pc.Entity('CarContactShadow');
    shadowPlane.setLocalPosition(0, 0.03, 0);
    shadowPlane.setLocalScale(opts.width * 1.32, 1, opts.length * 1.18);
    shadowPlane.addComponent('render', {
      type: 'plane',
      material: this.shadowMat,
      castShadows: false,
      receiveShadows: false,
    });
    root.addChild(shadowPlane);

    this.root.addChild(root);

    const car: PlayCanvasCar = {
      id: opts.id,
      name: opts.name,
      source: opts.source,
      root,
      tiltPivot,
      userAdjust,
      wheels: opts.wheels,
      plateRig,
      spawnX: bay.x,
      spawnZ: bay.z,
      spawnYaw: bay.yaw,
      x: bay.x,
      y: 0.04,
      z: bay.z,
      yaw: bay.yaw,
      flip180: false,
      scaleMul: 1.0,
      carWidth: opts.width,
      carLength: opts.length,
    };
    this.cars.push(car);
    return car;
  }

  private loadGlbUrl(url: string, name: string): Promise<pc.Entity> {
    return new Promise((resolve, reject) => {
      const asset = new pc.Asset(name, 'container', { url });
      asset.once('load', () => {
        const resource = asset.resource as pc.ContainerResource | null;
        if (!resource) {
          reject(new Error(`Empty GLB container for ${name}`));
          return;
        }
        const entity = resource.instantiateRenderEntity({
          castShadows: true,
          receiveShadows: true,
        });
        resolve(entity);
      });
      asset.once('error', (err) => {
        reject(new Error(String(err || `Failed to load ${url}`)));
      });
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });
  }

  public async fetchManifest(): Promise<ModelsManifest> {
    try {
      const res = await fetch('./models/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        const cars = Array.isArray(json?.cars) ? json.cars : [];
        this.manifestCharacter = json?.character || null;
        this.manifestTashkent = json?.landmarkTashkent || null;
        return {
          version: json?.version ?? 2,
          cars,
          character: this.manifestCharacter,
          landmarkTashkent: this.manifestTashkent,
        };
      }
    } catch {
      // Ignore missing manifest
    }
    return { cars: [], character: null, landmarkTashkent: null };
  }

  public async loadAllFromManifest(
    manifest: ModelsManifest,
    onProgress?: (label: string, pct: number) => void
  ): Promise<PlayCanvasCar[]> {
    const manifestCars = manifest.cars || [];
    const total = manifestCars.length + 1;

    for (let i = 0; i < manifestCars.length; i++) {
      const item = manifestCars[i];
      onProgress?.(`Loading ${item.name}…`, 56 + Math.round(((i + 0.35) / total) * 36));
      try {
        const raw = await this.loadGlbUrl(item.url, item.fileName);
        const norm = this.normalizeGlbEntity(raw, item.name);
        this.registerCarEntity({
          id: item.id,
          name: item.name,
          source: 'models',
          modelWrapper: norm.wrapper,
          wheels: norm.wheels,
          width: norm.width,
          length: norm.length,
        });
      } catch (err) {
        console.warn(`[PlayCanvasCarFleet] Could not load ${item.fileName}:`, err);
      }
      onProgress?.(`Loaded ${item.name}`, 56 + Math.round(((i + 1) / total) * 36));
    }

    // Built-in Campus GT starter coupe
    const starter = buildStarterGtEntity();
    this.registerCarEntity({
      id: 'campus_gt_coupe',
      name: 'Campus GT',
      source: 'builtin',
      modelWrapper: starter.model,
      wheels: starter.wheels,
      width: 1.98,
      length: 4.45,
    });

    if (this.cars.length > 0 && !this.activeCarId) {
      this.activeCarId = this.cars[0].id;
    }

    return this.cars;
  }

  public async importLocalGlbFile(file: File): Promise<PlayCanvasCar> {
    const blobUrl = URL.createObjectURL(file);
    try {
      this.localCounter += 1;
      const cleanName = file.name
        .replace(/\.glb$/i, '')
        .replace(/(?:[_-](?:opt|optimized|draco|compressed|lowpoly))+$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const displayName = cleanName
        ? cleanName
            .split(/\s+/)
            .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
            .join(' ')
        : `Custom Car ${this.localCounter}`;

      const raw = await this.loadGlbUrl(blobUrl, file.name);
      const norm = this.normalizeGlbEntity(raw, displayName);
      return this.registerCarEntity({
        id: `local_${Date.now()}_${this.localCounter}`,
        name: displayName,
        source: 'local',
        modelWrapper: norm.wrapper,
        wheels: norm.wheels,
        width: norm.width,
        length: norm.length,
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  }

  public getCarById(id: string | null): PlayCanvasCar | null {
    if (!id) return null;
    return this.cars.find((c) => c.id === id) || null;
  }

  public getActiveCar(): PlayCanvasCar | null {
    return this.getCarById(this.activeCarId) || this.cars[0] || null;
  }

  public findNearestCar(x: number, z: number, maxDist: number): PlayCanvasCar | null {
    let best: PlayCanvasCar | null = null;
    let bestDistSq = maxDist * maxDist;
    for (const c of this.cars) {
      const dx = c.x - x;
      const dz = c.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = c;
      }
    }
    return best;
  }

  public flipCar180(carId: string): PlayCanvasCar | null {
    const car = this.getCarById(carId);
    if (!car) return null;
    car.flip180 = !car.flip180;
    car.userAdjust.setLocalEulerAngles(0, car.flip180 ? 180 : 0, 0);
    return car;
  }

  public scaleCar(carId: string, delta: number): PlayCanvasCar | null {
    const car = this.getCarById(carId);
    if (!car) return null;
    car.scaleMul = Math.max(0.5, Math.min(2.0, Number((car.scaleMul + delta).toFixed(2))));
    car.userAdjust.setLocalScale(car.scaleMul, car.scaleMul, car.scaleMul);
    return car;
  }

  public updateCarPlate(carId: string, patch: Partial<LicensePlateConfig>): PlayCanvasCar | null {
    const car = this.getCarById(carId);
    if (!car) return null;
    car.plateRig.updateConfig(patch);
    const plateKey = car.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    savePlateConfig(plateKey, car.plateRig.config);
    return car;
  }

  public getSummaries(): CarSummary[] {
    return this.cars.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      flip180: c.flip180,
      scaleMul: c.scaleMul,
      wheelCount: c.wheels.length,
      plate: { ...c.plateRig.config },
    }));
  }
}
