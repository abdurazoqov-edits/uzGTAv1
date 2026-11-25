import * as pc from 'playcanvas';

export interface RiggedBone {
  node: pc.GraphNode;
  baseEuler: pc.Vec3;
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
  jacket: [0.11, 0.16, 0.25], // Dark charcoal-navy leather bomber jacket
  shirt: [0.93, 0.94, 0.96],  // Crisp white crew tee
  pants: [0.14, 0.19, 0.29],  // Slim dark indigo denim
  shoes: [0.94, 0.95, 0.97],  // White athletic sneakers
  hasSunglasses: true,
  isSwimmer: false,
  heightScale: 1.0,
};

function matchBone(name: string, re: RegExp): boolean {
  return re.test(name.replace(/mixamorig[:_]?/i, ''));
}

function discoverHumanoidRig(root: pc.GraphNode): HumanoidRig {
  const rig: HumanoidRig = {};
  const walk = (n: pc.GraphNode) => {
    const nm = n.name || '';
    const capture = (key: keyof HumanoidRig) => {
      if (!rig[key]) {
        rig[key] = { node: n, baseEuler: n.getLocalEulerAngles().clone() };
      }
    };
    if (matchBone(nm, /^(hips|pelvis|root_hips)$/i)) capture('hips');
    else if (matchBone(nm, /^(spine1?|chest|torso)$/i)) capture('spine');
    else if (matchBone(nm, /^head$/i)) capture('head');
    else if (matchBone(nm, /^(left|l)[_.\s-]?(upleg|thigh|hip|upperleg)$/i) || matchBone(nm, /^(upleg|thigh)[_.\s-]?(l|left)$/i)) capture('leftUpLeg');
    else if (matchBone(nm, /^(right|r)[_.\s-]?(upleg|thigh|hip|upperleg)$/i) || matchBone(nm, /^(upleg|thigh)[_.\s-]?(r|right)$/i)) capture('rightUpLeg');
    else if (matchBone(nm, /^(left|l)[_.\s-]?(leg|shin|calf|lowerleg|knee)$/i) || matchBone(nm, /^(leg|shin|calf)[_.\s-]?(l|left)$/i)) capture('leftLeg');
    else if (matchBone(nm, /^(right|r)[_.\s-]?(leg|shin|calf|lowerleg|knee)$/i) || matchBone(nm, /^(leg|shin|calf)[_.\s-]?(r|right)$/i)) capture('rightLeg');
    else if (matchBone(nm, /^(left|l)[_.\s-]?(arm|upperarm|shoulder_arm)$/i) || matchBone(nm, /^(upper_?arm|arm)[_.\s-]?(l|left)$/i)) capture('leftArm');
    else if (matchBone(nm, /^(right|r)[_.\s-]?(arm|upperarm|shoulder_arm)$/i) || matchBone(nm, /^(upper_?arm|arm)[_.\s-]?(r|right)$/i)) capture('rightArm');
    else if (matchBone(nm, /^(left|l)[_.\s-]?(forearm|lowerarm|elbow)$/i) || matchBone(nm, /^(forearm|lower_?arm)[_.\s-]?(l|left)$/i)) capture('leftForeArm');
    else if (matchBone(nm, /^(right|r)[_.\s-]?(forearm|lowerarm|elbow)$/i) || matchBone(nm, /^(forearm|lower_?arm)[_.\s-]?(r|right)$/i)) capture('rightForeArm');

    for (const ch of n.children) {
      walk(ch);
    }
  };
  walk(root);
  return rig;
}

function hasAnyLimbBones(rig: HumanoidRig): boolean {
  return Boolean(rig.leftUpLeg || rig.rightUpLeg || rig.leftArm || rig.rightArm);
}

/**
 * Builds a realistically proportioned, anatomically sculpted articulated human
 * (sculpted face/jaw/nose/ears/eyes/brows/hair/sunglasses, athletic chest & shoulders,
 * jacket + collar + inner shirt + belt + buckle + jeans + sneakers, or swimwear for swimmers).
 * Used for BOTH the default Player Character and all living City Citizens / Drivers / Swimmers!
 */
