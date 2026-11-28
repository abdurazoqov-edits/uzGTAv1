import * as pc from 'playcanvas';

export interface RiggedBone {
  node: pc.GraphNode;
  baseQuat: pc.Quat;
  basePos: pc.Vec3;
  // Bone-local unit vectors corresponding to the character wrapper's +X (right), +Y (up), +Z (back)
  localRight: pc.Vec3;
  localUp: pc.Vec3;
  localBack: pc.Vec3;
}

export interface HumanoidRig {
  hips?: RiggedBone;
  spine?: RiggedBone;
  head?: RiggedBone;
  leftUpLeg?: RiggedBone;
  rightUpLeg?: RiggedBone;
  leftLeg?: RiggedBone;
  rightLeg?: RiggedBone;
  leftArm?: RiggedBone;
  rightArm?: RiggedBone;
  leftForeArm?: RiggedBone;
  rightForeArm?: RiggedBone;
  leftArmDropDeg: number;
  rightArmDropDeg: number;
}

export interface HumanAppearance {
  skin: [number, number, number];
  hair: [number, number, number];
  jacket: [number, number, number];
  shirt: [number, number, number];
  pants: [number, number, number];
  shoes: [number, number, number];
  hasSunglasses?: boolean;
  isSwimmer?: boolean;
  heightScale?: number;
}

export const DEFAULT_PLAYER_APPEARANCE: HumanAppearance = {
  skin: [0.85, 0.67, 0.54],
  hair: [0.10, 0.08, 0.07],
  jacket: [0.14, 0.22, 0.36],
  shirt: [0.94, 0.95, 0.97],
  pants: [0.14, 0.19, 0.29],
  shoes: [0.94, 0.95, 0.97],
  hasSunglasses: false,
  isSwimmer: false,
  heightScale: 1.0,
};

let cachedRpmPromise: Promise<pc.ContainerResource | null> | null = null;

