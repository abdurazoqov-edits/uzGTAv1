import * as pc from 'playcanvas';

interface DeformablePart {
  meshInstance: pc.MeshInstance;
  mesh: pc.Mesh;
  origPositions: Float32Array;
  curPositions: Float32Array;
  indices: number[];
  cloned: boolean;
}

const SKIP_PART_RE = /wheel|tire|tyre|rim|hub|plate|nitro|flame|driver|human|shadow|exhaust/i;

function cloneMeshForDeformation(device: pc.GraphicsDevice, src: pc.Mesh): {
  mesh: pc.Mesh;
  origPositions: Float32Array;
  curPositions: Float32Array;
  indices: number[];
} | null {
  const posArr: number[] = [];
  const normArr: number[] = [];
  const uv0Arr: number[] = [];
  const uv1Arr: number[] = [];
  const idxArr: number[] = [];

  const nVerts = src.getPositions(posArr);
  if (nVerts < 3) return null;
  const nNorms = src.getNormals(normArr);
  const nUv0 = src.getUvs(0, uv0Arr);
  const nUv1 = src.getUvs(1, uv1Arr);
  const nIdx = src.getIndices(idxArr);

  const indices = nIdx >= 3 ? idxArr : Array.from({ length: nVerts }, (_, i) => i);

  const mesh = new pc.Mesh(device);
  mesh.setPositions(posArr);
  if (nNorms >= nVerts) {
    mesh.setNormals(normArr);
  } else {
    mesh.setNormals(pc.calculateNormals(posArr, indices));
  }
  if (nUv0 >= nVerts) mesh.setUvs(0, uv0Arr);
  if (nUv1 >= nVerts) mesh.setUvs(1, uv1Arr);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  const origPositions = new Float32Array(posArr);
  const curPositions = new Float32Array(posArr);
  return { mesh, origPositions, curPositions, indices };
}

/**
 * Real-Time 3D Car Crash Denting / Crumpling System ("pachoq bo'lish").
 * - Lazily clones shared GLB body meshes on first impact so every car dents independently.
 * - Physically crumples vertices at the exact world impact zone with sheet-metal crease waves
 *   and recalculates smooth normals in real time.
 * - Emits dark engine-hood smoke puffs when damageLevel > 0.45.
 * - Fully restores pristine factory bodywork via repair() (e.g. Reset [R]).
 */
export class CarDamageRig {
  private readonly device: pc.GraphicsDevice;
  private readonly wrapper: pc.Entity;
  private readonly parts: DeformablePart[] = [];
  private readonly smokePuffs: Array<{ entity: pc.Entity; age: number; life: number; vx: number; vz: number }> = [];
  private readonly smokeHolder: pc.Entity;
  private readonly carLength: number;
  private prepared = false;
  public damageLevel = 0; // 0..1

  constructor(device: pc.GraphicsDevice, wrapper: pc.Entity, carLength: number) {
    this.device = device;
    this.wrapper = wrapper;
    this.carLength = carLength;

    this.smokeHolder = new pc.Entity('DamageHoodSmoke');
    this.smokeHolder.setLocalPosition(0, 0.85, -carLength * 0.32);
    this.wrapper.addChild(this.smokeHolder);

    const smokeMat = new pc.StandardMaterial();
    smokeMat.diffuse.set(0.18, 0.19, 0.21);
    smokeMat.emissive.set(0.06, 0.06, 0.07);
    smokeMat.opacity = 0.44;
    smokeMat.blendType = pc.BLEND_NORMAL;
    smokeMat.depthWrite = false;
    smokeMat.update();

    for (let i = 0; i < 6; i++) {
      const puff = new pc.Entity(`HoodSmoke_${i}`);
      puff.enabled = false;
      puff.addComponent('render', {
        type: 'sphere',
        material: smokeMat,
        castShadows: false,
        receiveShadows: false,
      });
      this.smokeHolder.addChild(puff);
      this.smokePuffs.push({
        entity: puff,
        age: i * 0.24,
        life: 1.35,
        vx: (Math.random() - 0.5) * 0.35,
        vz: 0.35 + Math.random() * 0.3,
      });
    }
  }

  private ensurePrepared(): void {
    if (this.prepared) return;
    this.prepared = true;

    const comps = this.wrapper.findComponents('render') as pc.RenderComponent[];
    for (const rc of comps) {
      if (!rc.enabled || !rc.entity.enabled) continue;
      if (SKIP_PART_RE.test(rc.entity.name || '')) continue;
      // Check ancestor names inside wrapper (exclude wheels, driver, plates, nitro!)
      let p: pc.GraphNode | null = rc.entity;
      let skip = false;
      while (p && p !== this.wrapper) {
        if (SKIP_PART_RE.test(p.name || '')) {
          skip = true;
          break;
        }
        p = p.parent;
      }
      if (skip) continue;

      for (const mi of rc.meshInstances) {
        if (!mi.visible || !mi.mesh || mi.instancingData) continue;
        // Skip skinned meshes
        if (mi.skinInstance) continue;

        const cloned = cloneMeshForDeformation(this.device, mi.mesh);
        if (!cloned) continue;

        mi.mesh = cloned.mesh;
        this.parts.push({
          meshInstance: mi,
          mesh: cloned.mesh,
          origPositions: cloned.origPositions,
          curPositions: cloned.curPositions,
          indices: cloned.indices,
          cloned: true,
        });
      }
    }
  }

