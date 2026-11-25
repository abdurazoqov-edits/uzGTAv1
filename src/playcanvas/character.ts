import * as pc from 'playcanvas';

interface RiggedBone {
  node: pc.GraphNode;
  baseEuler: pc.Vec3;
}

interface HumanoidRig {
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
 * Builds an articulated athletic humanoid stand-in (smooth capsules/spheres, zero boxy blocks)
 * used until models/character.glb is uploaded.
 */
function buildFallbackHumanoid(): { entity: pc.Entity; rig: HumanoidRig } {
  const root = new pc.Entity('FallbackHumanoid');

  const mkMat = (r: number, g: number, b: number, gloss = 0.35, metal = 0.05) => {
    const m = new pc.StandardMaterial();
    m.diffuse.set(r, g, b);
    m.useMetalness = true;
    m.metalness = metal;
    m.gloss = gloss;
    m.update();
    return m;
  };

  const jacketMat = mkMat(0.14, 0.22, 0.34, 0.32, 0.08);
  const shirtMat = mkMat(0.92, 0.94, 0.96, 0.22, 0.0);
  const jeansMat = mkMat(0.13, 0.17, 0.25, 0.25, 0.04);
  const skinMat = mkMat(0.86, 0.69, 0.56, 0.34, 0.0);
  const hairMat = mkMat(0.11, 0.09, 0.08, 0.38, 0.05);
  const shoeMat = mkMat(0.94, 0.95, 0.97, 0.45, 0.1);

  const addMesh = (
    parent: pc.Entity,
    name: string,
    type: 'capsule' | 'sphere' | 'cylinder',
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

  const hips = new pc.Entity('Hips');
  hips.setLocalPosition(0, 0.94, 0);
  root.addChild(hips);

  // Pelvis
  addMesh(hips, 'Pelvis', 'capsule', [0, 0.0, 0], [0.32, 0.2, 0.22], jeansMat);

  // Spine / Jacket Torso
  const spine = new pc.Entity('Spine');
  spine.setLocalPosition(0, 0.12, 0);
  hips.addChild(spine);
  addMesh(spine, 'Torso', 'capsule', [0, 0.22, 0], [0.38, 0.46, 0.23], jacketMat);
  addMesh(spine, 'InnerShirt', 'capsule', [0, 0.24, -0.05], [0.22, 0.36, 0.16], shirtMat);

  // Neck + Head + Hair
  const head = new pc.Entity('Head');
  head.setLocalPosition(0, 0.49, 0);
  spine.addChild(head);
  addMesh(head, 'Neck', 'cylinder', [0, 0.04, 0], [0.11, 0.1, 0.11], skinMat);
  addMesh(head, 'HeadBall', 'sphere', [0, 0.17, 0], [0.21, 0.24, 0.22], skinMat);
  addMesh(head, 'HairCap', 'sphere', [0, 0.21, 0.02], [0.22, 0.18, 0.22], hairMat);

  // Arms (Pivot at shoulder, elbow child)
  const mkArm = (side: -1 | 1, prefix: string) => {
    const arm = new pc.Entity(`${prefix}Arm`);
    arm.setLocalPosition(side * 0.24, 0.41, 0);
    spine.addChild(arm);
    addMesh(arm, `${prefix}UpperArm`, 'capsule', [0, -0.14, 0], [0.11, 0.3, 0.11], jacketMat);

    const fore = new pc.Entity(`${prefix}ForeArm`);
    fore.setLocalPosition(0, -0.28, 0);
    arm.addChild(fore);
    addMesh(fore, `${prefix}LowerArm`, 'capsule', [0, -0.13, 0], [0.095, 0.27, 0.095], jacketMat);
    addMesh(fore, `${prefix}Hand`, 'sphere', [0, -0.28, 0], [0.085, 0.1, 0.085], skinMat);
    return { arm, fore };
  };
  const lArm = mkArm(-1, 'Left');
  const rArm = mkArm(1, 'Right');

  // Legs (Pivot at hip, knee child, sneaker at foot)
  const mkLeg = (side: -1 | 1, prefix: string) => {
    const up = new pc.Entity(`${prefix}UpLeg`);
    up.setLocalPosition(side * 0.11, -0.02, 0);
    hips.addChild(up);
    addMesh(up, `${prefix}Thigh`, 'capsule', [0, -0.22, 0], [0.145, 0.45, 0.15], jeansMat);

    const low = new pc.Entity(`${prefix}Leg`);
    low.setLocalPosition(0, -0.44, 0);
    up.addChild(low);
    addMesh(low, `${prefix}Calf`, 'capsule', [0, -0.22, 0], [0.12, 0.44, 0.125], jeansMat);
    addMesh(low, `${prefix}Sneaker`, 'capsule', [0, -0.44, -0.045], [0.115, 0.12, 0.24], shoeMat);
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
  public label = 'Default Character';
  public flip180 = false;

  private activeModel: pc.Entity | null = null;
  private rig: HumanoidRig = {};
  private usesEmbeddedAnim = false;
  private animComp: pc.AnimComponent | null = null;
  private animNames: { idle?: string; walk?: string; run?: string } = {};
  private currentClip = '';
  private gaitPhase = 0;
  private hipsBaseY = 0;

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
    const { entity, rig } = buildFallbackHumanoid();
    this.activeModel = entity;
    this.rig = rig;
    this.hipsBaseY = rig.hips ? rig.hips.node.getLocalPosition().y : 0.94;
    this.isCustomGlb = false;
    this.label = 'Player (Upload character.glb)';
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

    // Measure height & scale cleanly to 1.75m, grounded flush at y = 0
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
      const scale = 1.75 / h;
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

    // Most Mixamo/RPM glTF characters face +Z; rotate 180° so character faces forward (-Z)
    wrapper.setLocalEulerAngles(0, this.flip180 ? 0 : 180, 0);

    this.activeModel = wrapper;
    this.isCustomGlb = true;
    this.label = displayName;

    // 1. Check for embedded glTF skeletal animations (Idle / Walk / Run)
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

    // 2. Always discover humanoid skeleton bones so even static T-pose/A-pose GLBs animate arms & legs realistically!
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

  /**
   * Drives either embedded glTF animations or realistic procedural limb swings (arms, forearms, thighs, knees, hips).
   */
  public updateAnimation(dt: number, moveSpeed: number, running: boolean): void {
    this.speed = moveSpeed;
    this.isRunning = running;

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
      return;
    }

    // Procedural skeletal gait animation (works on BOTH fallback humanoid AND rigged T-pose/A-pose character.glb!)
    const freq = running ? 11.5 : 7.8;
    if (moving) {
      this.gaitPhase += dt * freq * Math.max(0.55, speedFactor);
    } else {
      // Smooth idle breathing cycle
      this.gaitPhase += dt * 1.9;
    }

    const s = Math.sin(this.gaitPhase);
    const c = Math.cos(this.gaitPhase);
    const amp = moving ? Math.min(1, moveSpeed / 3.4) * (running ? 1.28 : 0.92) : 0;

    if (!hasAnyLimbBones(this.rig)) {
      // Unrigged static statue GLB fallback: subtle rhythmic stride bob & lean so walking feels responsive
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
    const lElbow = (moving ? 14 + Math.max(0, s) * 26 * amp : 6);
    const rElbow = (moving ? 14 + Math.max(0, -s) * 26 * amp : 6);

    // If it's a T-pose custom GLB, gently lower arms along sides by Z offset when arms start horizontal
    const tPoseDrop = this.isCustomGlb ? 52 : 0;

    setAdd(this.rig.leftUpLeg, legSwing, 0, 0);
    setAdd(this.rig.rightUpLeg, -legSwing, 0, 0);
    setAdd(this.rig.leftLeg, -lKnee, 0, 0);
    setAdd(this.rig.rightLeg, -rKnee, 0, 0);

    setAdd(this.rig.leftArm, -armSwing, 0, tPoseDrop);
    setAdd(this.rig.rightArm, armSwing, 0, -tPoseDrop);
    setAdd(this.rig.leftForeArm, lElbow, 0, 0);
    setAdd(this.rig.rightForeArm, rElbow, 0, 0);

    const torsoTwist = s * 7 * amp;
    const forwardLean = moving ? (running ? 10 : 4.5) * amp : Math.sin(this.gaitPhase) * 1.2;
    setAdd(this.rig.spine, forwardLean, torsoTwist, 0);
    setAdd(this.rig.head, -forwardLean * 0.4, -torsoTwist * 0.5, 0);

    if (this.rig.hips) {
      const hp = this.rig.hips.node.getLocalPosition();
      const bounce = moving ? Math.abs(s) * 0.045 * amp : Math.sin(this.gaitPhase) * 0.008;
      this.rig.hips.node.setLocalPosition(hp.x, this.hipsBaseY + bounce, hp.z);
    }
  }
}