function loadContainerSafe(app: pc.Application, url: string, name: string): Promise<pc.ContainerResource | null> {
  return new Promise((resolve) => {
    const asset = new pc.Asset(name, 'container', { url });
    asset.once('load', () => {
      resolve((asset.resource as pc.ContainerResource | null) || null);
    });
    asset.once('error', () => resolve(null));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

export function getSharedRpmHumanGlb(app: pc.Application): Promise<pc.ContainerResource | null> {
  if (!cachedRpmPromise) {
    cachedRpmPromise = loadContainerSafe(app, './assets/glb/human_rpm.glb', 'human_rpm.glb');
  }
  return cachedRpmPromise;
}

/**
 * Computes exact fresh world-space bounding box of an entity hierarchy.
 * Properly handles BOTH:
 *  - Skinned humanoid meshes (`mi.skinInstance`): updates skin matrices and reads bone/skinned AABBs
 *    (so Mixamo/Quaternius 0.01-scaled armatures NEVER blow up into giants!).
 *  - Static/rigid meshes: transforms `mi.mesh.aabb` by `mi.node.getWorldTransform()`.
 */
export function computeFreshEntityBounds(entity: pc.Entity): pc.BoundingBox | null {
  entity.getWorldTransform();
  const renderComps = entity.findComponents('render') as pc.RenderComponent[];
  let combined: pc.BoundingBox | null = null;
  const tmp = new pc.BoundingBox();

  for (const rc of renderComps) {
    if (!rc.enabled || !rc.entity.enabled) continue;
    for (const mi of rc.meshInstances) {
      if (!mi.visible || !mi.mesh) continue;

      if (mi.skinInstance && mi.skinInstance.bones && mi.skinInstance.bones.length > 0) {
        try {
          mi.skinInstance.updateMatrices(mi.node, 0);
          mi.skinInstance.updateMatrixPalette(mi.node, 0);
        } catch {
          // Ignore
        }
        // Compute bone cloud bounds in world space as ground truth for skinned characters
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const b of mi.skinInstance.bones) {
          if (!b) continue;
          const p = b.getPosition();
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.z < minZ) minZ = p.z;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
          if (p.z > maxZ) maxZ = p.z;
        }
        const boneH = maxY - minY;
        const miBox = mi.aabb;
        const miH = miBox ? miBox.halfExtents.y * 2 : 0;

        // Use mi.aabb if consistent with skeleton height, else use skeleton bone bounds (padded slightly for head/feet)
        if (miBox && miH > 0.02 && (boneH <= 0.02 || Math.abs(miH - boneH) < boneH * 0.65)) {
          tmp.copy(miBox);
        } else if (boneH > 0.02) {
          const pad = boneH * 0.07;
          tmp.setMinMax(
            new pc.Vec3(minX - pad, minY - pad * 0.4, minZ - pad),
            new pc.Vec3(maxX + pad, maxY + pad * 1.1, maxZ + pad)
          );
        } else {
          tmp.setFromTransformedAabb(mi.mesh.aabb, mi.node.getWorldTransform());
        }
      } else {
        tmp.setFromTransformedAabb(mi.mesh.aabb, mi.node.getWorldTransform());
      }

      if (!combined) combined = tmp.clone();
      else combined.add(tmp);
    }
  }
  return combined;
}

function matchBone(name: string, re: RegExp): boolean {
  return re.test(name.replace(/mixamorig[:_]?/i, '').replace(/^.*\|/, ''));
}

const _tmpQ1 = new pc.Quat();
const _tmpQ2 = new pc.Quat();
const _tmpQ3 = new pc.Quat();
const _tmpQOut = new pc.Quat();

export function applyBoneCharAngles(
  bone: RiggedBone | undefined,
  pitchDeg: number,
  yawDeg: number,
  rollDeg: number
): void {
  if (!bone) return;
  _tmpQOut.copy(bone.baseQuat);
  if (Math.abs(yawDeg) > 0.01) {
    _tmpQ1.setFromAxisAngle(bone.localUp, yawDeg);
    _tmpQOut.mul(_tmpQ1);
  }
  if (Math.abs(pitchDeg) > 0.01) {
    _tmpQ2.setFromAxisAngle(bone.localRight, pitchDeg);
    _tmpQOut.mul(_tmpQ2);
  }
  if (Math.abs(rollDeg) > 0.01) {
    _tmpQ3.setFromAxisAngle(bone.localBack, rollDeg);
    _tmpQOut.mul(_tmpQ3);
  }
  bone.node.setLocalRotation(_tmpQOut);
}

export function discoverCharacterSpaceRig(wrapper: pc.Entity, searchRoot: pc.GraphNode): HumanoidRig {
  wrapper.getWorldTransform();
  const wrapperWorldRot = wrapper.getRotation().clone();
  const invWrapperMat = wrapper.getWorldTransform().clone().invert();

  const wRight = wrapperWorldRot.transformVector(new pc.Vec3(1, 0, 0));
  const wUp = wrapperWorldRot.transformVector(new pc.Vec3(0, 1, 0));
  const wBack = wrapperWorldRot.transformVector(new pc.Vec3(0, 0, 1));

  const rig: HumanoidRig = { leftArmDropDeg: 0, rightArmDropDeg: 0 };

  const captureBone = (n: pc.GraphNode): RiggedBone => {
    const invBoneRot = n.getRotation().clone().invert();
    return {
      node: n,
      baseQuat: n.getLocalRotation().clone(),
      basePos: n.getLocalPosition().clone(),
      localRight: invBoneRot.transformVector(wRight.clone()).normalize(),
      localUp: invBoneRot.transformVector(wUp.clone()).normalize(),
      localBack: invBoneRot.transformVector(wBack.clone()).normalize(),
    };
  };

  const walk = (n: pc.GraphNode) => {
    const nm = n.name || '';
    const capture = (key: Exclude<keyof HumanoidRig, 'leftArmDropDeg' | 'rightArmDropDeg'>) => {
      if (!rig[key]) {
        rig[key] = captureBone(n);
      }
    };
    if (matchBone(nm, /^(hips|pelvis|root_hips|root)$/i)) capture('hips');
    else if (matchBone(nm, /^(spine1?|chest|torso|abdomen)$/i)) capture('spine');
    else if (matchBone(nm, /^head$/i)) capture('head');
    else if (
      matchBone(nm, /^(left|l)[_.\s-]?(upleg|upper_?leg|thigh|hip)$/i) ||
      matchBone(nm, /^(upleg|upper_?leg|thigh)[_.\s-]?(l|left)$/i)
    )
      capture('leftUpLeg');
    else if (
      matchBone(nm, /^(right|r)[_.\s-]?(upleg|upper_?leg|thigh|hip)$/i) ||
      matchBone(nm, /^(upleg|upper_?leg|thigh)[_.\s-]?(r|right)$/i)
    )
      capture('rightUpLeg');
    else if (
      matchBone(nm, /^(left|l)[_.\s-]?(leg|shin|calf|lower_?leg|knee)$/i) ||
      matchBone(nm, /^(leg|shin|calf|lower_?leg)[_.\s-]?(l|left)$/i)
    )
      capture('leftLeg');
    else if (
      matchBone(nm, /^(right|r)[_.\s-]?(leg|shin|calf|lower_?leg|knee)$/i) ||
      matchBone(nm, /^(leg|shin|calf|lower_?leg)[_.\s-]?(r|right)$/i)
    )
      capture('rightLeg');
    else if (
      matchBone(nm, /^(left|l)[_.\s-]?(arm|upper_?arm|shoulder_arm)$/i) ||
      matchBone(nm, /^(upper_?arm|arm)[_.\s-]?(l|left)$/i)
    )
      capture('leftArm');
    else if (
      matchBone(nm, /^(right|r)[_.\s-]?(arm|upper_?arm|shoulder_arm)$/i) ||
      matchBone(nm, /^(upper_?arm|arm)[_.\s-]?(r|right)$/i)
    )
      capture('rightArm');
    else if (
      matchBone(nm, /^(left|l)[_.\s-]?(forearm|lower_?arm|elbow)$/i) ||
      matchBone(nm, /^(forearm|lower_?arm)[_.\s-]?(l|left)$/i)
    )
      capture('leftForeArm');
    else if (
      matchBone(nm, /^(right|r)[_.\s-]?(forearm|lower_?arm|elbow)$/i) ||
      matchBone(nm, /^(forearm|lower_?arm)[_.\s-]?(r|right)$/i)
    )
      capture('rightForeArm');

    for (const ch of n.children) walk(ch);
  };
  walk(searchRoot);

  const computeDropDeg = (arm: RiggedBone | undefined, fore: RiggedBone | undefined, isLeft: boolean): number => {
    if (!arm || !fore) return 0;
    const pArm = invWrapperMat.transformPoint(arm.node.getPosition().clone());
    const pFore = invWrapperMat.transformPoint(fore.node.getPosition().clone());
    const dir = pFore.sub(pArm);
    if (dir.lengthSq() < 1e-5) return 0;
    const outDist = isLeft ? -dir.x : dir.x;
    const downDist = -dir.y;
    const spreadFromDownDeg = (Math.atan2(Math.max(0, outDist), Math.max(0.01, downDist)) * 180) / Math.PI;
    return Math.max(0, Math.min(78, spreadFromDownDeg - 11));
  };

  rig.leftArmDropDeg = computeDropDeg(rig.leftArm, rig.leftForeArm, true);
  rig.rightArmDropDeg = computeDropDeg(rig.rightArm, rig.rightForeArm, false);

  return rig;
}

export function hasAnyLimbBones(rig: HumanoidRig): boolean {
  return Boolean(rig.leftUpLeg || rig.rightUpLeg || rig.leftArm || rig.rightArm);
}

export function tintHumanGlbMaterials(
  entity: pc.Entity,
  tint: {
    top?: [number, number, number];
    bottom?: [number, number, number];
    shoes?: [number, number, number];
    hair?: [number, number, number];
    skin?: [number, number, number];
  },
  castShadows: boolean
): void {
  const comps = entity.findComponents('render') as pc.RenderComponent[];
  const matCache = new Map<pc.Material, pc.Material>();

  for (const rc of comps) {
    rc.castShadows = castShadows;
    rc.receiveShadows = true;
    for (const mi of rc.meshInstances) {
      const orig = mi.material;
      if (!(orig instanceof pc.StandardMaterial)) continue;

      let cloned = matCache.get(orig);
      if (!cloned) {
        const m = orig.clone();
        const nm = (m.name || '').toLowerCase();
        if (tint.top && /outfit_top|t-shirt|shirt|jacket|body|top/.test(nm) && !/skin|head|eye|teeth/.test(nm)) {
          m.diffuse.set(tint.top[0], tint.top[1], tint.top[2]);
        } else if (tint.bottom && /outfit_bottom|short|pants|jeans|bottom/.test(nm)) {
          m.diffuse.set(tint.bottom[0], tint.bottom[1], tint.bottom[2]);
        } else if (tint.shoes && /footwear|shoe|boot/.test(nm)) {
          m.diffuse.set(tint.shoes[0], tint.shoes[1], tint.shoes[2]);
        } else if (tint.hair && /hair|headwear|beard/.test(nm)) {
          m.diffuse.set(tint.hair[0], tint.hair[1], tint.hair[2]);
        } else if (tint.skin && /skin|head|face/.test(nm) && !/hair|eye|teeth|shirt/.test(nm)) {
          m.diffuse.set(tint.skin[0], tint.skin[1], tint.skin[2]);
        }
        m.gloss = Math.min(m.gloss, 0.34);
        m.update();
        matCache.set(orig, m);
        cloned = m;
      }
      mi.material = cloned;
    }
  }
}

export function instantiateNormalizedHumanGlb(
  app: pc.Application,
  resource: pc.ContainerResource,
  targetHeight = 1.78,
  castShadows = true,
  tint?: {
    top?: [number, number, number];
    bottom?: [number, number, number];
    shoes?: [number, number, number];
    hair?: [number, number, number];
    skin?: [number, number, number];
  }
): { wrapper: pc.Entity; entity: pc.Entity; rig: HumanoidRig } {
  const wrapper = new pc.Entity('RealHumanGlbWrapper');
  const orient = new pc.Entity('RealHumanOrient');
  const entity = resource.instantiateRenderEntity({
    castShadows,
    receiveShadows: true,
  });

  orient.setLocalEulerAngles(0, 180, 0);
  orient.addChild(entity);
  wrapper.addChild(orient);

  app.root.addChild(wrapper);
  wrapper.getWorldTransform();

  const bounds = computeFreshEntityBounds(entity);
  if (bounds) {
    const spanX = Math.max(0.05, bounds.halfExtents.x * 2);
    const spanY = Math.max(0.05, bounds.halfExtents.y * 2);
    const spanZ = Math.max(0.05, bounds.halfExtents.z * 2);

    if (spanZ > spanY * 1.65 && spanZ > spanX * 1.25) {
      orient.setLocalEulerAngles(-90, 180, 0);
    }

    const uprightBounds = computeFreshEntityBounds(orient);
    if (uprightBounds) {
      const h = Math.max(0.05, uprightBounds.halfExtents.y * 2);
      const sc = targetHeight / h;
      orient.setLocalScale(sc, sc, sc);

      const scaledBounds = computeFreshEntityBounds(orient);
      if (scaledBounds) {
        const minY = scaledBounds.center.y - scaledBounds.halfExtents.y;
        orient.setLocalPosition(-scaledBounds.center.x, -minY, -scaledBounds.center.z);
      }
    }
  }

  if (tint) {
    tintHumanGlbMaterials(entity, tint, castShadows);
  } else {
    tintHumanGlbMaterials(entity, {}, castShadows);
  }

  const rig = discoverCharacterSpaceRig(wrapper, entity);
  app.root.removeChild(wrapper);

  return { wrapper, entity, rig };
}

export function buildRealisticHumanEntity(
  appearance: HumanAppearance = DEFAULT_PLAYER_APPEARANCE,
  castShadows = true
): { entity: pc.Entity; rig: HumanoidRig } {
  const root = new pc.Entity('FallbackHuman');
  const hScale = appearance.heightScale ?? 1.0;
  root.setLocalScale(hScale, hScale, hScale);

  const mkMat = (r: number, g: number, b: number, gloss = 0.28, metal = 0.04) => {
    const m = new pc.StandardMaterial();
    m.diffuse.set(r, g, b);
    m.useMetalness = true;
    m.metalness = metal;
    m.gloss = gloss;
    m.update();
    return m;
  };

  const skinMat = mkMat(appearance.skin[0], appearance.skin[1], appearance.skin[2], 0.30, 0.0);
  const hairMat = mkMat(appearance.hair[0], appearance.hair[1], appearance.hair[2], 0.30, 0.04);
  const jacketMat = mkMat(appearance.jacket[0], appearance.jacket[1], appearance.jacket[2], 0.30, 0.06);
  const shirtMat = mkMat(appearance.shirt[0], appearance.shirt[1], appearance.shirt[2], 0.22, 0.0);
  const pantsMat = mkMat(appearance.pants[0], appearance.pants[1], appearance.pants[2], 0.22, 0.02);
  const shoeMat = mkMat(appearance.shoes[0], appearance.shoes[1], appearance.shoes[2], 0.42, 0.06);

  const addPart = (
    parent: pc.Entity,
    name: string,
    type: 'capsule' | 'sphere' | 'cylinder' | 'box',
    pos: [number, number, number],
    scale: [number, number, number],
    mat: pc.Material
  ) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    e.addComponent('render', { type, material: mat, castShadows, receiveShadows: true });
    parent.addChild(e);
    return e;
  };

  const hips = new pc.Entity('Hips');
  hips.setLocalPosition(0, 0.94, 0);
  root.addChild(hips);
  addPart(hips, 'Pelvis', 'capsule', [0, 0.01, 0], [0.30, 0.18, 0.20], pantsMat);

  const spine = new pc.Entity('Spine');
  spine.setLocalPosition(0, 0.11, 0);
  hips.addChild(spine);
  addPart(spine, 'Chest', 'capsule', [0, 0.25, 0], [0.37, 0.36, 0.22], jacketMat);
  addPart(spine, 'InnerTee', 'capsule', [0, 0.24, -0.05], [0.16, 0.32, 0.14], shirtMat);

  const head = new pc.Entity('Head');
  head.setLocalPosition(0, 0.46, 0);
  spine.addChild(head);
  addPart(head, 'Neck', 'cylinder', [0, 0.05, 0], [0.10, 0.10, 0.10], skinMat);
  addPart(head, 'Cranium', 'sphere', [0, 0.185, 0], [0.19, 0.21, 0.20], skinMat);
  addPart(head, 'Hair', 'sphere', [0, 0.22, 0.015], [0.20, 0.14, 0.21], hairMat);

  const mkArm = (side: -1 | 1, prefix: string) => {
    const arm = new pc.Entity(`${prefix}Arm`);
    arm.setLocalPosition(side * 0.23, 0.37, 0);
    spine.addChild(arm);
    addPart(arm, `${prefix}Bicep`, 'capsule', [0, -0.135, 0], [0.10, 0.28, 0.10], jacketMat);
    const fore = new pc.Entity(`${prefix}ForeArm`);
    fore.setLocalPosition(0, -0.27, 0);
    arm.addChild(fore);
    addPart(fore, `${prefix}LowerArm`, 'capsule', [0, -0.125, 0], [0.085, 0.25, 0.085], jacketMat);
    addPart(fore, `${prefix}Hand`, 'capsule', [0, -0.28, 0], [0.07, 0.10, 0.055], skinMat);
    return { arm, fore };
  };
  const lArm = mkArm(-1, 'Left');
  const rArm = mkArm(1, 'Right');

  const mkLeg = (side: -1 | 1, prefix: string) => {
    const up = new pc.Entity(`${prefix}UpLeg`);
    up.setLocalPosition(side * 0.105, -0.02, 0);
    hips.addChild(up);
    addPart(up, `${prefix}Thigh`, 'capsule', [0, -0.215, 0], [0.14, 0.43, 0.14], pantsMat);
    const low = new pc.Entity(`${prefix}Leg`);
    low.setLocalPosition(0, -0.43, 0);
    up.addChild(low);
    addPart(low, `${prefix}Calf`, 'capsule', [0, -0.215, 0], [0.11, 0.42, 0.11], pantsMat);
    addPart(low, `${prefix}Foot`, 'capsule', [0, -0.43, -0.04], [0.10, 0.09, 0.22], shoeMat);
    return { up, low };
  };
  const lLeg = mkLeg(-1, 'Left');
  const rLeg = mkLeg(1, 'Right');

  const mkBone = (node: pc.Entity): RiggedBone => ({
    node,
    baseQuat: node.getLocalRotation().clone(),
    basePos: node.getLocalPosition().clone(),
    localRight: new pc.Vec3(1, 0, 0),
    localUp: new pc.Vec3(0, 1, 0),
    localBack: new pc.Vec3(0, 0, 1),
  });

  const rig: HumanoidRig = {
    hips: mkBone(hips),
    spine: mkBone(spine),
    head: mkBone(head),
    leftUpLeg: mkBone(lLeg.up),
    rightUpLeg: mkBone(rLeg.up),
    leftLeg: mkBone(lLeg.low),
    rightLeg: mkBone(rLeg.low),
    leftArm: mkBone(lArm.arm),
    rightArm: mkBone(rArm.arm),
    leftForeArm: mkBone(lArm.fore),
    rightForeArm: mkBone(rArm.fore),
    leftArmDropDeg: 0,
    rightArmDropDeg: 0,
  };

  return { entity: root, rig };
}