  /**
   * Deforms the car's 3D body panels around a world-space collision point.
   * @param worldImpactPoint Contact point in world coordinates
   * @param worldImpactDir   Direction the impact pushes INTO this car (normalized)
   * @param intensity        0.15..1.0 crash severity
   */
  public applyImpact(worldImpactPoint: pc.Vec3, worldImpactDir: pc.Vec3, intensity: number): void {
    const clampedInt = Math.max(0.15, Math.min(1.0, intensity));
    this.ensurePrepared();
    if (this.parts.length === 0) return;

    this.damageLevel = Math.min(1.0, this.damageLevel + clampedInt * 0.34);

    const worldRadius = 0.78 + clampedInt * 0.62; // 0.87m .. 1.40m crumple zone
    const worldDepth = 0.14 + clampedInt * 0.28;  // 0.18m .. 0.42m push depth
    const maxWorldDisp = 0.46;

    const invMat = new pc.Mat4();
    const scaleVec = new pc.Vec3();
    const localPoint = new pc.Vec3();
    const localDir = new pc.Vec3();
    const localUp = new pc.Vec3();

    for (let p = 0; p < this.parts.length; p++) {
      const part = this.parts[p];
      const nodeWorld = part.meshInstance.node.getWorldTransform();
      nodeWorld.getScale(scaleVec);
      const avgScale = Math.max(0.001, (Math.abs(scaleVec.x) + Math.abs(scaleVec.y) + Math.abs(scaleVec.z)) / 3);

      invMat.copy(nodeWorld).invert();
      invMat.transformPoint(worldImpactPoint, localPoint);
      invMat.transformVector(worldImpactDir, localDir);
      if (localDir.lengthSq() > 1e-8) localDir.normalize();
      else localDir.set(0, 0, 1);

      // Slight upward hood/fender buckling axis in mesh local space
      invMat.transformVector(pc.Vec3.UP, localUp);
      if (localUp.lengthSq() > 1e-8) localUp.normalize();

      const localRadius = worldRadius / avgScale;
      const localRadiusSq = localRadius * localRadius;
      const localDepth = worldDepth / avgScale;
      const maxLocalDisp = maxWorldDisp / avgScale;
      const maxLocalDispSq = maxLocalDisp * maxLocalDisp;

      const cur = part.curPositions;
      const orig = part.origPositions;
      const nVerts = cur.length / 3;
      let modified = false;

      for (let i = 0; i < nVerts; i++) {
        const i3 = i * 3;
        const vx = cur[i3];
        const vy = cur[i3 + 1];
        const vz = cur[i3 + 2];

        const dx = vx - localPoint.x;
        const dy = vy - localPoint.y;
        const dz = vz - localPoint.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq >= localRadiusSq) continue;

        const dist = Math.sqrt(distSq);
        const normD = dist / localRadius;
        const falloff = (1 - normD) * (1 - normD);

        // Realistic sheet-metal crinkle/crease pattern
        const crease = 0.84 + 0.34 * Math.sin(orig[i3] * 14.3 + orig[i3 + 2] * 17.7) * Math.cos(orig[i3 + 1] * 13.1);
        const push = localDepth * falloff * crease;
        const buckleUp = localDepth * 0.16 * falloff * (0.5 + 0.5 * Math.sin(orig[i3] * 9.5));

        let nx = vx + localDir.x * push + localUp.x * buckleUp;
        let ny = vy + localDir.y * push + localUp.y * buckleUp;
        let nz = vz + localDir.z * push + localUp.z * buckleUp;

        // Clamp total displacement from factory mesh so panels never invert inside-out
        const ox = nx - orig[i3];
        const oy = ny - orig[i3 + 1];
        const oz = nz - orig[i3 + 2];
        const oDistSq = ox * ox + oy * oy + oz * oz;
        if (oDistSq > maxLocalDispSq) {
          const clampRatio = maxLocalDisp / Math.sqrt(oDistSq);
          nx = orig[i3] + ox * clampRatio;
          ny = orig[i3 + 1] + oy * clampRatio;
          nz = orig[i3 + 2] + oz * clampRatio;
        }

        cur[i3] = nx;
        cur[i3 + 1] = ny;
        cur[i3 + 2] = nz;
        modified = true;
      }

      if (modified) {
        part.mesh.setPositions(cur);
        part.mesh.setNormals(pc.calculateNormals(cur, part.indices));
        part.mesh.update(pc.PRIMITIVE_TRIANGLES);
      }
    }
  }

  public updateSmoke(dt: number, speedMps: number): void {
    const showSmoke = this.damageLevel > 0.45;
    for (let i = 0; i < this.smokePuffs.length; i++) {
      const s = this.smokePuffs[i];
      if (!showSmoke) {
        s.entity.enabled = false;
        continue;
      }
      s.entity.enabled = true;
      s.age += dt * (0.8 + this.damageLevel * 0.65);
      if (s.age >= s.life) {
        s.age = 0;
        s.vx = (Math.random() - 0.5) * 0.45;
        s.vz = 0.25 + Math.min(1.4, speedMps * 0.08);
      }
      const t = s.age / s.life;
      const sc = 0.16 + t * (0.58 + this.damageLevel * 0.35);
      s.entity.setLocalPosition(s.vx * t * 1.1, t * 1.45, s.vz * t * 1.3);
      s.entity.setLocalScale(sc, sc * 0.85, sc);
    }
  }

  public repair(): void {
    this.damageLevel = 0;
    for (let i = 0; i < this.smokePuffs.length; i++) {
      this.smokePuffs[i].entity.enabled = false;
    }
    if (!this.prepared) return;
    for (let p = 0; p < this.parts.length; p++) {
      const part = this.parts[p];
      part.curPositions.set(part.origPositions);
      part.mesh.setPositions(part.curPositions);
      part.mesh.setNormals(pc.calculateNormals(part.curPositions, part.indices));
      part.mesh.update(pc.PRIMITIVE_TRIANGLES);
    }
  }

  public getHoodWorldPos(out: pc.Vec3): pc.Vec3 {
    out.set(0, 0.85, -this.carLength * 0.36);
    this.wrapper.getWorldTransform().transformPoint(out, out);
    return out;
  }
}

