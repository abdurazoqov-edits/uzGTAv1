import * as pc from 'playcanvas';
import { buildRealisticHumanEntity, HumanAppearance, HumanoidRig, RiggedBone } from './character';

export type NpcRole = 'walker' | 'bystander' | 'swimmer';

interface NpcAgent {
  id: number;
  role: NpcRole;
  root: pc.Entity;
  model: pc.Entity;
  rig: HumanoidRig;
  splashRing?: pc.Entity;
  x: number;
  y: number;
  z: number;
  yaw: number;
  baseX: number;
  baseZ: number;
  waypoints?: Array<{ x: number; z: number }>;
  wpIndex: number;
  walkSpeed: number;
  phase: number;
  hipsBaseY: number;
  voicePitch: number;

  // GTA Combat AI state
  aggroTimer: number;
  recoilTimer: number;
  punchTimer: number;
  punchCooldown: number;
  punchHitDealt: boolean;
  knockVx: number;
  knockVz: number;
}

const CITIZEN_PALETTES: HumanAppearance[] = [
  { skin: [0.87, 0.70, 0.56], hair: [0.10, 0.08, 0.07], jacket: [0.18, 0.34, 0.56], shirt: [0.95, 0.96, 0.98], pants: [0.16, 0.20, 0.28], shoes: [0.92, 0.93, 0.95], hasSunglasses: false, heightScale: 1.0 },
  { skin: [0.82, 0.63, 0.49], hair: [0.16, 0.11, 0.08], jacket: [0.68, 0.22, 0.24], shirt: [0.96, 0.94, 0.90], pants: [0.18, 0.22, 0.30], shoes: [0.15, 0.16, 0.19], hasSunglasses: true, heightScale: 0.96 },
  { skin: [0.90, 0.74, 0.62], hair: [0.28, 0.20, 0.12], jacket: [0.22, 0.46, 0.34], shirt: [0.94, 0.95, 0.96], pants: [0.28, 0.25, 0.21], shoes: [0.88, 0.86, 0.82], hasSunglasses: false, heightScale: 0.98 },
  { skin: [0.76, 0.56, 0.42], hair: [0.08, 0.07, 0.06], jacket: [0.22, 0.23, 0.26], shirt: [0.85, 0.88, 0.92], pants: [0.15, 0.17, 0.22], shoes: [0.95, 0.95, 0.96], hasSunglasses: true, heightScale: 1.03 },
  { skin: [0.86, 0.68, 0.55], hair: [0.12, 0.09, 0.07], jacket: [0.78, 0.56, 0.22], shirt: [0.96, 0.96, 0.97], pants: [0.19, 0.23, 0.34], shoes: [0.22, 0.20, 0.18], hasSunglasses: false, heightScale: 0.95 },
  { skin: [0.84, 0.66, 0.52], hair: [0.09, 0.08, 0.07], jacket: [0.34, 0.24, 0.48], shirt: [0.94, 0.94, 0.96], pants: [0.16, 0.18, 0.24], shoes: [0.92, 0.93, 0.95], hasSunglasses: false, heightScale: 1.01 },
];

const SWIMMER_PALETTES: HumanAppearance[] = [
  { skin: [0.84, 0.64, 0.49], hair: [0.10, 0.08, 0.07], jacket: [0, 0, 0], shirt: [0, 0, 0], pants: [0.10, 0.52, 0.86], shoes: [0, 0, 0], isSwimmer: true, heightScale: 1.0 },
  { skin: [0.88, 0.70, 0.56], hair: [0.24, 0.16, 0.10], jacket: [0, 0, 0], shirt: [0, 0, 0], pants: [0.88, 0.24, 0.28], shoes: [0, 0, 0], isSwimmer: true, heightScale: 0.95 },
  { skin: [0.78, 0.58, 0.44], hair: [0.08, 0.07, 0.06], jacket: [0, 0, 0], shirt: [0, 0, 0], pants: [0.12, 0.66, 0.48], shoes: [0, 0, 0], isSwimmer: true, heightScale: 1.02 },
  { skin: [0.86, 0.67, 0.53], hair: [0.14, 0.10, 0.08], jacket: [0, 0, 0], shirt: [0, 0, 0], pants: [0.95, 0.66, 0.14], shoes: [0, 0, 0], isSwimmer: true, heightScale: 0.97 },
];