type CharacterAnimKey =
  | 'idle'
  | 'walk'
  | 'run'
  | 'runBack'
  | 'runLeft'
  | 'runRight'
  | 'punchLeft'
  | 'punchRight'
  | 'kickLeft'
  | 'kickRight'
  | 'roll'
  | 'gunIdle'
  | 'gunShoot'
  | 'interact'
  | 'hit'
  | 'death';

export class PlayableCharacter {
  private readonly app: pc.Application;
  public readonly root: pc.Entity;
  private readonly modelHolder: pc.Entity;

  public x = -3.4;
  public y = 0.05;
  public z = 58.0;
  public yaw = 0; // degrees; forward = (-sin, -cos)
  public speed = 0;
  public isRunning = false;
  public isCustomGlb = false;
  public label = 'Player';
  public flip180 = false;

  private activeModel: pc.Entity | null = null;
  private rig: HumanoidRig = { leftArmDropDeg: 0, rightArmDropDeg: 0 };
  private usesEmbeddedAnim = false;
  private animComp: pc.AnimComponent | null = null;
  private animNames: Partial<Record<CharacterAnimKey, string>> = {};
  private currentClip = '';
  private gaitPhase = 0;

  private lookPitchDeg = 0;

  // Action timers (ONLY play when user presses the corresponding button/key!)
  private punchTimer = 0;
  private readonly punchDuration = 0.42;
  private punchHandRight = true;

