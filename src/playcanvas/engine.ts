import * as pc from 'playcanvas';
import { CarAudioEngine } from './audio';
import { PlayCanvasCar, PlayCanvasCarFleet, CarSummary } from './carFleet';
import { PlayableCharacter } from './character';
import { LicensePlateConfig } from './licensePlate';
import { NpcCrowdManager } from './npcs';
import { buildPlayCanvasOpenWorld, OpenWorldHandle, TimeOfDay } from './world';

export type CameraMode = 'chase' | 'hood' | 'orbit';
export type PlayerMode = 'car' | 'foot';

export interface ControlState {
  gas: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  nitro: boolean;
  sprint: boolean;
  joyX: number; // -1..1
  joyY: number; // -1..1
}

export interface HudTelemetry {
  playerMode: PlayerMode;
  speedKmh: number;
  gear: string;
  rpmNorm: number;
  nitroPct: number;
  nitroActive: boolean;
  activeCarId: string;
  activeCarName: string;
  nearbyCarId: string | null;
  nearbyCarName: string | null;
  characterLabel: string;
  isCustomCharacter: boolean;
  isCustomTashkent: boolean;
  isCustomRegiston: boolean;
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  muted: boolean;
  cars: CarSummary[];
}

export interface EngineCallbacks {
  onLoadProgress?: (label: string, pct: number) => void;
  onReady?: (telemetry: HudTelemetry) => void;
  onTelemetry?: (telemetry: HudTelemetry) => void;
  onContextLost?: (lost: boolean) => void;
}

function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as { Capacitor?: unknown }).Capacitor) return true;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /Android|iPhone|iPad|iPod|Mobile|wv\)/i.test(ua);
}

export class PlayCanvasCarGame {
  public readonly canvas: HTMLCanvasElement;
  public readonly app: pc.Application;
  public readonly isMobile: boolean;
  public readonly audio: CarAudioEngine;
  public readonly world: OpenWorldHandle;
  public readonly fleet: PlayCanvasCarFleet;
  public readonly character: PlayableCharacter;
  public readonly npcs: NpcCrowdManager;

  private readonly cameraEntity: pc.Entity;
  private readonly callbacks: EngineCallbacks;

  public controls: ControlState = {
    gas: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    nitro: false,
    sprint: false,
    joyX: 0,
    joyY: 0,
  };

  private playerMode: PlayerMode = 'car';
  private cameraMode: CameraMode = 'chase';
  private timeOfDay: TimeOfDay = 'day';

  // Driving physics state
  private velX = 0;
  private velZ = 0;
  private velY = 0;
  private steerAngle = 0;
  private bodyRoll = 0;
  private bodyPitch = 0;
  private wheelSpinDeg = 0;
  private nitroFuel = 1.0;
  private nitroActiveNow = false;
  private fullGasHoldSec = 0;
  private grounded = true;
  private elapsedSec = 0;

  // On-foot camera & combat state (allows looking straight UP at Tashkent TV Tower & sky!)
  private footCamYawDeg = 0;
  private footCamPitchDeg = 12; // Negative = look UP at sky/tower, Positive = look down
  private nearbyCar: PlayCanvasCar | null = null;
  private punchCooldown = 0;
  private camShakeTimer = 0;

  // Smooth camera state (allows sky tilt in BOTH Chase & Orbit modes!)
  private camPos = new pc.Vec3(0, 4.2, 68);
  private camTarget = new pc.Vec3(0, 1.4, 58);
  private chasePitchDeg = 0;    // Negative = look UP at sky/tower in Chase cam!
  private chaseYawOffsetDeg = 0;
  private orbitYawDeg = 22;
  private orbitPitchDeg = 16;   // Negative = look UP at sky/tower in Orbit cam!
  private orbitDist = 8.4;
  private isDraggingCamera = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private lastTelemetryTime = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.isMobile = detectMobileDevice();
    this.audio = new CarAudioEngine();