function setBoneAdd(b: RiggedBone | undefined, dx: number, dy: number, dz: number): void {
  if (!b) return;
  b.node.setLocalEulerAngles(b.baseEuler.x + dx, b.baseEuler.y + dy, b.baseEuler.z + dz);
}

/**
 * Builds a realistic seated driver placed inside AI traffic cars (hands raised onto steering wheel!).
 */
export function createSeatedDriverEntity(seed: number, carLength: number, carName: string): pc.Entity {
  const palette = CITIZEN_PALETTES[seed % CITIZEN_PALETTES.length];
  const { entity, rig } = buildRealisticHumanEntity({ ...palette, heightScale: 0.86 }, false);

  // Pose into natural seated driving posture
  setBoneAdd(rig.leftUpLeg, 86, 0, 0);
  setBoneAdd(rig.rightUpLeg, 86, 0, 0);
  setBoneAdd(rig.leftLeg, -82, 0, 0);
  setBoneAdd(rig.rightLeg, -82, 0, 0);
  setBoneAdd(rig.leftArm, 58, 12, 0);
  setBoneAdd(rig.rightArm, 58, -12, 0);
  setBoneAdd(rig.leftForeArm, 24, 0, 0);
  setBoneAdd(rig.rightForeArm, 24, 0, 0);

  const holder = new pc.Entity(`TrafficDriver_${seed}`);
  // Left-hand-drive cabin seat (adjusted slightly higher/forward for Damas van vs sedan)
  const isVan = /damas/i.test(carName);
  const seatX = isVan ? -0.32 : -0.36;
  const seatY = isVan ? 0.34 : 0.24;
  const seatZ = isVan ? -carLength * 0.22 : -0.05;
  holder.setLocalPosition(seatX, seatY, seatZ);
  holder.addChild(entity);
  return holder;
}

export interface PunchResult {
  hit: boolean;
  npcX: number;
  npcZ: number;
  voicePitch: number;
}

export class NpcCrowdManager {
  public readonly root: pc.Entity;
  private readonly agents: NpcAgent[] = [];
  private readonly splashMat: pc.StandardMaterial;
  private nextId = 1;

  constructor(app: pc.Application, isMobile: boolean) {
    this.root = new pc.Entity('CityPopulationRoot');
    app.root.addChild(this.root);

    const sm = new pc.StandardMaterial();
    sm.diffuse.set(0.85, 0.96, 1.0);
    sm.emissive.set(0.65, 0.88, 1.0);
    sm.emissiveIntensity = 0.45;
    sm.opacity = 0.45;
    sm.blendType = pc.BLEND_NORMAL;
    sm.depthWrite = false;
    sm.update();
    this.splashMat = sm;

    this.spawnCityPopulation(isMobile);
  }