  private kickTimer = 0;
  private readonly kickDuration = 0.50;
  private kickFootRight = true;

  private rollTimer = 0;
  private readonly rollDuration = 0.56;
  private rollDirX = 0;
  private rollDirZ = -1;

  private shootTimer = 0;
  private readonly shootDuration = 0.36;

  private interactTimer = 0;
  private readonly interactDuration = 0.65;

  constructor(app: pc.Application) {
    this.app = app;
    this.root = new pc.Entity('PlayableCharacterRoot');
    this.modelHolder = new pc.Entity('CharacterModelHolder');
    this.root.addChild(this.modelHolder);
    this.app.root.addChild(this.root);

    this.installFallback();
    this.setPosition(this.x, this.y, this.z, this.yaw);
  }

  public async loadDefaultRealHuman(): Promise<void> {
    if (this.isCustomGlb) return;
    const res = await getSharedRpmHumanGlb(this.app);
    if (!res || this.isCustomGlb) return;
    this.mountBuiltinRpm(res);
  }

  private clearActiveModel(): void {
    if (this.activeModel) {
      this.activeModel.destroy();
      this.activeModel = null;
    }
    this.rig = { leftArmDropDeg: 0, rightArmDropDeg: 0 };
    this.animComp = null;
    this.usesEmbeddedAnim = false;
    this.animNames = {};
    this.currentClip = '';
  }

