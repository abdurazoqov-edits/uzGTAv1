import * as pc from 'playcanvas';
import {
  CarLicensePlateRig,
  getDefaultPlatePreset,
  LicensePlateConfig,
  loadSavedPlateConfig,
  PlateMountPreset,
  savePlateConfig,
} from './licensePlate';
import { createSeatedDriverEntity } from './npcs';
import { OpenWorldHandle } from './world';

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
  landmarkRegiston?: SpecialAssetManifestItem | null;
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
  source: 'models' | 'local';
  root: pc.Entity;
  tiltPivot: pc.Entity;
  userAdjust: pc.Entity;
  wheels: WheelRig[];
  nitroFlames: pc.Entity[];
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
  source: 'models' | 'local';
  flip180: boolean;
  scaleMul: number;
  wheelCount: number;
  plate: LicensePlateConfig;
}

const TARGET_CAR_LENGTH = 4.45;

// Parked right along N Shoreline Blvd facing North toward Tashkent TV Tower at (0, 0, 29)!
const PARKING_BAYS: Array<{ x: number; z: number; yaw: number }> = [
  { x: 0, z: 60, yaw: 0 },
  { x: -6.5, z: 62.5, yaw: 8 },
  { x: 6.5, z: 62.5, yaw: -8 },
  { x: -12.8, z: 64.5, yaw: 14 },
  { x: 12.8, z: 64.5, yaw: -14 },
  { x: -18.5, z: 66.5, yaw: 20 },
  { x: 18.5, z: 66.5, yaw: -20 },
];