  private addNpc(cfg: {
    role: NpcRole;
    x: number;
    z: number;
    yaw?: number;
    waypoints?: Array<{ x: number; z: number }>;
    paletteIndex: number;
    castShadows: boolean;
  }): void {
    const palette =
      cfg.role === 'swimmer'
        ? SWIMMER_PALETTES[cfg.paletteIndex % SWIMMER_PALETTES.length]
        : CITIZEN_PALETTES[cfg.paletteIndex % CITIZEN_PALETTES.length];

    const { entity, rig } = buildRealisticHumanEntity(palette, cfg.castShadows);
    const root = new pc.Entity(`Citizen_${cfg.role}_${this.nextId}`);
    root.setLocalPosition(cfg.x, cfg.role === 'swimmer' ? -0.18 : 0.04, cfg.z);
    root.setLocalEulerAngles(0, cfg.yaw ?? 0, 0);
    root.addChild(entity);

    let splashRing: pc.Entity | undefined;
    if (cfg.role === 'swimmer') {
      // Lean swimmer forward horizontally in the water!
      entity.setLocalEulerAngles(-76, 0, 0);
      entity.setLocalPosition(0, 0.16, 0.55);

      const ring = new pc.Entity('SwimSplashRing');
      ring.setLocalPosition(0, 0.24, 0);
      ring.setLocalScale(1.15, 0.05, 1.15);
      ring.addComponent('render', {
        type: 'torus',
        material: this.splashMat,
        castShadows: false,
        receiveShadows: false,
      });
      root.addChild(ring);
      splashRing = ring;
    }

    this.root.addChild(root);

    this.agents.push({
      id: this.nextId++,
      role: cfg.role,
      root,
      model: entity,
      rig,
      splashRing,
      x: cfg.x,
      y: cfg.role === 'swimmer' ? -0.18 : 0.04,
      z: cfg.z,
      yaw: cfg.yaw ?? 0,
      baseX: cfg.x,
      baseZ: cfg.z,
      waypoints: cfg.waypoints,
      wpIndex: 0,
      walkSpeed: cfg.role === 'swimmer' ? 1.15 : 1.55 + (this.nextId % 4) * 0.2,
      phase: this.nextId * 1.37,
      hipsBaseY: rig.hips ? rig.hips.node.getLocalPosition().y : 0.94,
      voicePitch: 0.86 + (this.nextId % 5) * 0.08,
      aggroTimer: 0,
      recoilTimer: 0,
      punchTimer: 0,
      punchCooldown: 0,
      punchHitDealt: false,
      knockVx: 0,
      knockVz: 0,
    });
  }

  private spawnCityPopulation(isMobile: boolean): void {
    const shadows = !isMobile;

    // 1. Sidewalk & Boulevard Pedestrians (right near player spawn, Tashkent Plaza, Charleston Rd & Registon!)
    this.addNpc({
      role: 'walker',
      x: -8.6,
      z: 56,
      waypoints: [
        { x: -8.6, z: 54 },
        { x: -8.6, z: 68 },
        { x: -24, z: 68 },
        { x: -24, z: 54 },
      ],
      paletteIndex: 0,
      castShadows: shadows,
    });
    this.addNpc({
      role: 'walker',
      x: 8.6,
      z: 58,
      waypoints: [
        { x: 8.6, z: 54 },
        { x: 8.6, z: 68 },
        { x: 26, z: 68 },
        { x: 26, z: 54 },
      ],
      paletteIndex: 1,
      castShadows: shadows,
    });
    this.addNpc({
      role: 'walker',
      x: -14,
      z: 36,
      waypoints: [
        { x: -14, z: 42 },
        { x: 14, z: 42 },
        { x: 14, z: 16 },
        { x: -14, z: 16 },
      ],
      paletteIndex: 2,
      castShadows: shadows,
    });
    this.addNpc({
      role: 'walker',
      x: -44,
      z: 67.5,
      waypoints: [
        { x: -84, z: 67.5 },
        { x: -22, z: 67.5 },
      ],
      paletteIndex: 3,
      castShadows: shadows,
    });
    this.addNpc({
      role: 'walker',
      x: 42,
      z: 84.5,
      waypoints: [
        { x: 18, z: 84.5 },
        { x: 96, z: 84.5 },
      ],
      paletteIndex: 4,
      castShadows: shadows,
    });
    // Registon Square Samarqand 2027 Promenade Walkers
    this.addNpc({
      role: 'walker',
      x: -116,
      z: -102,
      waypoints: [
        { x: -132, z: -98 },
        { x: -94, z: -98 },
        { x: -94, z: -136 },
      ],
      paletteIndex: 5,
      castShadows: shadows,
    });

    // 2. Building Forecourt & Cafe Citizens (standing/chatting near Gradient Canopy, Tashkent Tower, Cafes, Registon!)
    const bystanders: Array<[number, number, number, number]> = [
      [-15.5, 118.5, 130, 1],
      [-13.8, 117.2, -50, 2],
      [16.2, 118.4, -120, 4],
      [6.2, 43.2, 175, 0],       // Right next to ABDURAZOKHOV sign at Tashkent TV Tower!
      [-7.2, 43.5, 155, 5],
      [-103, -101, 45, 3],       // Right next to SAMARQAND 2027 sign in front of Registon!
      [-101, -99.5, -135, 0],
      [145, 51, 90, 2],          // Bay View cafe patio
    ];
    for (const [bx, bz, byaw, pi] of bystanders) {
      this.addNpc({
        role: 'bystander',
        x: bx,
        z: bz,
        yaw: byaw,
        paletteIndex: pi,
        castShadows: shadows,
      });
    }

    // 3. Swimmers in Stevens Creek River (right under/near the bridge!) and Bay View Lake!
    this.addNpc({
      role: 'swimmer',
      x: 24,
      z: -120,
      waypoints: [
        { x: 14, z: -116 },
        { x: 48, z: -128 },
      ],
      paletteIndex: 0,
      castShadows: false,
    });
    this.addNpc({
      role: 'swimmer',
      x: 44,
      z: -132,
      waypoints: [
        { x: 54, z: -136 },
        { x: 26, z: -122 },
      ],
      paletteIndex: 1,
      castShadows: false,
    });
    this.addNpc({
      role: 'swimmer',
      x: 186,
      z: 24,
      waypoints: [
        { x: 184, z: 42 },
        { x: 196, z: 6 },
        { x: 182, z: -10 },
      ],
      paletteIndex: 2,
      castShadows: false,
    });
    this.addNpc({
      role: 'swimmer',
      x: 192,
      z: -16,
      waypoints: [
        { x: 184, z: -32 },
        { x: 196, z: 12 },
      ],
      paletteIndex: 3,
      castShadows: false,
    });
  }