    canvas.addEventListener(
      'webglcontextlost',
      (ev) => {
        ev.preventDefault();
        this.callbacks.onContextLost?.(true);
      },
      false
    );
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.callbacks.onContextLost?.(false);
        this.resize();
      },
      false
    );

    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: !this.isMobile,
        alpha: false,
        powerPreference: this.isMobile ? 'default' : 'high-performance',
        preserveDrawingBuffer: false,
      },
    });

    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.graphicsDevice.maxPixelRatio = this.isMobile ? 1.4 : Math.min(window.devicePixelRatio || 1, 2);

    this.cameraEntity = new pc.Entity('MainCamera');
    this.cameraEntity.addComponent('camera', {
      clearColor: new pc.Color(0.52, 0.76, 0.96),
      fov: 54,
      nearClip: 0.22,
      farClip: 980,
      toneMapping: pc.TONEMAP_ACES,
    });
    this.cameraEntity.setLocalPosition(this.camPos);
    this.app.root.addChild(this.cameraEntity);

    this.world = buildPlayCanvasOpenWorld(this.app, this.isMobile);
    this.world.setTimeOfDay('day', this.cameraEntity.camera);
    this.fleet = new PlayCanvasCarFleet(this.app);
    this.character = new PlayableCharacter(this.app);
    this.character.setVisible(false);
    this.npcs = new NpcCrowdManager(this.app, this.isMobile);

    this.bindCameraOrbitGestures();
    this.bindKeyboard();
    window.addEventListener('resize', this.handleResize);
    this.app.on('update', this.handleUpdate);

    this.app.start();
  }

  public async init(): Promise<void> {
    this.callbacks.onLoadProgress?.('Starting PlayCanvas HDR Engine…', 10);
    const manifest = await this.fleet.fetchManifest();

    await this.world.loadCampusAssets(
      manifest.landmarkTashkent?.url ?? null,
      manifest.landmarkRegiston?.url ?? null,
      (label, pct) => {
        this.callbacks.onLoadProgress?.(label, pct);
      }
    );

    await this.fleet.loadAllFromManifest(manifest, (label, pct) => {
      this.callbacks.onLoadProgress?.(label, pct);
    });
    this.fleet.spawnUserCarsAsRoadTraffic(this.world, this.isMobile);

    if (manifest.character?.url) {
      this.callbacks.onLoadProgress?.('Loading character.glb…', 95);
      await this.character.loadFromUrl(manifest.character.url, manifest.character.fileName);
    }

    const first = this.fleet.getActiveCar();
    if (first) {
      this.snapCameraToCar(first);
    }
    this.callbacks.onLoadProgress?.('Ready', 100);
    this.callbacks.onReady?.(this.getTelemetry());
  }

  private handleResize = (): void => {
    this.resize();
  };

  public resize(): void {
    this.app.resizeCanvas();
  }

  private bindCameraOrbitGestures(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.isDraggingCamera = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDraggingCamera) return;
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;

      if (this.playerMode === 'foot') {
        this.footCamYawDeg -= dx * 0.34;
        // Full vertical sky look range (-52° straight UP at Tashkent Tower spire to +54° down!)
        this.footCamPitchDeg = Math.max(-52, Math.min(54, this.footCamPitchDeg + dy * 0.28));
      } else if (this.cameraMode === 'orbit') {
        this.orbitYawDeg -= dx * 0.32;
        this.orbitPitchDeg = Math.max(-36, Math.min(58, this.orbitPitchDeg + dy * 0.26));
      } else {
        // Chase & Hood cam ALSO support looking UP at the sky & Tashkent TV Tower spire!
        this.chaseYawOffsetDeg = Math.max(-145, Math.min(145, this.chaseYawOffsetDeg - dx * 0.28));
        this.chasePitchDeg = Math.max(-44, Math.min(34, this.chasePitchDeg + dy * 0.26));
      }
    });
    window.addEventListener('pointerup', () => {
      this.isDraggingCamera = false;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.cameraMode !== 'orbit') return;
        this.orbitDist = Math.max(4.5, Math.min(16.0, this.orbitDist + e.deltaY * 0.008));
      },
      { passive: true }
    );
  }

  private bindKeyboard(): void {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (down) this.audio.unlock();
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.controls.gas = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.controls.brake = down;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.controls.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.controls.right = down;
          break;
        case 'Space':
          if (this.playerMode === 'foot') {
            if (down && !e.repeat) this.triggerPunch();
          } else {
            this.controls.drift = down;
          }
          break;
        case 'KeyE':
          if (down && !e.repeat && this.playerMode === 'foot') {
            this.triggerPunch();
          }
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.controls.nitro = down;
          this.controls.sprint = down;
          break;
        case 'KeyF':
          if (down && !e.repeat) this.toggleEnterExitCar();
          break;
        case 'KeyC':
          if (down && !e.repeat) this.cycleCamera();
          break;
        case 'KeyH':
          if (down && !e.repeat) this.triggerHorn();
          break;
        case 'KeyR':
          if (down && !e.repeat) this.resetActiveCar();
          break;
      }
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
  }

  public setControl(key: Exclude<keyof ControlState, 'joyX' | 'joyY'>, active: boolean): void {
    if (active) this.audio.unlock();
    this.controls[key] = active;
  }

  public setJoystick(x: number, y: number): void {
    this.controls.joyX = Math.max(-1, Math.min(1, x));
    this.controls.joyY = Math.max(-1, Math.min(1, y));
  }

  public triggerHorn(): void {
    this.audio.playHorn();
  }

  /**
   * GTA On-Foot Melee Punch! Hits nearby citizens with realistic impact + vocal grunt,
   * and triggers them to fight back!
   */
  public triggerPunch(): void {
    this.audio.unlock();
    if (this.playerMode !== 'foot' || this.punchCooldown > 0) return;

    this.punchCooldown = 0.36;
    this.character.triggerPunch();
    this.audio.playPunchSwing();

    const res = this.npcs.handlePlayerPunch(this.character.x, this.character.z, this.character.yaw);
    if (res.hit) {
      // Turn player cleanly toward the struck citizen
      const dx = res.npcX - this.character.x;
      const dz = res.npcZ - this.character.z;
      this.character.yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
      this.character.setPosition(this.character.x, this.character.y, this.character.z, this.character.yaw);

      this.audio.playPunchHit();
      this.audio.playHumanGrunt(res.voicePitch);
      this.camShakeTimer = 0.14;
    }
  }

  public toggleMute(): boolean {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.emitTelemetryNow();
    return this.audio.muted;
  }

  public toggleEnterExitCar(): void {
    this.audio.unlock();
    if (this.playerMode === 'car') {
      const car = this.fleet.getActiveCar();
      if (!car) return;
      for (const f of car.nitroFlames) f.enabled = false;
      const yawRad = (car.yaw * Math.PI) / 180;
      const leftX = -Math.cos(yawRad);
      const leftZ = Math.sin(yawRad);
      const exitX = car.x + leftX * (car.carWidth * 0.5 + 1.05);
      const exitZ = car.z + leftZ * (car.carWidth * 0.5 + 1.05);
      const exitY = this.world.getTerrainHeight(exitX, exitZ);

      this.velX = 0;
      this.velZ = 0;
      this.velY = 0;
      this.steerAngle = 0;
      this.fullGasHoldSec = 0;
      this.nitroActiveNow = false;
      this.playerMode = 'foot';
      this.footCamYawDeg = car.yaw;
      this.footCamPitchDeg = 12;

      this.character.setPosition(exitX, exitY, exitZ, car.yaw);
      this.character.setVisible(true);
      this.emitTelemetryNow();
    } else {
      const target = this.fleet.findNearestCar(this.character.x, this.character.z, 5.2) || this.fleet.getActiveCar();
      if (!target) return;
      this.fleet.activeCarId = target.id;
      this.playerMode = 'car';
      this.character.setVisible(false);
      this.velX = 0;
      this.velZ = 0;
      this.velY = 0;
      this.chasePitchDeg = 0;
      this.chaseYawOffsetDeg = 0;
      this.snapCameraToCar(target);
      this.audio.playHorn();
      this.emitTelemetryNow();
    }
  }

  public switchToFootMode(): void {
    if (this.playerMode === 'car') {
      this.toggleEnterExitCar();
    }
  }

  public cycleCamera(): CameraMode {
    const order: CameraMode[] = ['chase', 'hood', 'orbit'];
    const idx = (order.indexOf(this.cameraMode) + 1) % order.length;
    this.cameraMode = order[idx];
    const car = this.fleet.getActiveCar();
    if (car && this.cameraMode === 'orbit') {
      this.orbitYawDeg = car.yaw + 28;
      this.orbitPitchDeg = 16;
    } else {
      this.chasePitchDeg = 0;
      this.chaseYawOffsetDeg = 0;
    }
    this.emitTelemetryNow();
    return this.cameraMode;
  }

  public cycleTimeOfDay(): TimeOfDay {
    const order: TimeOfDay[] = ['day', 'sunset', 'night'];
    const idx = (order.indexOf(this.timeOfDay) + 1) % order.length;
    this.timeOfDay = order[idx];
    this.world.setTimeOfDay(this.timeOfDay, this.cameraEntity.camera);
    this.emitTelemetryNow();
    return this.timeOfDay;
  }

  public selectCar(carId: string): void {
    const prev = this.fleet.getActiveCar();
    if (prev) {
      for (const f of prev.nitroFlames) f.enabled = false;
    }
    const car = this.fleet.getCarById(carId);
    if (!car) return;
    this.fleet.activeCarId = car.id;
    this.playerMode = 'car';
    this.character.setVisible(false);
    this.velX = 0;
    this.velZ = 0;
    this.velY = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.steerAngle = 0;
    this.fullGasHoldSec = 0;
    this.chasePitchDeg = 0;
    this.chaseYawOffsetDeg = 0;
    this.snapCameraToCar(car);
    this.audio.playHorn();
    this.emitTelemetryNow();
  }

  public flipCar(carId: string): void {
    this.fleet.flipCar180(carId);
    this.emitTelemetryNow();
  }

  public scaleCar(carId: string, delta: number): void {
    this.fleet.scaleCar(carId, delta);
    this.emitTelemetryNow();
  }

  public updateActiveCarPlate(patch: Partial<LicensePlateConfig>): void {
    const car = this.fleet.getActiveCar();
    if (!car) return;
    this.fleet.updateCarPlate(car.id, patch);
    this.emitTelemetryNow();
  }

  public async importLocalGlb(file: File): Promise<PlayCanvasCar> {
    const car = await this.fleet.importLocalGlbFile(file, this.world);
    this.selectCar(car.id);
    return car;
  }

  public async importCharacterGlb(file: File): Promise<boolean> {
    const ok = await this.character.loadFromFile(file);
    if (ok) {
      if (this.playerMode === 'car') {
        this.toggleEnterExitCar();
      }
      this.emitTelemetryNow();
    }
    return ok;
  }

  public flipCharacter(): void {
    this.character.toggleFlip180();
    this.emitTelemetryNow();
  }

  public async importTashkentGlb(file: File): Promise<boolean> {
    const ok = await this.world.loadTashkentGlbFile(file);
    this.emitTelemetryNow();
    return ok;
  }

  public async importRegistonGlb(file: File): Promise<boolean> {
    const ok = await this.world.loadRegistonGlbFile(file);
    this.emitTelemetryNow();
    return ok;
  }

  public resetActiveCar(): void {
    if (this.playerMode === 'foot') {
      const y = this.world.getTerrainHeight(-3.5, 58);
      this.character.setPosition(-3.5, y, 58, 0);
      this.footCamYawDeg = 0;
      this.footCamPitchDeg = 12;
      this.emitTelemetryNow();
      return;
    }
    const car = this.fleet.getActiveCar();
    if (!car) return;
    car.x = car.spawnX;
    car.z = car.spawnZ;
    car.y = this.world.getTerrainHeight(car.x, car.z);
    car.yaw = car.spawnYaw;
    this.velX = 0;
    this.velZ = 0;
    this.velY = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.nitroFuel = 1.0;
    this.fullGasHoldSec = 0;
    this.chasePitchDeg = 0;
    this.chaseYawOffsetDeg = 0;
    car.root.setLocalPosition(car.x, car.y, car.z);
    car.root.setLocalEulerAngles(0, car.yaw, 0);
    car.tiltPivot.setLocalEulerAngles(0, 0, 0);
    this.snapCameraToCar(car);
    this.emitTelemetryNow();
  }

  private snapCameraToCar(car: PlayCanvasCar): void {
    const yawRad = (car.yaw * Math.PI) / 180;
    const fwdX = -Math.sin(yawRad);
    const fwdZ = -Math.cos(yawRad);
    this.camPos.set(car.x - fwdX * 7.8, car.y + 3.0, car.z - fwdZ * 7.8);
    this.camTarget.set(car.x + fwdX * 2.5, car.y + 1.15, car.z + fwdZ * 2.5);
    this.cameraEntity.setLocalPosition(this.camPos);
    this.cameraEntity.lookAt(this.camTarget);
  }

  private resolveWorldCollisions(x: number, z: number, radius: number): { x: number; z: number; hitX: boolean; hitZ: boolean } {
    const maxR = this.world.worldRadius;
    let nx = Math.max(-maxR, Math.min(maxR, x));
    let nz = Math.max(-maxR, Math.min(maxR, z));
    let hitX = false;
    let hitZ = false;

    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (nx + radius > b.minX && nx - radius < b.maxX && nz + radius > b.minZ && nz - radius < b.maxZ) {
        const penLeft = Math.abs(nx + radius - b.minX);
        const penRight = Math.abs(b.maxX - (nx - radius));
        const penTop = Math.abs(nz + radius - b.minZ);
        const penBot = Math.abs(b.maxZ - (nz - radius));
        const minPen = Math.min(penLeft, penRight, penTop, penBot);
        if (minPen === penLeft) {
          nx = b.minX - radius;
          hitX = true;
        } else if (minPen === penRight) {
          nx = b.maxX + radius;
          hitX = true;
        } else if (minPen === penTop) {
          nz = b.minZ - radius;
          hitZ = true;
        } else {
          nz = b.maxZ + radius;
          hitZ = true;
        }
      }
    }
    return { x: nx, z: nz, hitX, hitZ };
  }

  private handleUpdate = (rawDt: number): void => {
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedSec += dt;
    if (this.punchCooldown > 0) this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.camShakeTimer > 0) this.camShakeTimer = Math.max(0, this.camShakeTimer - dt);

    const playerPos = new pc.Vec3(0, 0, 0);

    if (this.playerMode === 'foot') {
      this.stepOnFootPhysics(dt);
      this.updateFootCamera(dt);
      this.nearbyCar = this.fleet.findNearestCar(this.character.x, this.character.z, 5.2);
      playerPos.set(this.character.x, this.character.y, this.character.z);
    } else {
      const car = this.fleet.getActiveCar();
      if (!car) return;
      this.nearbyCar = null;
      this.stepCarPhysics(car, dt);
      this.updateCarCamera(car, dt);
      playerPos.set(car.x, car.y, car.z);
    }

    this.world.update(dt, this.elapsedSec, playerPos);

    // Update living city population (walkers, building citizens, swimmers & fight-back combat!)
    this.npcs.update(
      dt,
      this.elapsedSec,
      playerPos.x,
      playerPos.z,
      this.playerMode === 'foot',
      this.world.getTerrainHeight,
      () => {
        if (this.playerMode === 'foot') {
          this.character.triggerHitRecoil();
          this.audio.playPunchHit();
          this.audio.playHumanGrunt(0.92);
          this.camShakeTimer = 0.22;
        }
      }
    );

    if (this.elapsedSec - this.lastTelemetryTime >= 0.05) {
      this.emitTelemetryNow();
    }
  };

  private stepOnFootPhysics(dt: number): void {
    const keyFwd = (this.controls.gas ? 1 : 0) - (this.controls.brake ? 1 : 0);
    const keyStrafe = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);

    let inFwd = Math.abs(this.controls.joyY) > 0.08 ? this.controls.joyY : keyFwd;
    let inRight = Math.abs(this.controls.joyX) > 0.08 ? this.controls.joyX : keyStrafe;

    const mag = Math.hypot(inFwd, inRight);
    if (mag > 1) {
      inFwd /= mag;
      inRight /= mag;
    }

    const running = this.controls.sprint || mag > 0.92;
    const moveSpeed = mag > 0.06 ? (running ? 7.4 : 4.0) * Math.min(1, mag) : 0;

    if (moveSpeed > 0.05) {
      const camYawRad = (this.footCamYawDeg * Math.PI) / 180;
      const fwdX = -Math.sin(camYawRad);
      const fwdZ = -Math.cos(camYawRad);
      const rightX = Math.cos(camYawRad);
      const rightZ = -Math.sin(camYawRad);

      const moveX = fwdX * inFwd + rightX * inRight;
      const moveZ = fwdZ * inFwd + rightZ * inRight;
      const moveLen = Math.hypot(moveX, moveZ) || 1;
      const dirX = moveX / moveLen;
      const dirZ = moveZ / moveLen;

      const targetYawDeg = (Math.atan2(-dirX, -dirZ) * 180) / Math.PI;
      const diff = ((targetYawDeg - this.character.yaw + 540) % 360) - 180;
      this.character.yaw += diff * Math.min(1, dt * 12);

      const nextX = this.character.x + dirX * moveSpeed * dt;
      const nextZ = this.character.z + dirZ * moveSpeed * dt;
      const col = this.resolveWorldCollisions(nextX, nextZ, 0.55);

      const groundY = this.world.getTerrainHeight(col.x, col.z);
      this.character.setPosition(col.x, groundY, col.z, this.character.yaw);

      if (!this.isDraggingCamera && Math.abs(inRight) > 0.25) {
        this.footCamYawDeg -= inRight * 42 * dt;
      }
    }

    // Character's head physically tilts UP into the sky when looking at Tashkent TV Tower!
    this.character.setLookPitch(-this.footCamPitchDeg);
    this.character.updateAnimation(dt, moveSpeed, running);

    this.audio.updateWorld({
      inCar: false,
      rpmNorm: 0,
      throttle: 0,
      driftAmount: 0,
      nitroActive: false,
      waterProximity: this.world.getWaterProximity(this.character.x, this.character.z),
      trafficProximity: this.world.getNearestTrafficProximity(this.character.x, this.character.z),
    });
  }

  private updateFootCamera(dt: number): void {
    const yawRad = (this.footCamYawDeg * Math.PI) / 180;
    const pitchRad = (this.footCamPitchDeg * Math.PI) / 180;
    const dist = 4.6;
    const horiz = Math.cos(pitchRad) * dist;

    // When pitching negative (looking UP at sky / Tashkent TV Tower), keep camera cleanly above ground
    // and elevate the look target high into the sky!
    const rawCamY = this.character.y + 1.55 + Math.sin(pitchRad) * dist;
    const minCamY = this.character.y + 0.52;
    const skyLift = this.footCamPitchDeg < 0 ? Math.tan((-this.footCamPitchDeg * Math.PI) / 180) * 5.2 : 0;

    const desiredPos = new pc.Vec3(
      this.character.x + Math.sin(yawRad) * horiz,
      Math.max(minCamY, rawCamY),
      this.character.z + Math.cos(yawRad) * horiz
    );
    const desiredTarget = new pc.Vec3(
      this.character.x - Math.sin(yawRad) * 3.8,
      this.character.y + 1.48 + skyLift,
      this.character.z - Math.cos(yawRad) * 3.8
    );

    const alpha = 1 - Math.exp(-11 * dt);
    this.camPos.lerp(this.camPos, desiredPos, alpha);
    this.camTarget.lerp(this.camTarget, desiredTarget, alpha);

    // Subtle camera punch impact shake
    if (this.camShakeTimer > 0) {
      const s = this.camShakeTimer * 0.65;
      this.camPos.x += (Math.random() - 0.5) * s;
      this.camPos.y += (Math.random() - 0.5) * s;
    }

    if (this.cameraEntity.camera) {
      this.cameraEntity.camera.fov += (55 - this.cameraEntity.camera.fov) * Math.min(1, dt * 6);
    }
    this.cameraEntity.setLocalPosition(this.camPos);
    this.cameraEntity.lookAt(this.camTarget);
  }

  private stepCarPhysics(car: PlayCanvasCar, dt: number): void {
    const yawRad = (car.yaw * Math.PI) / 180;
    const fwdX = -Math.sin(yawRad);
    const fwdZ = -Math.cos(yawRad);
    const rightX = Math.cos(yawRad);
    const rightZ = -Math.sin(yawRad);

    let forwardSpeed = this.velX * fwdX + this.velZ * fwdZ;
    let lateralSpeed = this.velX * rightX + this.velZ * rightZ;

    const throttle = this.controls.gas ? 1 : 0;
    const brakeInput = this.controls.brake ? 1 : 0;
    const driftHeld = this.controls.drift;

    // Auto-Nitro kicks in when GAS is held at full throttle! (Plus manual NOS button anytime!)
    if (throttle > 0 && brakeInput === 0) {
      this.fullGasHoldSec += dt;
    } else {
      this.fullGasHoldSec = 0;
    }
    const autoFullThrottleNitro = this.fullGasHoldSec > 1.5 && forwardSpeed > 15.5;
    const nitroActive = (this.controls.nitro || autoFullThrottleNitro) && this.nitroFuel > 0.02 && throttle > 0;
    this.nitroActiveNow = nitroActive;

    if (nitroActive) {
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * (this.controls.nitro ? 0.25 : 0.14));
    } else {
      this.nitroFuel = Math.min(1, this.nitroFuel + dt * 0.14);
    }

    const maxSpeed = nitroActive ? 49.0 : 35.0;
    const maxReverse = -14.0;
    const accelRate = nitroActive ? 29.0 : 18.5;
    const prevForwardSpeed = forwardSpeed;

    if (this.grounded) {
      if (throttle > 0) {
        const speedRatio = Math.max(0, forwardSpeed / maxSpeed);
        forwardSpeed += accelRate * (1 - speedRatio * 0.62) * dt;
      }
      if (brakeInput > 0) {
        if (forwardSpeed > 1.2) {
          forwardSpeed = Math.max(0, forwardSpeed - 30.0 * dt);
        } else {
          forwardSpeed = Math.max(maxReverse, forwardSpeed - 12.0 * dt);
        }
      }
      if (driftHeld && Math.abs(forwardSpeed) > 3.0) {
        forwardSpeed *= Math.exp(-0.55 * dt);
      }
      if (throttle === 0 && brakeInput === 0) {
        forwardSpeed *= Math.exp(-1.15 * dt);
        if (Math.abs(forwardSpeed) < 0.08) forwardSpeed = 0;
      }
      forwardSpeed = Math.max(maxReverse, Math.min(maxSpeed, forwardSpeed));

      const steerInput = (this.controls.left ? 1 : 0) - (this.controls.right ? 1 : 0);
      const steerTarget = steerInput * (driftHeld ? 1.18 : 1.0);
      this.steerAngle += (steerTarget - this.steerAngle) * Math.min(1, dt * 11);

      const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 5.0);
      const highSpeedDamp = 1 / (1 + Math.abs(forwardSpeed) * 0.022);
      const reverseSign = forwardSpeed >= -0.1 ? 1 : -1;
      const turnRateDeg = (driftHeld ? 132 : 104) * highSpeedDamp;
      car.yaw += this.steerAngle * turnRateDeg * speedFactor * reverseSign * dt;

      const grip = driftHeld ? 2.4 : 9.2;
      lateralSpeed *= Math.exp(-grip * dt);
    }

    const newYawRad = (car.yaw * Math.PI) / 180;
    const nFwdX = -Math.sin(newYawRad);
    const nFwdZ = -Math.cos(newYawRad);
    const nRightX = Math.cos(newYawRad);
    const nRightZ = -Math.sin(newYawRad);

    this.velX = nFwdX * forwardSpeed + nRightX * lateralSpeed;
    this.velZ = nFwdZ * forwardSpeed + nRightZ * lateralSpeed;

    const rawNextX = car.x + this.velX * dt;
    const rawNextZ = car.z + this.velZ * dt;
    const col = this.resolveWorldCollisions(rawNextX, rawNextZ, 1.45);
    if (col.hitX) this.velX *= -0.25;
    if (col.hitZ) this.velZ *= -0.25;

    const prevGround = this.world.getTerrainHeight(car.x, car.z);
    const nextGround = this.world.getTerrainHeight(col.x, col.z);

    if (this.grounded) {
      const slopeRise = (nextGround - prevGround) / Math.max(dt, 0.005);
      if (nextGround < prevGround - 0.18 && Math.hypot(this.velX, this.velZ) > 9) {
        this.grounded = false;
        this.velY = Math.max(4.5, Math.min(11.5, Math.hypot(this.velX, this.velZ) * 0.28));
      } else {
        car.y = nextGround;
        this.velY = Math.max(0, slopeRise);
      }
    } else {
      this.velY -= 24.0 * dt;
      car.y += this.velY * dt;
      if (car.y <= nextGround) {
        car.y = nextGround;
        this.velY = 0;
        this.grounded = true;
      }
    }

    car.x = col.x;
    car.z = col.z;

    const frontGround = this.world.getTerrainHeight(car.x + nFwdX * 1.4, car.z + nFwdZ * 1.4);
    const rearGround = this.world.getTerrainHeight(car.x - nFwdX * 1.4, car.z - nFwdZ * 1.4);
    const slopePitchDeg = this.grounded
      ? (Math.atan2(frontGround - rearGround, 2.8) * 180) / Math.PI
      : Math.max(-18, Math.min(22, this.velY * 1.8));

    const accel = (forwardSpeed - prevForwardSpeed) / dt;
    const targetRoll = Math.max(-6.5, Math.min(6.5, -this.steerAngle * (forwardSpeed * 0.22)));
    const targetPitch = Math.max(-3.8, Math.min(3.8, accel * 0.14));
    this.bodyRoll += (targetRoll - this.bodyRoll) * Math.min(1, dt * 10);
    this.bodyPitch += (targetPitch - this.bodyPitch) * Math.min(1, dt * 10);

    car.root.setLocalPosition(car.x, car.y, car.z);
    car.root.setLocalEulerAngles(0, car.yaw, 0);
    car.tiltPivot.setLocalEulerAngles(slopePitchDeg + this.bodyPitch, 0, this.bodyRoll);

    // Animate Nitro exhaust flames flickering cleanly behind the car!
    for (let i = 0; i < car.nitroFlames.length; i++) {
      const f = car.nitroFlames[i];
      f.enabled = nitroActive;
      if (nitroActive) {
        const flicker = 0.85 + Math.sin(this.elapsedSec * 48 + i * 2.1) * 0.32 + Math.random() * 0.22;
        f.setLocalScale(0.95 + Math.random() * 0.2, 0.95 + Math.random() * 0.2, flicker);
      }
    }

    // Decoupled Wheel Steering + Rolling Spin (non-inverted!)
    const flipSign = car.flip180 ? -1 : 1;
    const avgRadius = car.wheels[0]?.radius || 0.35;
    this.wheelSpinDeg += ((forwardSpeed * dt) / Math.max(0.22, avgRadius)) * (180 / Math.PI);
    const steerDeg = this.steerAngle * 30;

    for (let i = 0; i < car.wheels.length; i++) {
      const w = car.wheels[i];
      const actsAsFront = car.flip180 ? !w.isFront : w.isFront;
      w.steerPivot.setLocalEulerAngles(0, actsAsFront ? steerDeg : 0, 0);
      w.spinPivot.setLocalEulerAngles(-this.wheelSpinDeg * flipSign, 0, 0);
    }

    const speedNorm = Math.min(1, Math.abs(forwardSpeed) / 36);
    const rpmNorm = 0.14 + ((speedNorm * 5.2) % 1) * 0.72 + speedNorm * 0.14;
    const driftSound =
      this.grounded && Math.abs(lateralSpeed) > 3.2
        ? Math.min(1, (Math.abs(lateralSpeed) - 3.2) / 8.0)
        : 0;

    this.audio.updateWorld({
      inCar: true,
      rpmNorm,
      throttle,
      driftAmount: driftSound,
      nitroActive,
      waterProximity: this.world.getWaterProximity(car.x, car.z),
      trafficProximity: this.world.getNearestTrafficProximity(car.x, car.z),
    });
  }

  private updateCarCamera(car: PlayCanvasCar, dt: number): void {
    const yawRad = (car.yaw * Math.PI) / 180;
    const fwdX = -Math.sin(yawRad);
    const fwdZ = -Math.cos(yawRad);
    const speed = Math.hypot(this.velX, this.velZ);

    const targetFov =
      this.cameraMode === 'hood'
        ? 62 + Math.min(14, speed * 0.35)
        : 52 + Math.min(14, speed * 0.34) + (this.nitroActiveNow ? 5.5 : 0);
    if (this.cameraEntity.camera) {
      this.cameraEntity.camera.fov += (targetFov - this.cameraEntity.camera.fov) * Math.min(1, dt * 6);
    }

    // Gently recentre horizontal chase drag only when driving fast and not dragging
    if (!this.isDraggingCamera && speed > 6 && this.cameraMode === 'chase') {
      this.chaseYawOffsetDeg *= Math.exp(-2.2 * dt);
    }

    const desiredPos = new pc.Vec3();
    const desiredTarget = new pc.Vec3();

    if (this.cameraMode === 'hood') {
      const lookUp = this.chasePitchDeg < 0 ? Math.tan((-this.chasePitchDeg * Math.PI) / 180) * 14 : -this.chasePitchDeg * 0.08;
      desiredPos.set(car.x + fwdX * 0.45, car.y + 1.52, car.z + fwdZ * 0.45);
      desiredTarget.set(car.x + fwdX * 14, car.y + 1.25 + lookUp, car.z + fwdZ * 14);
      this.camPos.copy(desiredPos);
      this.camTarget.copy(desiredTarget);
    } else if (this.cameraMode === 'orbit') {
      const oYaw = (this.orbitYawDeg * Math.PI) / 180;
      const oPitch = (this.orbitPitchDeg * Math.PI) / 180;
      const horiz = Math.cos(oPitch) * this.orbitDist;
      const rawY = car.y + 1.25 + Math.sin(oPitch) * this.orbitDist;
      const skyLift = this.orbitPitchDeg < 0 ? Math.tan((-this.orbitPitchDeg * Math.PI) / 180) * 6.5 : 0;
      desiredPos.set(
        car.x + Math.sin(oYaw) * horiz,
        Math.max(car.y + 0.65, rawY),
        car.z + Math.cos(oYaw) * horiz
      );
      desiredTarget.set(car.x, car.y + 1.15 + skyLift, car.z);
      const alpha = 1 - Math.exp(-12 * dt);
      this.camPos.lerp(this.camPos, desiredPos, alpha);
      this.camTarget.lerp(this.camTarget, desiredTarget, alpha);
    } else {
      // Chase Camera with Full Sky-Pitch Look-Up (can admire top of 86m Tashkent TV Tower!)
      const totalYawRad = ((car.yaw + this.chaseYawOffsetDeg) * Math.PI) / 180;
      const cFwdX = -Math.sin(totalYawRad);
      const cFwdZ = -Math.cos(totalYawRad);
      const backDist = 7.4 + Math.min(2.2, speed * 0.055);
      const pitchRad = (this.chasePitchDeg * Math.PI) / 180;
      const rawCamY = car.y + 2.7 + Math.min(0.6, speed * 0.015) + Math.sin(pitchRad) * 4.2;
      const skyLift = this.chasePitchDeg < 0 ? Math.tan((-this.chasePitchDeg * Math.PI) / 180) * 9.5 : 0;

      desiredPos.set(
        car.x - cFwdX * backDist,
        Math.max(car.y + 0.75, rawCamY),
        car.z - cFwdZ * backDist
      );
      desiredTarget.set(
        car.x + cFwdX * 3.8,
        car.y + 1.2 + skyLift,
        car.z + cFwdZ * 3.8
      );
      const posAlpha = 1 - Math.exp(-8.5 * dt);
      const tgtAlpha = 1 - Math.exp(-13.0 * dt);
      this.camPos.lerp(this.camPos, desiredPos, posAlpha);
      this.camTarget.lerp(this.camTarget, desiredTarget, tgtAlpha);
    }

    this.cameraEntity.setLocalPosition(this.camPos);
    this.cameraEntity.lookAt(this.camTarget);
  }

  public getTelemetry(): HudTelemetry {
    const car = this.fleet.getActiveCar();
    const speedMps = this.playerMode === 'foot' ? this.character.speed : Math.hypot(this.velX, this.velZ);
    const speedKmh = Math.round(speedMps * 3.6);

    const yawRad = ((car?.yaw ?? 0) * Math.PI) / 180;
    const signedFwd = this.velX * -Math.sin(yawRad) + this.velZ * -Math.cos(yawRad);

    let gear = 'P';
    if (this.playerMode === 'foot') {
      gear = this.character.speed > 4.5 ? 'RUN' : this.character.speed > 0.2 ? 'WLK' : 'IDL';
    } else if (signedFwd < -0.5) {
      gear = 'R';
    } else if (speedKmh < 2) {
      gear = 'P';
    } else if (speedKmh < 26) {
      gear = '1';
    } else if (speedKmh < 52) {
      gear = '2';
    } else if (speedKmh < 82) {
      gear = '3';
    } else if (speedKmh < 112) {
      gear = '4';
    } else if (speedKmh < 142) {
      gear = '5';
    } else {
      gear = '6';
    }

    const rpmNorm =
      this.playerMode === 'foot'
        ? Math.min(1, this.character.speed / 7.4)
        : speedKmh < 2
          ? 0.12
          : Math.min(1, 0.22 + ((speedKmh % 28) / 28) * 0.72 + (speedKmh > 120 ? 0.14 : 0));

    return {
      playerMode: this.playerMode,
      speedKmh,
      gear,
      rpmNorm,
      nitroPct: Math.round(this.nitroFuel * 100),
      nitroActive: this.nitroActiveNow,
      activeCarId: car?.id ?? '',
      activeCarName: car?.name ?? 'Loading…',
      nearbyCarId: this.nearbyCar?.id ?? null,
      nearbyCarName: this.nearbyCar?.name ?? null,
      characterLabel: this.character.label,
      isCustomCharacter: this.character.isCustomGlb,
      isCustomTashkent: this.world.isCustomTashkentLoaded(),
      isCustomRegiston: this.world.isCustomRegistonLoaded(),
      cameraMode: this.cameraMode,
      timeOfDay: this.timeOfDay,
      muted: this.audio.muted,
      cars: this.fleet.getSummaries(),
    };
  }

  private emitTelemetryNow(): void {
    this.lastTelemetryTime = this.elapsedSec;
    this.callbacks.onTelemetry?.(this.getTelemetry());
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.app.off('update', this.handleUpdate);
    this.audio.dispose();
    this.app.destroy();
  }
}