const TRAFFIC_PLATES: Array<{ region: string; text: string }> = [
  { region: '01', text: 'B 450 DA' },
  { region: '01', text: 'C 888 CB' },
  { region: '10', text: 'M 707 UZ' },
  { region: '30', text: 'K 505 AA' },
  { region: '01', text: 'Z 001 ZZ' },
  { region: '70', text: 'R 321 AB' },
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

// ============================================================================
// REAL WHEEL EXTRACTION ENGINE
// Handles:
//   1) GPU-Instanced multi-part wheels (e.g. cobalt_opt.glb with 10..16 instances!)
//   2) Merged 4-wheel meshes (e.g. damas_opt.glb Object_11!)
//   3) Individual named wheel nodes (wheel_fl, tire_fr, etc.)
// ============================================================================

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
 * Strategy 1: Extract GPU-Instanced wheel meshes (supports ANY instance count 4..48, e.g. Cobalt's 10..16 instances!)
 * Deduplicates overlapping identical transforms per wheel corner and builds 4 true SteerPivot -> SpinPivot wheels!
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
      if (
        mi.instancingData &&
        mi.instancingData.count >= 4 &&
        mi.instancingData.count <= 48 &&
        mi.instancingData.vertexBuffer &&
        mi.mesh &&
        mi.material
      ) {
        instancedMis.push({ rc, mi });
      }
    }
  }
  if (instancedMis.length === 0) return [];

  const invWrapper = wrapper.getWorldTransform().clone().invert();
  interface WheelPart {
    mesh: pc.Mesh;
    material: pc.Material;
    toWrapper: pc.Mat4;
    radius: number;
  }

  const buckets = new Map<
    string,
    { parts: WheelPart[]; seenKeys: Set<string>; sumPos: pc.Vec3; count: number; maxRadius: number }
  >();
  const instMat = new pc.Mat4();
  const nodeWorld = new pc.Mat4();
  const combined = new pc.Mat4();
  const meshCenter = new pc.Vec3();
  const scaleVec = new pc.Vec3();
  const usedMis: pc.MeshInstance[] = [];

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

    // Verify instances actually sit in the lower wheel zone (y < 1.1m) before claiming this MeshInstance
    let wheelLikeCount = 0;
    const parsed: Array<{ key: string; mat: pc.Mat4; center: pc.Vec3; radius: number; sig: string }> = [];

    for (let k = 0; k < count; k++) {
      const off = k * 16;
      if (off + 15 >= floats.length) break;
      instMat.data.set(floats.subarray(off, off + 16));

      combined.mul2(nodeWorld, instMat);
      combined.mul2(invWrapper, combined);

      meshCenter.copy(localBox.center);
      combined.transformPoint(meshCenter, meshCenter);

      combined.getScale(scaleVec);
      const radius = Math.max(
        localBox.halfExtents.x * Math.abs(scaleVec.x),
        localBox.halfExtents.y * Math.abs(scaleVec.y),
        localBox.halfExtents.z * Math.abs(scaleVec.z)
      );

      if (meshCenter.y < 1.15 && Math.abs(meshCenter.x) > 0.35 && Math.abs(meshCenter.z) > 0.55) {
        wheelLikeCount++;
        const key = `${meshCenter.x < 0 ? 'L' : 'R'}_${meshCenter.z < 0 ? 'F' : 'R'}`;
        // Deduplication signature for identical matrix instances on the same mesh
        const sig = `${srcMesh.id}_${Math.round(combined.data[12] * 50)}_${Math.round(combined.data[13] * 50)}_${Math.round(combined.data[14] * 50)}_${Math.round(combined.data[0] * 20)}_${Math.round(combined.data[5] * 20)}_${Math.round(combined.data[10] * 20)}`;
        parsed.push({ key, mat: combined.clone(), center: meshCenter.clone(), radius, sig });
      }
    }
    vb.unlock();

    if (wheelLikeCount < 4) continue;

    for (const item of parsed) {
      let b = buckets.get(item.key);
      if (!b) {
        b = { parts: [], seenKeys: new Set(), sumPos: new pc.Vec3(), count: 0, maxRadius: 0.34 };
        buckets.set(item.key, b);
      }
      if (b.seenKeys.has(item.sig)) continue;
      b.seenKeys.add(item.sig);

      b.parts.push({
        mesh: srcMesh,
        material: srcMat,
        toWrapper: item.mat,
        radius: item.radius,
      });
      b.sumPos.add(item.center);
      b.count += 1;
      if (item.radius > b.maxRadius) b.maxRadius = item.radius;
    }
    usedMis.push(mi);
  }

  if (buckets.size < 4) return [];

  for (const mi of usedMis) {
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
      const built = buildCenteredSubMesh(device, part.mesh, part.toWrapper, center);
      if (!built) continue;
      const partEnt = new pc.Entity(`Wheel_${key}_Part_${p}`);
      const newMi = new pc.MeshInstance(built.mesh, part.material);
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
 * Strategy 2: Split a merged 4-wheel mesh (e.g. damas_opt.glb Object_11!) into 4 centered
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

  let bestCandidate: {
    mi: pc.MeshInstance;
    toWrapper: pc.Mat4;
    cornerCenters: Record<string, pc.Vec3>;
    radius: number;
  } | null = null;

  for (const rc of renderComps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || mi.instancingData || !mi.mesh || !mi.material) continue;

      toWrapper.mul2(invWrapper, mi.node.getWorldTransform());
      const posArr: number[] = [];
      const nVerts = mi.mesh.getPositions(posArr);
      if (nVerts < 48) continue;

      let minY = Infinity, maxY = -Infinity;
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

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

  if (!bestCandidate || !bestCandidate.mi.mesh || !bestCandidate.mi.material) return [];

  const candMesh = bestCandidate.mi.mesh;
  const candMat = bestCandidate.mi.material;
  const rigs: WheelRig[] = [];
  const corners: Array<{ key: string; wantNegX: boolean; wantNegZ: boolean; isFront: boolean }> = [
    { key: 'LF', wantNegX: true, wantNegZ: true, isFront: true },
    { key: 'RF', wantNegX: false, wantNegZ: true, isFront: true },
    { key: 'LR', wantNegX: true, wantNegZ: false, isFront: false },
    { key: 'RR', wantNegX: false, wantNegZ: false, isFront: false },
  ];

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
 * Strategy 3: Individual named wheel entities (`Wheel_FL`, `Tire_FR`, etc.)
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
// Car Fleet Manager (Real User .glb Cars ONLY — Blue Boxy Car Removed!)
// ============================================================================
export class PlayCanvasCarFleet {
  public readonly app: pc.Application;
  public readonly root: pc.Entity;
  public cars: PlayCanvasCar[] = [];
  public activeCarId: string | null = null;
  public manifestCharacter: SpecialAssetManifestItem | null = null;
  public manifestTashkent: SpecialAssetManifestItem | null = null;
  public manifestRegiston: SpecialAssetManifestItem | null = null;

  private shadowMat: pc.StandardMaterial;
  private nitroOuterMat: pc.StandardMaterial;
  private nitroCoreMat: pc.StandardMaterial;
  private localCounter = 0;
  private loadedContainers = new Map<string, { resource: pc.ContainerResource; name: string }>();

  constructor(app: pc.Application) {
    this.app = app;
    this.root = new pc.Entity('CarFleetRoot');
    this.app.root.addChild(this.root);

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

    const nOuter = new pc.StandardMaterial();
    nOuter.diffuse.set(0.15, 0.68, 1.0);
    nOuter.emissive.set(0.22, 0.78, 1.0);
    nOuter.emissiveIntensity = 3.2;
    nOuter.opacity = 0.78;
    nOuter.blendType = pc.BLEND_ADDITIVE;
    nOuter.depthWrite = false;
    nOuter.useLighting = false;
    nOuter.update();
    this.nitroOuterMat = nOuter;

    const nCore = new pc.StandardMaterial();
    nCore.diffuse.set(1.0, 0.94, 0.75);
    nCore.emissive.set(1.0, 0.86, 0.45);
    nCore.emissiveIntensity = 4.0;
    nCore.opacity = 0.92;
    nCore.blendType = pc.BLEND_ADDITIVE;
    nCore.depthWrite = false;
    nCore.useLighting = false;
    nCore.update();
    this.nitroCoreMat = nCore;
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

  /**
   * Scans actual center-strip bumper vertices (`|x| < 0.25m`) in normalized wrapper space
   * so front and rear Uzbekistan license plates snap FLUSH onto the exact bumper surface of
   * Cobalt, Damas, and ANY uploaded .glb car!
   */
  private detectBumperPlateMounts(
    wrapper: pc.Entity,
    renderComps: pc.RenderComponent[],
    carName: string,
    carLength: number
  ): PlateMountPreset {
    const base = getDefaultPlatePreset(carName, carLength);
    wrapper.getWorldTransform();
    const invWrapper = wrapper.getWorldTransform().clone().invert();
    const toWrapper = new pc.Mat4();
    const p = new pc.Vec3();

    const frontTargetY = base.frontY;
    const rearTargetY = base.rearY;
    let bestFrontZ = Infinity;
    let bestRearZ = -Infinity;
    let anyFront = false;
    let anyRear = false;

    for (const rc of renderComps) {
      if (!rc.enabled || !rc.entity.enabled) continue;
      for (const mi of rc.meshInstances) {
        if (!mi.visible || !mi.mesh || mi.instancingData) continue;
        const pos: number[] = [];
        const nVerts = mi.mesh.getPositions(pos);
        if (nVerts < 3) continue;
        toWrapper.mul2(invWrapper, mi.node.getWorldTransform());
        const step = nVerts > 6000 ? 2 : 1;

        for (let i = 0; i < nVerts; i += step) {
          p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          toWrapper.transformPoint(p, p);
          if (Math.abs(p.x) > 0.24) continue;

          // Front bumper strip around target front plate height
          if (p.z < -carLength * 0.28 && Math.abs(p.y - frontTargetY) < 0.14) {
            if (p.z < bestFrontZ) {
              bestFrontZ = p.z;
              anyFront = true;
            }
          }
          // Rear bumper/trunk strip around target rear plate height
          if (p.z > carLength * 0.28 && Math.abs(p.y - rearTargetY) < 0.16) {
            if (p.z > bestRearZ) {
              bestRearZ = p.z;
              anyRear = true;
            }
          }
        }
      }
    }

    return {
      frontY: frontTargetY,
      frontZ: anyFront ? Number((bestFrontZ - 0.018).toFixed(2)) : Number(base.frontZ.toFixed(2)),
      rearY: rearTargetY,
      rearZ: anyRear ? Number((bestRearZ + 0.018).toFixed(2)) : Number(base.rearZ.toFixed(2)),
      scale: base.scale,
    };
  }

  private normalizeGlbEntity(rawEntity: pc.Entity, carName: string): {
    wrapper: pc.Entity;
    wheels: WheelRig[];
    width: number;
    length: number;
    detectedPlate: PlateMountPreset;
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
          mat.envAtlas = null;
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

      // Align long axis along -Z (forward). For X-aligned cars like Damas (front at -X), -90 deg sends -X -> -Z!
      if (sizeX > sizeZ * 1.12) {
        orientGroup.setLocalEulerAngles(0, -90, 0);
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

    // 2. REAL WHEEL EXTRACTION (Spin + Front Steering for Cobalt, Damas & all future GLBs!)
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

    // 3. Auto-detect exact front & rear bumper surface vertices for flush UZ license plates!
    const detectedPlate = this.detectBumperPlateMounts(wrapper, renderComps, carName, length);

    this.app.root.removeChild(wrapper);
    return { wrapper, wheels, width, length, detectedPlate };
  }

  private buildExhaustNitroFlames(parentWrapper: pc.Entity, carWidth: number, carLength: number): pc.Entity[] {
    const flames: pc.Entity[] = [];
    const offsets = [-carWidth * 0.25, carWidth * 0.25];
    const exhaustZ = carLength * 0.5 + 0.08;

    for (let i = 0; i < offsets.length; i++) {
      const flameGroup = new pc.Entity(`NitroExhaust_${i}`);
      flameGroup.setLocalPosition(offsets[i], 0.30, exhaustZ);
      flameGroup.enabled = false;

      const outer = new pc.Entity('FlameOuter');
      outer.setLocalPosition(0, 0, 0.38);
      outer.setLocalEulerAngles(90, 0, 0);
      outer.setLocalScale(0.18, 0.85, 0.18);
      outer.addComponent('render', {
        type: 'cone',
        material: this.nitroOuterMat,
        castShadows: false,
        receiveShadows: false,
      });
      flameGroup.addChild(outer);

      const core = new pc.Entity('FlameCore');
      core.setLocalPosition(0, 0, 0.22);
      core.setLocalEulerAngles(90, 0, 0);
      core.setLocalScale(0.10, 0.48, 0.10);
      core.addComponent('render', {
        type: 'cone',
        material: this.nitroCoreMat,
        castShadows: false,
        receiveShadows: false,
      });
      flameGroup.addChild(core);

      parentWrapper.addChild(flameGroup);
      flames.push(flameGroup);
    }
    return flames;
  }

  private registerCarEntity(opts: {
    id: string;
    name: string;
    source: 'models' | 'local';
    modelWrapper: pc.Entity;
    wheels: WheelRig[];
    width: number;
    length: number;
    detectedPlate: PlateMountPreset;
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

    const plateKey = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const plateCfg = loadSavedPlateConfig(plateKey, opts.name, opts.length, opts.detectedPlate);
    const plateRig = new CarLicensePlateRig(this.app.graphicsDevice, opts.modelWrapper, plateCfg);
    const nitroFlames = this.buildExhaustNitroFlames(opts.modelWrapper, opts.width, opts.length);

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
      nitroFlames,
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

  private loadGlbContainer(url: string, name: string): Promise<pc.ContainerResource> {
    return new Promise((resolve, reject) => {
      const asset = new pc.Asset(name, 'container', { url });
      asset.once('load', () => {
        const resource = asset.resource as pc.ContainerResource | null;
        if (!resource) {
          reject(new Error(`Empty GLB container for ${name}`));
          return;
        }
        resolve(resource);
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
        this.manifestRegiston = json?.landmarkRegiston || null;
        return {
          version: json?.version ?? 3,
          cars,
          character: this.manifestCharacter,
          landmarkTashkent: this.manifestTashkent,
          landmarkRegiston: this.manifestRegiston,
        };
      }
    } catch {
      // Ignore
    }
    return { cars: [], character: null, landmarkTashkent: null, landmarkRegiston: null };
  }

  public async loadAllFromManifest(
    manifest: ModelsManifest,
    onProgress?: (label: string, pct: number) => void
  ): Promise<PlayCanvasCar[]> {
    const manifestCars = manifest.cars || [];
    const total = Math.max(1, manifestCars.length);

    for (let i = 0; i < manifestCars.length; i++) {
      const item = manifestCars[i];
      onProgress?.(`Loading ${item.name}…`, 56 + Math.round(((i + 0.35) / total) * 34));
      try {
        const container = await this.loadGlbContainer(item.url, item.fileName);
        this.loadedContainers.set(item.id, { resource: container, name: item.name });
        const raw = container.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
        const norm = this.normalizeGlbEntity(raw, item.name);
        this.registerCarEntity({
          id: item.id,
          name: item.name,
          source: 'models',
          modelWrapper: norm.wrapper,
          wheels: norm.wheels,
          width: norm.width,
          length: norm.length,
          detectedPlate: norm.detectedPlate,
        });
      } catch (err) {
        console.warn(`[PlayCanvasCarFleet] Could not load ${item.fileName}:`, err);
      }
      onProgress?.(`Loaded ${item.name}`, 56 + Math.round(((i + 1) / total) * 34));
    }

    if (this.cars.length > 0 && !this.activeCarId) {
      this.activeCarId = this.cars[0].id;
    }

    return this.cars;
  }

  /**
   * Spawns live AI traffic cars on the city roads using the user's OWN .glb car models
   * (Cobalt, Damas, and any future .glb cars — complete with spinning wheels, UZ plates & seated human drivers!).
   */
  public spawnUserCarsAsRoadTraffic(world: OpenWorldHandle, isMobile: boolean): void {
    const entries = Array.from(this.loadedContainers.values());
    if (entries.length === 0) return;

    const totalTraffic = isMobile ? Math.min(4, entries.length * 2) : Math.min(6, entries.length * 3);
    for (let i = 0; i < totalTraffic; i++) {
      const src = entries[i % entries.length];
      try {
        const raw = src.resource.instantiateRenderEntity({ castShadows: !isMobile, receiveShadows: true });
        const norm = this.normalizeGlbEntity(raw, src.name);

        const holder = new pc.Entity(`TrafficUserCar_${src.name}_${i}`);
        holder.addChild(norm.wrapper);

        // Seat a real human driver inside the cabin!
        const driver = createSeatedDriverEntity(i, norm.length, src.name);
        norm.wrapper.addChild(driver);

        // Give each AI road car its own crisp auto-aligned UZ license plate
        const plateInfo = TRAFFIC_PLATES[i % TRAFFIC_PLATES.length];
        new CarLicensePlateRig(this.app.graphicsDevice, norm.wrapper, {
          enabled: true,
          region: plateInfo.region,
          text: plateInfo.text,
          style: i % 3 === 2 ? 'taxi' : 'white',
          ...norm.detectedPlate,
        });

        const sp = new pc.Entity('TrafficShadow');
        sp.setLocalPosition(0, 0.03, 0);
        sp.setLocalScale(norm.width * 1.3, 1, norm.length * 1.15);
        sp.addComponent('render', {
          type: 'plane',
          material: this.shadowMat,
          castShadows: false,
          receiveShadows: false,
        });
        holder.addChild(sp);

        const routeIndex = i % 3;
        const phase = (i * 0.27 + 0.12) % 1;
        const speed = 9.5 + (i % 3) * 1.8;
        world.registerTrafficCar(
          holder,
          norm.wheels.map((w) => ({ spinPivot: w.spinPivot, radius: w.radius })),
          routeIndex,
          phase,
          speed
        );
      } catch (err) {
        console.warn('[PlayCanvasCarFleet] Could not spawn road traffic clone:', err);
      }
    }
  }

  public async importLocalGlbFile(file: File, world?: OpenWorldHandle): Promise<PlayCanvasCar> {
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

      const container = await this.loadGlbContainer(blobUrl, file.name);
      const id = `local_${Date.now()}_${this.localCounter}`;
      this.loadedContainers.set(id, { resource: container, name: displayName });

      const raw = container.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      const norm = this.normalizeGlbEntity(raw, displayName);
      const car = this.registerCarEntity({
        id,
        name: displayName,
        source: 'local',
        modelWrapper: norm.wrapper,
        wheels: norm.wheels,
        width: norm.width,
        length: norm.length,
        detectedPlate: norm.detectedPlate,
      });

      if (world) {
        try {
          const tRaw = container.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
          const tNorm = this.normalizeGlbEntity(tRaw, displayName);
          const holder = new pc.Entity(`TrafficLocalCar_${displayName}`);
          holder.addChild(tNorm.wrapper);
          tNorm.wrapper.addChild(createSeatedDriverEntity(this.localCounter, tNorm.length, displayName));
          world.registerTrafficCar(
            holder,
            tNorm.wheels.map((w) => ({ spinPivot: w.spinPivot, radius: w.radius })),
            1,
            Math.random(),
            10.5
          );
        } catch {
          // Ignore traffic clone errors
        }
      }

      return car;
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