  /**
   * Player throws a punch! Checks closest citizen within 2.7m, staggers them, and makes them fight back!
   */
  public handlePlayerPunch(px: number, pz: number, playerYawDeg: number): PunchResult {
    const yawRad = (playerYawDeg * Math.PI) / 180;
    const fwdX = -Math.sin(yawRad);
    const fwdZ = -Math.cos(yawRad);

    let best: NpcAgent | null = null;
    let bestScore = Infinity;

    for (const npc of this.agents) {
      const dx = npc.x - px;
      const dz = npc.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.75) continue;
      // Favor NPCs roughly in front of the player, while still allowing close-range hits all around
      const dot = dist > 0.01 ? (dx * fwdX + dz * fwdZ) / dist : 1;
      const score = dist - dot * 0.65;
      if (score < bestScore) {
        bestScore = score;
        best = npc;
      }
    }

    if (!best) {
      return { hit: false, npcX: 0, npcZ: 0, voicePitch: 1 };
    }

    const dx = best.x - px;
    const dz = best.z - pz;
    const len = Math.hypot(dx, dz) || 1;
    best.knockVx = (dx / len) * 5.2;
    best.knockVz = (dz / len) * 5.2;
    best.recoilTimer = 0.36;
    best.aggroTimer = 24.0; // Angry citizen now fights back!
    best.punchCooldown = 0.65;
    // Face player
    best.yaw = (Math.atan2(dx, dz) * 180) / Math.PI;