interface SparkParticle {
  entity: pc.Entity;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * Lightweight pooled 3D crash sparks & metallic impact flash bursts (mobile-GPU safe!).
 */
export class CrashFxSystem {
  private readonly root: pc.Entity;
  private readonly sparks: SparkParticle[] = [];
  private cursor = 0;

  constructor(app: pc.Application) {
    this.root = new pc.Entity('CrashFxRoot');
    app.root.addChild(this.root);

    const sparkMat = new pc.StandardMaterial();
    sparkMat.diffuse.set(1.0, 0.82, 0.28);
    sparkMat.emissive.set(1.0, 0.65, 0.15);
    sparkMat.emissiveIntensity = 4.2;
    sparkMat.useLighting = false;
    sparkMat.update();

    for (let i = 0; i < 28; i++) {
      const e = new pc.Entity(`CrashSpark_${i}`);
      e.enabled = false;
      e.addComponent('render', {
        type: 'box',
        material: sparkMat,
        castShadows: false,
        receiveShadows: false,
      });
      this.root.addChild(e);
      this.sparks.push({
        entity: e,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.35,
      });
    }
  }

  public spawnImpactSparks(point: pc.Vec3, normal: pc.Vec3, intensity: number): void {
    const count = Math.min(16, Math.max(6, Math.round(6 + intensity * 10)));
    for (let i = 0; i < count; i++) {
      const sp = this.sparks[this.cursor];
      this.cursor = (this.cursor + 1) % this.sparks.length;

      const spread = 3.5 + intensity * 5.5;
      sp.x = point.x + (Math.random() - 0.5) * 0.25;
      sp.y = Math.max(0.25, point.y + (Math.random() - 0.3) * 0.25);
      sp.z = point.z + (Math.random() - 0.5) * 0.25;
      sp.vx = normal.x * (2.5 + Math.random() * 4.0) + (Math.random() - 0.5) * spread;
      sp.vy = 2.0 + Math.random() * (3.2 + intensity * 2.5);
      sp.vz = normal.z * (2.5 + Math.random() * 4.0) + (Math.random() - 0.5) * spread;
      sp.maxLife = 0.24 + Math.random() * 0.26;
      sp.life = sp.maxLife;
      sp.entity.enabled = true;
      sp.entity.setLocalPosition(sp.x, sp.y, sp.z);
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i];
      if (sp.life <= 0) continue;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.entity.enabled = false;
        continue;
      }
      sp.vy -= 18.0 * dt;
      sp.x += sp.vx * dt;
      sp.y = Math.max(0.08, sp.y + sp.vy * dt);
      sp.z += sp.vz * dt;
      const t = sp.life / sp.maxLife;
      const len = 0.14 + t * 0.26;
      sp.entity.setLocalPosition(sp.x, sp.y, sp.z);
      sp.entity.setLocalScale(0.055 * t + 0.02, 0.055 * t + 0.02, len);
      sp.entity.setLocalEulerAngles(0, (Math.atan2(sp.vx, sp.vz) * 180) / Math.PI, 0);
    }
  }
}