export function buildRealisticHumanEntity(
  appearance: HumanAppearance = DEFAULT_PLAYER_APPEARANCE,
  castShadows = true
): { entity: pc.Entity; rig: HumanoidRig } {
  const root = new pc.Entity('RealisticHuman');
  const hScale = appearance.heightScale ?? 1.0;
  root.setLocalScale(hScale, hScale, hScale);

  const mkMat = (r: number, g: number, b: number, gloss = 0.34, metal = 0.04) => {
    const m = new pc.StandardMaterial();
    m.diffuse.set(r, g, b);
    m.useMetalness = true;
    m.metalness = metal;
    m.gloss = gloss;
    m.update();
    return m;
  };

  const skinMat = mkMat(appearance.skin[0], appearance.skin[1], appearance.skin[2], 0.36, 0.0);
  const lipMat = mkMat(appearance.skin[0] * 0.84, appearance.skin[1] * 0.64, appearance.skin[2] * 0.62, 0.42, 0.0);
  const hairMat = mkMat(appearance.hair[0], appearance.hair[1], appearance.hair[2], 0.36, 0.06);
  const jacketMat = mkMat(appearance.jacket[0], appearance.jacket[1], appearance.jacket[2], 0.38, 0.08);
  const shirtMat = mkMat(appearance.shirt[0], appearance.shirt[1], appearance.shirt[2], 0.22, 0.0);
  const pantsMat = mkMat(appearance.pants[0], appearance.pants[1], appearance.pants[2], 0.24, 0.04);
  const shoeMat = mkMat(appearance.shoes[0], appearance.shoes[1], appearance.shoes[2], 0.48, 0.08);
  const soleMat = mkMat(0.14, 0.15, 0.17, 0.28, 0.05);
  const beltMat = mkMat(0.12, 0.09, 0.07, 0.48, 0.15);
  const metalMat = mkMat(0.82, 0.84, 0.88, 0.86, 0.88);
  const eyeWhiteMat = mkMat(0.95, 0.96, 0.98, 0.72, 0.0);
  const irisMat = mkMat(0.14, 0.11, 0.09, 0.85, 0.05);
  const glassMat = mkMat(0.05, 0.07, 0.11, 0.96, 0.65);

  const addPart = (
    parent: pc.Entity,
    name: string,
    type: 'capsule' | 'sphere' | 'cylinder' | 'box',
    pos: [number, number, number],
    scale: [number, number, number],
    mat: pc.Material,
    rot?: [number, number, number]
  ) => {
    const e = new pc.Entity(name);
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
    e.addComponent('render', { type, material: mat, castShadows, receiveShadows: true });
    parent.addChild(e);
    return e;
  };

  const isSwim = Boolean(appearance.isSwimmer);
  const torsoMat = isSwim ? skinMat : jacketMat;
  const upperArmMat = isSwim ? skinMat : jacketMat;
  const foreArmMat = isSwim ? skinMat : jacketMat;
  const thighMat = isSwim ? pantsMat : pantsMat; // Swim trunks on thighs!
  const calfMat = isSwim ? skinMat : pantsMat;
  const footMat = isSwim ? skinMat : shoeMat;

  // Pelvis / Hips
  const hips = new pc.Entity('Hips');
  hips.setLocalPosition(0, 0.94, 0);
  root.addChild(hips);

  addPart(hips, 'Pelvis', 'capsule', [0, 0.01, 0], [0.31, 0.19, 0.21], pantsMat);
  if (!isSwim) {
    // Leather belt + silver buckle
    addPart(hips, 'Belt', 'cylinder', [0, 0.075, 0], [0.315, 0.042, 0.22], beltMat);
    addPart(hips, 'BeltBuckle', 'box', [0, 0.075, -0.108], [0.058, 0.045, 0.018], metalMat);
  }

  // Spine / Athletic Sculpted Torso (V-taper chest + waist + shoulders + collar)
  const spine = new pc.Entity('Spine');
  spine.setLocalPosition(0, 0.11, 0);
  hips.addChild(spine);

  // Waist & sculpted chest
  addPart(spine, 'Waist', 'cylinder', [0, 0.12, 0], [0.29, 0.22, 0.20], torsoMat);
  addPart(spine, 'ChestUpper', 'capsule', [0, 0.28, 0], [0.39, 0.34, 0.23], torsoMat);
  // Left & right pectoral contour & shoulder deltoids
  addPart(spine, 'ShoulderL', 'sphere', [-0.21, 0.38, 0], [0.145, 0.14, 0.145], torsoMat);
  addPart(spine, 'ShoulderR', 'sphere', [0.21, 0.38, 0], [0.145, 0.14, 0.145], torsoMat);

  if (!isSwim) {
    // Open jacket front showing inner tee & collar lapels
    addPart(spine, 'InnerTee', 'capsule', [0, 0.25, -0.052], [0.175, 0.34, 0.155], shirtMat);
    addPart(spine, 'Collar', 'cylinder', [0, 0.43, 0.01], [0.17, 0.065, 0.16], jacketMat);
  } else {
    // Subtle abdominal contour on swimmer
    addPart(spine, 'PecL', 'sphere', [-0.08, 0.31, -0.085], [0.12, 0.095, 0.07], skinMat);
    addPart(spine, 'PecR', 'sphere', [0.08, 0.31, -0.085], [0.12, 0.095, 0.07], skinMat);
  }

  // Neck + Anatomically Sculpted Head (Faces -Z forward!)
  const head = new pc.Entity('Head');
  head.setLocalPosition(0, 0.46, 0);
  spine.addChild(head);

  addPart(head, 'Neck', 'cylinder', [0, 0.055, 0.005], [0.105, 0.11, 0.105], skinMat);
  // Cranium + tapered lower jaw/chin
  addPart(head, 'Cranium', 'sphere', [0, 0.195, 0.005], [0.195, 0.215, 0.205], skinMat);
  addPart(head, 'Jaw', 'sphere', [0, 0.135, -0.02], [0.148, 0.125, 0.155], skinMat);
  // Nose bridge & tip
  addPart(head, 'Nose', 'capsule', [0, 0.172, -0.102], [0.028, 0.052, 0.036], skinMat, [18, 0, 0]);
  // Ears
  addPart(head, 'EarL', 'sphere', [-0.098, 0.175, 0.005], [0.028, 0.052, 0.036], skinMat);
  addPart(head, 'EarR', 'sphere', [0.098, 0.175, 0.005], [0.028, 0.052, 0.036], skinMat);
  // Mouth / lips
  addPart(head, 'Lips', 'capsule', [0, 0.132, -0.093], [0.052, 0.018, 0.022], lipMat, [0, 0, 90]);
  // Eyes + Eyebrows
  addPart(head, 'EyeWhiteL', 'sphere', [-0.038, 0.194, -0.088], [0.030, 0.021, 0.018], eyeWhiteMat);
  addPart(head, 'EyeWhiteR', 'sphere', [0.038, 0.194, -0.088], [0.030, 0.021, 0.018], eyeWhiteMat);
  addPart(head, 'IrisL', 'sphere', [-0.038, 0.194, -0.096], [0.015, 0.015, 0.012], irisMat);
  addPart(head, 'IrisR', 'sphere', [0.038, 0.194, -0.096], [0.015, 0.015, 0.012], irisMat);
  addPart(head, 'BrowL', 'box', [-0.040, 0.214, -0.091], [0.038, 0.011, 0.012], hairMat, [0, 0, 6]);
  addPart(head, 'BrowR', 'box', [0.040, 0.214, -0.091], [0.038, 0.011, 0.012], hairMat, [0, 0, -6]);

  // Layered Modern Hair Cut
  addPart(head, 'HairTop', 'sphere', [0, 0.235, 0.014], [0.205, 0.145, 0.215], hairMat);
  addPart(head, 'HairBack', 'sphere', [0, 0.185, 0.045], [0.185, 0.145, 0.155], hairMat);
  addPart(head, 'HairFrontSweep', 'capsule', [0.015, 0.242, -0.062], [0.125, 0.058, 0.075], hairMat, [12, 0, -8]);

  // Optional Aviator Sunglasses
  if (appearance.hasSunglasses && !isSwim) {
    addPart(head, 'ShadesL', 'box', [-0.040, 0.193, -0.104], [0.056, 0.034, 0.012], glassMat);
    addPart(head, 'ShadesR', 'box', [0.040, 0.193, -0.104], [0.056, 0.034, 0.012], glassMat);
    addPart(head, 'ShadesBridge', 'box', [0, 0.198, -0.104], [0.030, 0.008, 0.010], metalMat);
  }

  // Arms (Pivot at shoulder, elbow child, wrist + hand + thumb)
  const mkArm = (side: -1 | 1, prefix: string) => {
    const arm = new pc.Entity(`${prefix}Arm`);
    arm.setLocalPosition(side * 0.235, 0.375, 0);
    spine.addChild(arm);
    addPart(arm, `${prefix}Bicep`, 'capsule', [0, -0.135, 0], [0.105, 0.29, 0.105], upperArmMat);

    const fore = new pc.Entity(`${prefix}ForeArm`);
    fore.setLocalPosition(0, -0.275, 0);
    arm.addChild(fore);
    addPart(fore, `${prefix}LowerArm`, 'capsule', [0, -0.125, 0], [0.088, 0.26, 0.088], foreArmMat);
    // Exposed wrist & sculpted hand/fist
    addPart(fore, `${prefix}Wrist`, 'cylinder', [0, -0.245, 0], [0.058, 0.05, 0.058], skinMat);
    addPart(fore, `${prefix}Hand`, 'capsule', [0, -0.295, -0.01], [0.072, 0.105, 0.055], skinMat);
    return { arm, fore };
  };
  const lArm = mkArm(-1, 'Left');
  const rArm = mkArm(1, 'Right');

  // Legs (Pivot at hip, knee child, sneaker with rubber sole)
  const mkLeg = (side: -1 | 1, prefix: string) => {
    const up = new pc.Entity(`${prefix}UpLeg`);
    up.setLocalPosition(side * 0.105, -0.025, 0);
    hips.addChild(up);
    addPart(up, `${prefix}Thigh`, 'capsule', [0, -0.215, 0], [0.145, 0.44, 0.148], thighMat);

    const low = new pc.Entity(`${prefix}Leg`);
    low.setLocalPosition(0, -0.435, 0);
    up.addChild(low);
    addPart(low, `${prefix}Calf`, 'capsule', [0, -0.215, 0], [0.112, 0.43, 0.118], calfMat);
    if (!isSwim) {
      addPart(low, `${prefix}SneakerUpper`, 'capsule', [0, -0.425, -0.045], [0.108, 0.105, 0.235], footMat);
      addPart(low, `${prefix}SneakerSole`, 'box', [0, -0.468, -0.045], [0.112, 0.028, 0.245], soleMat);
    } else {
      addPart(low, `${prefix}Foot`, 'capsule', [0, -0.44, -0.04], [0.09, 0.06, 0.20], skinMat);
    }
    return { up, low };
  };
  const lLeg = mkLeg(-1, 'Left');
  const rLeg = mkLeg(1, 'Right');

  const rig: HumanoidRig = {
    hips: { node: hips, baseEuler: hips.getLocalEulerAngles().clone() },
    spine: { node: spine, baseEuler: spine.getLocalEulerAngles().clone() },
    head: { node: head, baseEuler: head.getLocalEulerAngles().clone() },
    leftUpLeg: { node: lLeg.up, baseEuler: lLeg.up.getLocalEulerAngles().clone() },
    rightUpLeg: { node: rLeg.up, baseEuler: rLeg.up.getLocalEulerAngles().clone() },
    leftLeg: { node: lLeg.low, baseEuler: lLeg.low.getLocalEulerAngles().clone() },
    rightLeg: { node: rLeg.low, baseEuler: rLeg.low.getLocalEulerAngles().clone() },
    leftArm: { node: lArm.arm, baseEuler: lArm.arm.getLocalEulerAngles().clone() },
    rightArm: { node: rArm.arm, baseEuler: rArm.arm.getLocalEulerAngles().clone() },
    leftForeArm: { node: lArm.fore, baseEuler: lArm.fore.getLocalEulerAngles().clone() },
    rightForeArm: { node: rArm.fore, baseEuler: rArm.fore.getLocalEulerAngles().clone() },
  };

  return { entity: root, rig };
}

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
  private rig: HumanoidRig = {};
  private usesEmbeddedAnim = false;
  private animComp: pc.AnimComponent | null = null;
  private animNames: { idle?: string; walk?: string; run?: string } = {};
  private currentClip = '';
  private gaitPhase = 0;
  private hipsBaseY = 0;

  // Sky look-up pitch & GTA melee combat animation timers
  private lookPitchDeg = 0;
  private punchTimer = 0;
  private punchDuration = 0.34;
  private punchHandRight = true;
  private hurtRecoilTimer = 0;

  constructor(app: pc.Application) {
    this.app = app;
    this.root = new pc.Entity('PlayableCharacterRoot');
    this.modelHolder = new pc.Entity('CharacterModelHolder');
    this.root.addChild(this.modelHolder);
    this.app.root.addChild(this.root);

    this.installFallback();
    this.setPosition(this.x, this.y, this.z, this.yaw);
  }

  private clearActiveModel(): void {
    if (this.activeModel) {
      this.activeModel.destroy();
      this.activeModel = null;
    }
    this.rig = {};
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
    this.hipsBaseY = rig.hips ? rig.hips.node.getLocalPosition().y : 0.94;
    this.isCustomGlb = false;
    this.label = 'Player';
    this.modelHolder.addChild(entity);
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

    const wrapper = new pc.Entity('CustomCharacterWrapper');
    const entity = resource.instantiateRenderEntity({
      castShadows: true,
      receiveShadows: true,
    });
    wrapper.addChild(entity);
    this.modelHolder.addChild(wrapper);

    // Measure height & scale cleanly to 1.76m, grounded flush at y = 0
    wrapper.getWorldTransform();
    const renderComps = entity.findComponents('render') as pc.RenderComponent[];
    let bounds: pc.BoundingBox | null = null;
    for (const rc of renderComps) {
      rc.castShadows = true;
      rc.receiveShadows = true;
      for (const mi of rc.meshInstances) {
        if (!bounds) bounds = mi.aabb.clone();
        else bounds.add(mi.aabb);
      }
    }

    if (bounds) {
      const h = Math.max(0.05, bounds.halfExtents.y * 2);
      const scale = 1.76 / h;
      entity.setLocalScale(scale, scale, scale);
      wrapper.getWorldTransform();

      let scaledBounds: pc.BoundingBox | null = null;
      for (const rc of renderComps) {
        for (const mi of rc.meshInstances) {
          if (!scaledBounds) scaledBounds = mi.aabb.clone();
          else scaledBounds.add(mi.aabb);
        }
      }
      if (scaledBounds) {
        const minY = scaledBounds.center.y - scaledBounds.halfExtents.y;
        const rootPos = this.modelHolder.getPosition();
        entity.setLocalPosition(
          rootPos.x - scaledBounds.center.x,
          rootPos.y - minY,
          rootPos.z - scaledBounds.center.z
        );
      }
    }

    wrapper.setLocalEulerAngles(0, this.flip180 ? 0 : 180, 0);

    this.activeModel = wrapper;
    this.isCustomGlb = true;
    this.label = displayName;

    const animAssets = resource.animations || [];
    if (animAssets.length > 0) {
      try {
        entity.addComponent('anim', { activate: true, speed: 1.0 });
        const anim = entity.anim;
        if (anim) {
          let idleTrack: pc.Asset | null = null;
          let walkTrack: pc.Asset | null = null;
          let runTrack: pc.Asset | null = null;

          for (const a of animAssets) {
            const nm = (a.name || '').toLowerCase();
            if (!idleTrack && /idle|stand|breath|wait/.test(nm)) idleTrack = a;
            else if (!walkTrack && /walk|stride|loco/.test(nm)) walkTrack = a;
            else if (!runTrack && /run|sprint|jog/.test(nm)) runTrack = a;
          }
          if (!walkTrack) walkTrack = animAssets[0];
          if (!idleTrack) idleTrack = animAssets[0];
          if (!runTrack) runTrack = walkTrack;

          if (idleTrack?.resource) {
            anim.assignAnimation('idle', idleTrack.resource as pc.AnimTrack);
            this.animNames.idle = 'idle';
          }
          if (walkTrack?.resource) {
            anim.assignAnimation('walk', walkTrack.resource as pc.AnimTrack);
            this.animNames.walk = 'walk';
          }
          if (runTrack?.resource) {
            anim.assignAnimation('run', runTrack.resource as pc.AnimTrack);
            this.animNames.run = 'run';
          }

          this.animComp = anim;
          this.usesEmbeddedAnim = Boolean(this.animNames.walk);
          if (this.usesEmbeddedAnim) {
            this.switchClip('idle', 1.0);
          }
        }
      } catch (err) {
        console.warn('[PlayableCharacter] Embedded anim bind warning:', err);
        this.usesEmbeddedAnim = false;
      }
    }

    this.rig = discoverHumanoidRig(entity);
    if (this.rig.hips) {
      this.hipsBaseY = this.rig.hips.node.getLocalPosition().y;
    }
  }

  public toggleFlip180(): void {
    this.flip180 = !this.flip180;
    if (this.activeModel && this.isCustomGlb) {
      this.activeModel.setLocalEulerAngles(0, this.flip180 ? 0 : 180, 0);
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

  /** Tilts character's head upward when player looks up into the sky / Tashkent TV Tower */
  public setLookPitch(pitchDeg: number): void {
    this.lookPitchDeg = Math.max(-28, Math.min(54, pitchDeg));
  }

  public triggerPunch(): void {
    this.punchHandRight = !this.punchHandRight;
    this.punchTimer = this.punchDuration;
  }

  public triggerHitRecoil(): void {
    this.hurtRecoilTimer = 0.28;
  }

  private switchClip(clip: 'idle' | 'walk' | 'run', speed: number): void {
    if (!this.animComp) return;
    const stateName = this.animNames[clip] || this.animNames.walk || this.animNames.idle;
    if (!stateName) return;
    this.animComp.speed = speed;
    if (this.currentClip !== stateName) {
      this.currentClip = stateName;
      try {
        this.animComp.baseLayer?.transition(stateName, 0.18);
      } catch {
        // Ignore single-state transition errors
      }
    }
  }

  public updateAnimation(dt: number, moveSpeed: number, running: boolean): void {
    this.speed = moveSpeed;
    this.isRunning = running;
    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt);
    if (this.hurtRecoilTimer > 0) this.hurtRecoilTimer = Math.max(0, this.hurtRecoilTimer - dt);

    const moving = moveSpeed > 0.18;
    const speedFactor = Math.min(1.35, moveSpeed / (running ? 7.2 : 3.8));

    if (this.usesEmbeddedAnim && this.animComp) {
      if (!moving) {
        this.switchClip('idle', 1.0);
      } else if (running) {
        this.switchClip('run', Math.max(0.85, speedFactor * 1.15));
      } else {
        this.switchClip('walk', Math.max(0.7, speedFactor));
      }
      // Subtle visual punch lunge even on embedded anim GLB
      if (this.punchTimer > 0) {
        const p = Math.sin((this.punchTimer / this.punchDuration) * Math.PI);
        this.modelHolder.setLocalEulerAngles(-p * 12, (this.punchHandRight ? -1 : 1) * p * 22, 0);
      } else if (this.hurtRecoilTimer > 0) {
        const h = Math.sin((this.hurtRecoilTimer / 0.28) * Math.PI);
        this.modelHolder.setLocalEulerAngles(h * 16, 0, 0);
      } else {
        this.modelHolder.setLocalEulerAngles(0, 0, 0);
      }
      return;
    }

    const freq = running ? 11.5 : 7.8;
    if (moving) {
      this.gaitPhase += dt * freq * Math.max(0.55, speedFactor);
    } else {
      this.gaitPhase += dt * 1.9;
    }

    const s = Math.sin(this.gaitPhase);
    const c = Math.cos(this.gaitPhase);
    const amp = moving ? Math.min(1, moveSpeed / 3.4) * (running ? 1.28 : 0.92) : 0;

    if (!hasAnyLimbBones(this.rig)) {
      const bob = moving ? Math.abs(s) * 0.09 * amp : Math.sin(this.gaitPhase) * 0.015;
      const sway = moving ? s * 3.8 * amp : 0;
      const lean = moving ? (running ? -8 : -4) * amp : 0;
      this.modelHolder.setLocalPosition(0, bob, 0);
      this.modelHolder.setLocalEulerAngles(lean, 0, sway);
      return;
    }

    this.modelHolder.setLocalPosition(0, 0, 0);
    this.modelHolder.setLocalEulerAngles(0, 0, 0);

    const setAdd = (b: RiggedBone | undefined, dx: number, dy: number, dz: number) => {
      if (!b) return;
      b.node.setLocalEulerAngles(b.baseEuler.x + dx, b.baseEuler.y + dy, b.baseEuler.z + dz);
    };

    const legSwing = s * 36 * amp;
    const armSwing = s * 32 * amp;
    const lKnee = Math.max(0, -c) * 44 * amp;
    const rKnee = Math.max(0, c) * 44 * amp;
    let lArmX = -armSwing;
    let rArmX = armSwing;
    let lElbow = moving ? 14 + Math.max(0, s) * 26 * amp : 8;
    let rElbow = moving ? 14 + Math.max(0, -s) * 26 * amp : 8;

    let torsoTwist = s * 7 * amp;
    let forwardLean = moving ? (running ? -10 : -4.5) * amp : Math.sin(this.gaitPhase) * 1.1;

    // Punch animation override (snappy forward cross punch!)
    if (this.punchTimer > 0) {
      const t = 1 - this.punchTimer / this.punchDuration;
      const thrust = Math.sin(Math.min(1, t * 1.35) * Math.PI);
      if (this.punchHandRight) {
        rArmX = 94 * thrust;
        rElbow = 12 + (1 - thrust) * 58;
        lArmX = 36 * thrust;
        lElbow = 65 * thrust;
        torsoTwist = 34 * thrust;
      } else {
        lArmX = 94 * thrust;
        lElbow = 12 + (1 - thrust) * 58;
        rArmX = 36 * thrust;
        rElbow = 65 * thrust;
        torsoTwist = -34 * thrust;
      }
      forwardLean -= 9 * thrust;
    }

    // Recoil when punched back by an angry citizen
    if (this.hurtRecoilTimer > 0) {
      const h = Math.sin((this.hurtRecoilTimer / 0.28) * Math.PI);
      forwardLean += 20 * h;
      lArmX += 24 * h;
      rArmX += 24 * h;
    }

    const tPoseDrop = this.isCustomGlb ? 52 : 0;

    setAdd(this.rig.leftUpLeg, legSwing, 0, 0);
    setAdd(this.rig.rightUpLeg, -legSwing, 0, 0);
    setAdd(this.rig.leftLeg, -lKnee, 0, 0);
    setAdd(this.rig.rightLeg, -rKnee, 0, 0);

    setAdd(this.rig.leftArm, lArmX, 0, tPoseDrop);
    setAdd(this.rig.rightArm, rArmX, 0, -tPoseDrop);
    setAdd(this.rig.leftForeArm, lElbow, 0, 0);
    setAdd(this.rig.rightForeArm, rElbow, 0, 0);

    setAdd(this.rig.spine, forwardLean, torsoTwist, 0);
    // Character physically looks UP when camera looks up at the sky / Tashkent TV Tower!
    const headPitch = this.lookPitchDeg - forwardLean * 0.35;
    setAdd(this.rig.head, headPitch, -torsoTwist * 0.45, 0);

    if (this.rig.hips) {
      const hp = this.rig.hips.node.getLocalPosition();
      const bounce = moving ? Math.abs(s) * 0.045 * amp : Math.sin(this.gaitPhase) * 0.008;
      this.rig.hips.node.setLocalPosition(hp.x, this.hipsBaseY + bounce, hp.z);
    }
  }
}