    return {
      hit: true,
      npcX: best.x,
      npcZ: best.z,
      voicePitch: best.voicePitch,
    };
  }

  public update(
    dt: number,
    elapsedSec: number,
    playerX: number,
    playerZ: number,
    playerOnFoot: boolean,
    getTerrainHeight: (x: number, z: number) => number,
    onNpcStrikePlayer: (npcX: number, npcZ: number, voicePitch: number) => void
  ): void {
    for (let i = 0; i < this.agents.length; i++) {
      const npc = this.agents[i];

      if (npc.recoilTimer > 0) npc.recoilTimer = Math.max(0, npc.recoilTimer - dt);
      if (npc.punchTimer > 0) npc.punchTimer = Math.max(0, npc.punchTimer - dt);
      if (npc.punchCooldown > 0) npc.punchCooldown = Math.max(0, npc.punchCooldown - dt);
      if (npc.aggroTimer > 0) npc.aggroTimer = Math.max(0, npc.aggroTimer - dt);

      // Apply knockback decay
      if (Math.hypot(npc.knockVx, npc.knockVz) > 0.08) {
        npc.x += npc.knockVx * dt;
        npc.z += npc.knockVz * dt;
        const decay = Math.exp(-8.5 * dt);
        npc.knockVx *= decay;
        npc.knockVz *= decay;
      }

      // SWIMMER BEHAVIOR
      if (npc.role === 'swimmer') {
        if (npc.waypoints && npc.waypoints.length >= 2) {
          const target = npc.waypoints[npc.wpIndex];
          const dx = target.x - npc.x;
          const dz = target.z - npc.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.4) {
            npc.wpIndex = (npc.wpIndex + 1) % npc.waypoints.length;
          } else {
            const vx = (dx / dist) * npc.walkSpeed;
            const vz = (dz / dist) * npc.walkSpeed;
            npc.x += vx * dt;
            npc.z += vz * dt;
            const targetYaw = (Math.atan2(-vx, -vz) * 180) / Math.PI;
            const diff = ((targetYaw - npc.yaw + 540) % 360) - 180;
            npc.yaw += diff * Math.min(1, dt * 4);
          }
        }

        npc.phase += dt * 4.4;
        const stroke = Math.sin(npc.phase);
        const kick = Math.sin(npc.phase * 2.2);
        const bob = Math.sin(elapsedSec * 2.6 + npc.id) * 0.05;
        npc.y = -0.18 + bob;

        npc.root.setLocalPosition(npc.x, npc.y, npc.z);
        npc.root.setLocalEulerAngles(0, npc.yaw, 0);

        // Freestyle arm strokes & flutter kick
        setBoneAdd(npc.rig.leftArm, 110 + stroke * 65, 0, -14);
        setBoneAdd(npc.rig.rightArm, 110 - stroke * 65, 0, 14);
        setBoneAdd(npc.rig.leftForeArm, 28 + Math.max(0, stroke) * 30, 0, 0);
        setBoneAdd(npc.rig.rightForeArm, 28 + Math.max(0, -stroke) * 30, 0, 0);
        setBoneAdd(npc.rig.leftUpLeg, kick * 24, 0, 0);
        setBoneAdd(npc.rig.rightUpLeg, -kick * 24, 0, 0);
        setBoneAdd(npc.rig.head, 42 + stroke * 10, stroke * 18, 0);

        if (npc.splashRing) {
          const pulse = 0.85 + ((elapsedSec * 0.9 + npc.id * 0.31) % 1) * 0.9;
          npc.splashRing.setLocalScale(pulse, 0.04, pulse);
        }
        continue;
      }

      // LAND CITIZEN BEHAVIOR (Walk / Idle / GTA Aggro Fight-Back!)
      let moveSpeed = 0;
      const distToPlayer = Math.hypot(playerX - npc.x, playerZ - npc.z);

      if (npc.aggroTimer > 0 && playerOnFoot && distToPlayer < 28) {
        // Turn toward player
        const dx = playerX - npc.x;
        const dz = playerZ - npc.z;
        const targetYaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
        const diff = ((targetYaw - npc.yaw + 540) % 360) - 180;
        npc.yaw += diff * Math.min(1, dt * 10);

        if (npc.recoilTimer <= 0) {
          if (distToPlayer > 1.55) {
            const chaseSpeed = 3.85;
            npc.x += (dx / Math.max(0.01, distToPlayer)) * chaseSpeed * dt;
            npc.z += (dz / Math.max(0.01, distToPlayer)) * chaseSpeed * dt;
            moveSpeed = chaseSpeed;
          } else if (npc.punchCooldown <= 0 && npc.punchTimer <= 0) {
            // Citizen swings a retaliatory punch!
            npc.punchTimer = 0.42;
            npc.punchCooldown = 1.15;
            npc.punchHitDealt = false;
          }
        }

        // Deal retaliatory strike mid-swing
        if (npc.punchTimer > 0 && npc.punchTimer < 0.24 && !npc.punchHitDealt) {
          npc.punchHitDealt = true;
          if (distToPlayer < 2.25) {
            onNpcStrikePlayer(npc.x, npc.z, npc.voicePitch);
          }
        }
      } else if (npc.role === 'walker' && npc.waypoints && npc.waypoints.length >= 2 && npc.recoilTimer <= 0) {
        const target = npc.waypoints[npc.wpIndex];
        const dx = target.x - npc.x;
        const dz = target.z - npc.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.1) {
          npc.wpIndex = (npc.wpIndex + 1) % npc.waypoints.length;
        } else {
          const vx = (dx / dist) * npc.walkSpeed;
          const vz = (dz / dist) * npc.walkSpeed;
          npc.x += vx * dt;
          npc.z += vz * dt;
          moveSpeed = npc.walkSpeed;
          const targetYaw = (Math.atan2(-vx, -vz) * 180) / Math.PI;
          const diff = ((targetYaw - npc.yaw + 540) % 360) - 180;
          npc.yaw += diff * Math.min(1, dt * 7);
        }
      }

      npc.y = getTerrainHeight(npc.x, npc.z);
      npc.root.setLocalPosition(npc.x, npc.y, npc.z);
      npc.root.setLocalEulerAngles(0, npc.yaw, 0);

      // Animate human limbs (walk/run, idle chat, recoil, and fight-back punch!)
      const moving = moveSpeed > 0.2;
      const running = moveSpeed > 2.8;
      npc.phase += dt * (moving ? (running ? 10.5 : 6.8) : 1.7);
      const s = Math.sin(npc.phase);
      const c = Math.cos(npc.phase);
      const amp = moving ? Math.min(1.15, moveSpeed / 2.2) : 0;

      let lArmX = -s * 28 * amp;
      let rArmX = s * 28 * amp;
      let lElbow = moving ? 12 + Math.max(0, s) * 24 * amp : 10 + Math.sin(elapsedSec * 1.4 + npc.id) * 6;
      let rElbow = moving ? 12 + Math.max(0, -s) * 24 * amp : 10 + Math.cos(elapsedSec * 1.3 + npc.id) * 6;
      let spineX = moving ? (running ? -8 : -3) * amp : Math.sin(npc.phase) * 1.2;
      let spineY = s * 6 * amp;

      // Guard stance when aggro
      if (npc.aggroTimer > 0 && !moving) {
        lArmX = 48;
        rArmX = 52;
        lElbow = 72;
        rElbow = 76;
      }

      // Retaliatory punch swing
      if (npc.punchTimer > 0) {
        const pt = Math.sin((npc.punchTimer / 0.42) * Math.PI);
        rArmX = 96 * pt;
        rElbow = 14 + (1 - pt) * 62;
        spineY = 30 * pt;
        spineX = -10 * pt;
      }

      // Hit recoil stagger
      if (npc.recoilTimer > 0) {
        const rt = Math.sin((npc.recoilTimer / 0.36) * Math.PI);
        spineX = 24 * rt;
        lArmX = 32 * rt;
        rArmX = 32 * rt;
      }

      setBoneAdd(npc.rig.leftUpLeg, s * 32 * amp, 0, 0);
      setBoneAdd(npc.rig.rightUpLeg, -s * 32 * amp, 0, 0);
      setBoneAdd(npc.rig.leftLeg, -Math.max(0, -c) * 38 * amp, 0, 0);
      setBoneAdd(npc.rig.rightLeg, -Math.max(0, c) * 38 * amp, 0, 0);
      setBoneAdd(npc.rig.leftArm, lArmX, 0, 0);
      setBoneAdd(npc.rig.rightArm, rArmX, 0, 0);
      setBoneAdd(npc.rig.leftForeArm, lElbow, 0, 0);
      setBoneAdd(npc.rig.rightForeArm, rElbow, 0, 0);
      setBoneAdd(npc.rig.spine, spineX, spineY, 0);
      setBoneAdd(
        npc.rig.head,
        -spineX * 0.4,
        moving ? -spineY * 0.4 : Math.sin(elapsedSec * 0.8 + npc.id * 2) * 14,
        0
      );

      if (npc.rig.hips) {
        const hp = npc.rig.hips.node.getLocalPosition();
        const bounce = moving ? Math.abs(s) * 0.04 * amp : 0;
        npc.rig.hips.node.setLocalPosition(hp.x, npc.hipsBaseY + bounce, hp.z);
      }
    }
  }
}