  private installFallback(): void {
    this.clearActiveModel();
    const { entity, rig } = buildRealisticHumanEntity(DEFAULT_PLAYER_APPEARANCE, true);
    this.activeModel = entity;
    this.rig = rig;
    this.isCustomGlb = false;
    this.label = 'Player';
    this.modelHolder.addChild(entity);
  }

  private mountBuiltinRpm(resource: pc.ContainerResource): void {
    this.clearActiveModel();
    const { wrapper, rig } = instantiateNormalizedHumanGlb(this.app, resource, 1.80, true, {
      top: [0.85, 0.90, 0.98],
      bottom: [0.78, 0.84, 0.94],
    });
    this.activeModel = wrapper;
    this.rig = rig;
    this.isCustomGlb = false;
    this.label = 'Player';
    this.modelHolder.addChild(wrapper);
  }

  public async loadFromUrl(url: string, displayName = 'character.glb'): Promise<boolean> {
    try {
      const container = await new Promise<pc.ContainerResource>((resolve, reject) => {
        const asset = new pc.Asset(displayName, 'container', { url });
        asset.once('load', () => {
          const res = asset.resource as pc.ContainerResource | null;
          if (!res) reject(new Error('Empty character GLB'));
          else resolve(res);
        });
        asset.once('error', (err) => reject(new Error(String(err || 'Load error'))));
        this.app.assets.add(asset);
        this.app.assets.load(asset);
      });

      this.mountContainer(container, displayName);
      return true;
    } catch (err) {
      console.warn('[PlayableCharacter] Failed to load character.glb:', err);
      return false;
    }
  }

  public async loadFromFile(file: File): Promise<boolean> {
    const blobUrl = URL.createObjectURL(file);
    try {
      return await this.loadFromUrl(blobUrl, file.name);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);
    }
  }

  private mountContainer(resource: pc.ContainerResource, displayName: string): void {
    this.clearActiveModel();

    const { wrapper, entity, rig } = instantiateNormalizedHumanGlb(this.app, resource, 1.78, true);
    if (this.flip180) {
      wrapper.setLocalEulerAngles(0, 180, 0);
    }
    this.modelHolder.addChild(wrapper);

    this.activeModel = wrapper;
    this.isCustomGlb = true;
    this.label = displayName;
    this.rig = rig;

    const animAssets = resource.animations || [];
    if (animAssets.length > 0) {
      try {
        entity.addComponent('anim', { activate: true, speed: 1.0 });
        const anim = entity.anim;
        if (anim) {
          // Strip Armature prefix (e.g. "CharacterArmature|Idle_Neutral" -> "Idle_Neutral") before matching!
          const cleanClipName = (raw: string | undefined) => (raw || '').replace(/^.*\|/, '').trim();
          const findClip = (patterns: RegExp[]): pc.Asset | undefined => {
            for (const re of patterns) {
              const found = animAssets.find((a) => re.test(cleanClipName(a.name)));
              if (found) return found;
            }
            return undefined;
          };

          // Strictly match calm standing Idle (NEVER Death / Idle_Gun_Shoot / Idle_Sword!)
          const idleAsset =
            findClip([/^idle_neutral$/i, /^idle$/i, /^stand$/i, /^breathing_idle$/i]) ||
            findClip([/^walk$/i]) ||
            animAssets[0];
          const runAsset = findClip([/^run$/i, /^sprint$/i, /^jog$/i]);
          const walkAsset = findClip([/^walk$/i, /^walking$/i, /walk(?!_?back)/i]) || runAsset || idleAsset;

          const entries: Array<{ key: CharacterAnimKey; asset: pc.Asset | undefined; loop: boolean }> = [
            { key: 'idle', asset: idleAsset, loop: true },
            { key: 'walk', asset: walkAsset, loop: true },
            { key: 'run', asset: runAsset || walkAsset, loop: true },
            { key: 'runBack', asset: findClip([/^run_?back$/i, /^walk_?back$/i]), loop: true },
            { key: 'runLeft', asset: findClip([/^run_?left$/i, /strafe_?left/i]), loop: true },
            { key: 'runRight', asset: findClip([/^run_?right$/i, /strafe_?right/i]), loop: true },
            { key: 'punchLeft', asset: findClip([/^punch_?left$/i, /left_?punch/i, /^punch$/i]), loop: false },
            { key: 'punchRight', asset: findClip([/^punch_?right$/i, /right_?punch/i, /^punch$/i]), loop: false },
            { key: 'kickLeft', asset: findClip([/^kick_?left$/i, /left_?kick/i, /^kick$/i]), loop: false },
            { key: 'kickRight', asset: findClip([/^kick_?right$/i, /right_?kick/i, /^kick$/i]), loop: false },
            { key: 'roll', asset: findClip([/^roll$/i, /dodge_?roll/i]), loop: false },
            { key: 'gunIdle', asset: findClip([/^idle_?gun_?pointing$/i, /^idle_?gun$/i]), loop: true },
            { key: 'gunShoot', asset: findClip([/^gun_?shoot$/i, /^idle_?gun_?shoot$/i, /^shoot$/i]), loop: false },
            { key: 'interact', asset: findClip([/^interact$/i, /^pickup$/i, /^wave$/i]), loop: false },
            { key: 'hit', asset: findClip([/^hit_?rec[ei]{2}ve$/i, /^hit_?rec[ei]{2}ve_2$/i, /^hit_?reaction$/i]), loop: false },
            { key: 'death', asset: findClip([/^death$/i, /^die2?$/i]), loop: false },
          ];

          const validEntries = entries.filter((e) => Boolean(e.asset?.resource));

          // Build explicit AnimStateGraph starting in 'idle' with ZERO auto-transitions!
          const states: Array<{ name: string; speed: number; loop?: boolean }> = [
            { name: 'START', speed: 1 },
            { name: 'ANY', speed: 1 },
            { name: 'END', speed: 1 },
          ];
          for (const e of validEntries) {
            states.push({ name: e.key, speed: 1, loop: e.loop });
          }

          const stateGraph = new pc.AnimStateGraph({
            layers: [
              {
                name: 'Base',
                states,
                transitions: [
                  {
                    from: 'START',
                    to: 'idle',
                    defaultTransition: true,
                  },
                ],
              },
            ],
            parameters: {},
          });

          anim.loadStateGraph(stateGraph);
          for (const e of validEntries) {
            anim.assignAnimation(e.key, e.asset!.resource as pc.AnimTrack, 'Base', 1.0, e.loop);
            this.animNames[e.key] = e.key;
          }

          this.animComp = anim;
          this.usesEmbeddedAnim = Boolean(this.animNames.idle);
          if (this.usesEmbeddedAnim && anim.baseLayer) {
            this.currentClip = 'idle';
            anim.baseLayer.play('idle');
            anim.baseLayer.activeStateCurrentTime = 0;
            // Freeze on natural standing pose when completely idle so character NEVER animates on its own!
            anim.speed = 0;
          }
        }
      } catch (err) {
        console.warn('[PlayableCharacter] Embedded anim bind warning:', err);
        this.usesEmbeddedAnim = false;
      }
    }
  }

  public toggleFlip180(): void {
    this.flip180 = !this.flip180;
    if (this.activeModel) {
      this.activeModel.setLocalEulerAngles(0, this.flip180 ? 180 : 0, 0);
    }
  }

  public setVisible(visible: boolean): void {
    this.root.enabled = visible;
  }

  public setPosition(x: number, y: number, z: number, yawDeg?: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    if (yawDeg !== undefined) this.yaw = yawDeg;
    this.root.setLocalPosition(this.x, this.y, this.z);
    this.root.setLocalEulerAngles(0, this.yaw, 0);
  }

  public setLookPitch(pitchDeg: number): void {
    this.lookPitchDeg = Math.max(-28, Math.min(54, pitchDeg));
  }

  public isRolling(): boolean {
    return this.rollTimer > 0;
  }

  public getRollDirection(): { x: number; z: number } {
    return { x: this.rollDirX, z: this.rollDirZ };
  }

  public triggerPunch(): void {
    this.punchHandRight = !this.punchHandRight;
    this.punchTimer = this.punchDuration;
    this.kickTimer = 0;
    if (this.usesEmbeddedAnim) {
      const clip: CharacterAnimKey = this.punchHandRight ? 'punchRight' : 'punchLeft';
      if (this.animNames[clip]) this.switchClip(clip, 1.2, true);
    }
  }

  public triggerKick(): void {
    this.kickFootRight = !this.kickFootRight;
    this.kickTimer = this.kickDuration;
    this.punchTimer = 0;
    if (this.usesEmbeddedAnim) {
      const clip: CharacterAnimKey = this.kickFootRight ? 'kickRight' : 'kickLeft';
      if (this.animNames[clip]) this.switchClip(clip, 1.15, true);
    }
  }

  public triggerRoll(dirX?: number, dirZ?: number): void {
    if (this.rollTimer > 0) return;
    const yawRad = (this.yaw * Math.PI) / 180;
    const fx = dirX !== undefined && Math.hypot(dirX, dirZ ?? 0) > 0.1 ? dirX : -Math.sin(yawRad);
    const fz = dirZ !== undefined && Math.hypot(dirX ?? 0, dirZ) > 0.1 ? dirZ : -Math.cos(yawRad);
    const len = Math.hypot(fx, fz) || 1;
    this.rollDirX = fx / len;
    this.rollDirZ = fz / len;
    this.yaw = (Math.atan2(-this.rollDirX, -this.rollDirZ) * 180) / Math.PI;
    this.rollTimer = this.rollDuration;
    this.punchTimer = 0;
    this.kickTimer = 0;
    if (this.usesEmbeddedAnim && this.animNames.roll) {
      this.switchClip('roll', 1.25, true);
    }
  }

  public triggerShoot(): void {
    this.shootTimer = this.shootDuration;
    if (this.usesEmbeddedAnim && this.animNames.gunShoot) {
      this.switchClip('gunShoot', 1.3, true);
    }
  }

  public triggerInteract(): void {
    this.interactTimer = this.interactDuration;
    if (this.usesEmbeddedAnim && this.animNames.interact) {
      this.switchClip('interact', 1.1, true);
    }
  }

  private switchClip(clip: CharacterAnimKey, speed: number, forceRestart: boolean): void {
    if (!this.animComp || !this.animComp.baseLayer) return;
    const stateName = this.animNames[clip] || this.animNames.idle;
    if (!stateName) return;

    if (this.currentClip !== stateName || forceRestart) {
      this.currentClip = stateName;
      try {
        if (forceRestart) {
          this.animComp.baseLayer.transition(stateName, 0.05);
          this.animComp.baseLayer.activeStateCurrentTime = 0;
        } else {
          this.animComp.baseLayer.transition(stateName, 0.14);
        }
      } catch {
        // Ignore
      }
    }
    this.animComp.speed = speed;
  }

  public updateAnimation(
    dt: number,
    moveSpeed: number,
    running: boolean,
    localFwd = 0,
    localRight = 0
  ): void {
    this.speed = moveSpeed;
    this.isRunning = running;

    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt);
    if (this.kickTimer > 0) this.kickTimer = Math.max(0, this.kickTimer - dt);
    if (this.rollTimer > 0) this.rollTimer = Math.max(0, this.rollTimer - dt);
    if (this.shootTimer > 0) this.shootTimer = Math.max(0, this.shootTimer - dt);
    if (this.interactTimer > 0) this.interactTimer = Math.max(0, this.interactTimer - dt);

    const moving = moveSpeed > 0.18;
    const speedFactor = Math.min(1.35, moveSpeed / (running ? 7.2 : 3.8));

    // =========================================================================
    // PATH A: Embedded Skeletal Animations (`character.glb`)
    // Completely STILL in standing pose when no button/movement is pressed!
    // =========================================================================
    if (this.usesEmbeddedAnim && this.animComp) {
      this.modelHolder.setLocalPosition(0, 0, 0);
      this.modelHolder.setLocalEulerAngles(0, 0, 0);

      if (this.rollTimer > 0) {
        if (this.animNames.roll) {
          this.switchClip('roll', 1.25, false);
        } else {
          const p = 1 - this.rollTimer / this.rollDuration;
          this.modelHolder.setLocalPosition(0, Math.sin(p * Math.PI) * 0.25, 0);
          this.modelHolder.setLocalEulerAngles(-p * 360, 0, 0);
        }
        return;
      }

      if (this.shootTimer > 0 && this.animNames.gunShoot) {
        this.switchClip('gunShoot', 1.3, false);
        return;
      }
      if (this.kickTimer > 0) {
        const kClip: CharacterAnimKey = this.kickFootRight ? 'kickRight' : 'kickLeft';
        if (this.animNames[kClip]) {
          this.switchClip(kClip, 1.15, false);
          return;
        }
      }
      if (this.punchTimer > 0) {
        const pClip: CharacterAnimKey = this.punchHandRight ? 'punchRight' : 'punchLeft';
        if (this.animNames[pClip]) {
          this.switchClip(pClip, 1.2, false);
          return;
        }
      }
      if (this.interactTimer > 0 && this.animNames.interact) {
        this.switchClip('interact', 1.1, false);
        return;
      }

      if (!moving) {
        // Stand completely still in neutral standing pose (ZERO self-playing animations!)
        if (this.currentClip !== 'idle') {
          this.currentClip = 'idle';
          if (this.animComp.baseLayer) {
            try {
              this.animComp.baseLayer.transition('idle', 0);
              this.animComp.baseLayer.play('idle');
            } catch {
              // Ignore
            }
          }
        }
        if (this.animComp.baseLayer) {
          this.animComp.baseLayer.activeStateCurrentTime = 0;
        }
        this.animComp.speed = 0;
        return;
      }

      if (localFwd < -0.55 && this.animNames.runBack && running) {
        this.switchClip('runBack', Math.max(0.85, speedFactor), false);
      } else if (running) {
        this.switchClip('run', Math.max(0.85, speedFactor * 1.15), false);
      } else {
        this.switchClip('walk', Math.max(0.75, speedFactor), false);
      }
      return;
    }

    // =========================================================================
    // PATH B: Procedural Character-Space Rig (`human_rpm.glb` / fallback)
    // Completely STILL when doing nothing; animates ONLY when moving or pressing actions!
    // =========================================================================
    const freq = running ? 11.2 : 7.6;
    if (moving) {
      this.gaitPhase += dt * freq * Math.max(0.55, speedFactor);
    } else {
      this.gaitPhase = 0;
    }

    const s = Math.sin(this.gaitPhase);
    const c = Math.cos(this.gaitPhase);
    const amp = moving ? Math.min(1, moveSpeed / 3.4) * (running ? 1.25 : 0.90) : 0;

    if (!hasAnyLimbBones(this.rig)) {
      const bob = moving ? Math.abs(s) * 0.08 * amp : 0;
      this.modelHolder.setLocalPosition(0, bob, 0);
      return;
    }

    if (this.rollTimer > 0) {
      const p = 1 - this.rollTimer / this.rollDuration;
      const tuck = Math.sin(p * Math.PI);
      this.modelHolder.setLocalPosition(0, 0.52 * tuck, 0);
      this.modelHolder.setLocalEulerAngles(-p * 360, 0, 0);
      applyBoneCharAngles(this.rig.leftUpLeg, 92 * tuck, 0, 0);
      applyBoneCharAngles(this.rig.rightUpLeg, 92 * tuck, 0, 0);
      applyBoneCharAngles(this.rig.leftLeg, -95 * tuck, 0, 0);
      applyBoneCharAngles(this.rig.rightLeg, -95 * tuck, 0, 0);
      applyBoneCharAngles(this.rig.leftArm, 72 * tuck, 0, this.rig.leftArmDropDeg);
      applyBoneCharAngles(this.rig.rightArm, 72 * tuck, 0, -this.rig.rightArmDropDeg);
      applyBoneCharAngles(this.rig.spine, -38 * tuck, 0, 0);
      return;
    }

    this.modelHolder.setLocalPosition(0, 0, 0);
    this.modelHolder.setLocalEulerAngles(0, 0, 0);

    let lUpLegPitch = s * 34 * amp;
    let rUpLegPitch = -s * 34 * amp;
    let lKnee = Math.max(0, -c) * 44 * amp;
    let rKnee = Math.max(0, c) * 44 * amp;

    const armSwing = s * 30 * amp;
    let lArmPitch = -armSwing;
    let rArmPitch = armSwing;
    let lArmYaw = 0;
    let rArmYaw = 0;
    let lElbow = moving ? 12 + Math.max(0, s) * 26 * amp : 6;
    let rElbow = moving ? 12 + Math.max(0, -s) * 26 * amp : 6;

    let torsoYaw = s * 7 * amp;
    let torsoPitch = moving ? (running ? -10 : -4.5) * amp : 0;

    if (this.shootTimer > 0) {
      const recoil = Math.sin((this.shootTimer / this.shootDuration) * Math.PI) * 24;
      rArmPitch = 84 + recoil;
      lArmPitch = 78 + recoil * 0.7;
      rArmYaw = 10;
      lArmYaw = -22;
      rElbow = 10 + recoil * 0.4;
      lElbow = 36;
      torsoYaw = -12;
      torsoPitch += recoil * 0.25;
    }

    if (this.punchTimer > 0) {
      const t = 1 - this.punchTimer / this.punchDuration;
      const thrust = Math.sin(Math.min(1, t * 1.35) * Math.PI);
      if (this.punchHandRight) {
        rArmPitch = 94 * thrust;
        rElbow = 12 + (1 - thrust) * 58;
        lArmPitch = 36 * thrust;
        lElbow = 65 * thrust;
        torsoYaw = 32 * thrust;
      } else {
        lArmPitch = 94 * thrust;
        lElbow = 12 + (1 - thrust) * 58;
        rArmPitch = 36 * thrust;
        rElbow = 65 * thrust;
        torsoYaw = -32 * thrust;
      }
      torsoPitch -= 9 * thrust;
    }

    if (this.kickTimer > 0) {
      const t = 1 - this.kickTimer / this.kickDuration;
      const thrust = Math.sin(Math.min(1, t * 1.25) * Math.PI);
      if (this.kickFootRight) {
        rUpLegPitch = 96 * thrust;
        rKnee = (1 - thrust) * 65;
        lUpLegPitch = -14 * thrust;
        torsoYaw = -22 * thrust;
      } else {
        lUpLegPitch = 96 * thrust;
        lKnee = (1 - thrust) * 65;
        rUpLegPitch = -14 * thrust;
        torsoYaw = 22 * thrust;
      }
      torsoPitch += 18 * thrust;
      lArmPitch = 42 * thrust;
      rArmPitch = 42 * thrust;
    }

    if (this.interactTimer > 0) {
      const it = Math.sin((this.interactTimer / this.interactDuration) * Math.PI);
      rArmPitch = 72 * it;
      rElbow = 32 * it;
      torsoPitch -= 12 * it;
    }

    applyBoneCharAngles(this.rig.leftUpLeg, lUpLegPitch, 0, 0);
    applyBoneCharAngles(this.rig.rightUpLeg, rUpLegPitch, 0, 0);
    applyBoneCharAngles(this.rig.leftLeg, -lKnee, 0, 0);
    applyBoneCharAngles(this.rig.rightLeg, -rKnee, 0, 0);

    applyBoneCharAngles(this.rig.leftArm, lArmPitch, lArmYaw, this.rig.leftArmDropDeg);
    applyBoneCharAngles(this.rig.rightArm, rArmPitch, rArmYaw, -this.rig.rightArmDropDeg);
    applyBoneCharAngles(this.rig.leftForeArm, lElbow, 0, 0);
    applyBoneCharAngles(this.rig.rightForeArm, rElbow, 0, 0);

    applyBoneCharAngles(this.rig.spine, torsoPitch, torsoYaw, 0);
    const headPitch = this.lookPitchDeg - torsoPitch * 0.35;
    applyBoneCharAngles(this.rig.head, headPitch, -torsoYaw * 0.45, 0);

    if (this.rig.hips) {
      const bounce = moving ? Math.abs(s) * 0.038 * amp : 0;
      const bp = this.rig.hips.basePos;
      this.rig.hips.node.setLocalPosition(bp.x, bp.y + bounce, bp.z);
    }
  }
}
