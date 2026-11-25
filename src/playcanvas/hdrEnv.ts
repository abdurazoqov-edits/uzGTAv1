import * as pc from 'playcanvas';

export type TimeOfDay = 'day' | 'sunset' | 'night';

interface EnvPreset {
  zenith: string;
  midSky: string;
  horizon: string;
  ground: string;
  sunColor: string;
  sunGlow: string;
  sunU: number; // 0..1 azimuth
  sunV: number; // 0..0.5 elevation (0 = top, 0.5 = horizon)
  sunRadius: number;
  cloudAlpha: number;
  cloudTint: string;
  stars: boolean;
  exposure: number;
  skyboxIntensity: number;
  ambient: [number, number, number];
  sunLightColor: [number, number, number];
  sunLightIntensity: number;
  sunEuler: [number, number, number];
  fillColor: [number, number, number];
  fillIntensity: number;
  fogColor: [number, number, number];
  fogStart: number;
  fogEnd: number;
  clearColor: [number, number, number];
}

const ENV_PRESETS: Record<TimeOfDay, EnvPreset> = {
  day: {
    zenith: '#1a5cc8',
    midSky: '#4e9be8',
    horizon: '#d8ecff',
    ground: '#4a5547',
    sunColor: '#fffdf2',
    sunGlow: 'rgba(255, 240, 198, 0.85)',
    sunU: 0.22,
    sunV: 0.24,
    sunRadius: 24,
    cloudAlpha: 0.42,
    cloudTint: '#ffffff',
    stars: false,
    exposure: 1.18,
    skyboxIntensity: 1.15,
    ambient: [0.32, 0.38, 0.48],
    sunLightColor: [1.0, 0.96, 0.88],
    sunLightIntensity: 2.35,
    sunEuler: [48, 34, 0],
    fillColor: [0.58, 0.78, 1.0],
    fillIntensity: 0.55,
    fogColor: [0.76, 0.86, 0.96],
    fogStart: 220,
    fogEnd: 820,
    clearColor: [0.52, 0.76, 0.96],
  },
  sunset: {
    zenith: '#1d2d68',
    midSky: '#b65b6c',
    horizon: '#ffb36c',
    ground: '#3c312b',
    sunColor: '#fff3cf',
    sunGlow: 'rgba(255, 168, 86, 0.92)',
    sunU: 0.76,
    sunV: 0.42,
    sunRadius: 34,
    cloudAlpha: 0.5,
    cloudTint: '#ffd0a4',
    stars: false,
    exposure: 1.24,
    skyboxIntensity: 1.18,
    ambient: [0.34, 0.24, 0.28],
    sunLightColor: [1.0, 0.68, 0.4],
    sunLightIntensity: 2.55,
    sunEuler: [22, -62, 0],
    fillColor: [0.55, 0.58, 0.92],
    fillIntensity: 0.48,
    fogColor: [0.92, 0.63, 0.45],
    fogStart: 195,
    fogEnd: 760,
    clearColor: [0.88, 0.55, 0.38],
  },
  night: {
    zenith: '#050918',
    midSky: '#0c1836',
    horizon: '#1a2f52',
    ground: '#0c1018',
    sunColor: '#dcecff',
    sunGlow: 'rgba(130, 180, 255, 0.45)',
    sunU: 0.64,
    sunV: 0.24,
    sunRadius: 16,
    cloudAlpha: 0.16,
    cloudTint: '#3b5882',
    stars: true,
    exposure: 1.28,
    skyboxIntensity: 0.72,
    ambient: [0.16, 0.22, 0.34],
    sunLightColor: [0.58, 0.74, 1.0],
    sunLightIntensity: 1.05,
    sunEuler: [52, -40, 0],
    fillColor: [0.96, 0.74, 0.45],
    fillIntensity: 0.32,
    fogColor: [0.06, 0.1, 0.19],
    fogStart: 150,
    fogEnd: 640,
    clearColor: [0.05, 0.08, 0.16],
  },
};

interface CachedHdrEnv {
  envAtlas: pc.Texture;
  skybox: pc.Texture;
  sourceTex: pc.Texture;
}

function buildEquirectSkyCanvas(preset: EnvPreset, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Sky -> Horizon -> Ground vertical gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, preset.zenith);
  grad.addColorStop(0.32, preset.midSky);
  grad.addColorStop(0.495, preset.horizon);
  grad.addColorStop(0.515, preset.ground);
  grad.addColorStop(1.0, '#1e2420');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Horizon atmospheric glow band
  const hBand = ctx.createLinearGradient(0, height * 0.41, 0, height * 0.56);
  hBand.addColorStop(0, 'rgba(255,255,255,0)');
  hBand.addColorStop(0.55, preset.stars ? 'rgba(56, 102, 170, 0.28)' : 'rgba(255, 245, 224, 0.42)');
  hBand.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hBand;
  ctx.fillRect(0, height * 0.41, width, height * 0.15);

  // Soft volumetric cirrus/cumulus cloud streaks in upper hemisphere
  if (preset.cloudAlpha > 0) {
    ctx.save();
    for (let i = 0; i < 42; i++) {
      const seed = i * 97.31;
      const cx = ((Math.sin(seed) * 0.5 + 0.5) * width) % width;
      const cy = height * (0.14 + ((Math.cos(seed * 1.7) * 0.5 + 0.5) * 0.3));
      const rx = 45 + (i % 7) * 26;
      const ry = 8 + (i % 4) * 5;
      const g = ctx.createRadialGradient(cx, cy, ry * 0.15, cx, cy, rx);
      g.addColorStop(0, preset.cloudTint);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = preset.cloudAlpha * (0.45 + (i % 5) * 0.12);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Stars at night
  if (preset.stars) {
    ctx.save();
    for (let i = 0; i < 240; i++) {
      const sx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * width;
      const sy = ((Math.sin(i * 78.233) * 19341.123) % 1 + 1) % 1 * height * 0.44;
      const r = i % 9 === 0 ? 1.6 : 0.9;
      ctx.fillStyle = i % 7 === 0 ? 'rgba(186, 222, 255, 0.9)' : 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(sx, sy, r, r);
    }
    ctx.restore();
  }

  // Sun / Moon HDR hotspot (creates crisp specular reflections on car paint & glass!)
  const sunX = preset.sunU * width;
  const sunY = preset.sunV * height;
  const halo = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, preset.sunRadius * 4.2);
  halo.addColorStop(0, preset.sunColor);
  halo.addColorStop(0.22, preset.sunGlow);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sunX, sunY, preset.sunRadius * 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = preset.sunColor;
  ctx.beginPath();
  ctx.arc(sunX, sunY, preset.sunRadius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Warm road/citylight reflection band on lower hemisphere for car side reflections
  const lowerReflect = ctx.createLinearGradient(0, height * 0.52, 0, height * 0.85);
  lowerReflect.addColorStop(0, preset.stars ? 'rgba(42, 60, 94, 0.45)' : 'rgba(218, 210, 195, 0.25)');
  lowerReflect.addColorStop(1, 'rgba(20, 26, 22, 0.0)');
  ctx.fillStyle = lowerReflect;
  ctx.fillRect(0, height * 0.52, width, height * 0.33);

  return canvas;
}

export class HdrEnvironmentController {
  private readonly app: pc.Application;
  private readonly isMobile: boolean;
  private readonly cache = new Map<TimeOfDay, CachedHdrEnv>();
  public readonly sunLight: pc.Entity;
  public readonly fillLight: pc.Entity;

  constructor(app: pc.Application, isMobile: boolean) {
    this.app = app;
    this.isMobile = isMobile;

    this.sunLight = new pc.Entity('HdrSunLight');
    this.sunLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.96, 0.88),
      intensity: 2.35,
      castShadows: true,
      shadowDistance: isMobile ? 75 : 135,
      shadowResolution: isMobile ? 1024 : 2048,
      shadowBias: 0.28,
      normalOffsetBias: 0.04,
      shadowType: pc.SHADOW_PCF3_32F,
    });
    this.sunLight.setLocalEulerAngles(48, 34, 0);
    app.root.addChild(this.sunLight);

    this.fillLight = new pc.Entity('HdrSkyFillLight');
    this.fillLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.58, 0.78, 1.0),
      intensity: 0.55,
      castShadows: false,
    });
    this.fillLight.setLocalEulerAngles(135, -140, 0);
    app.root.addChild(this.fillLight);

    this.apply('day');
  }

  private getOrCreateEnv(mode: TimeOfDay): CachedHdrEnv | null {
    const existing = this.cache.get(mode);
    if (existing) return existing;

    try {
      const preset = ENV_PRESETS[mode];
      const w = this.isMobile ? 512 : 1024;
      const h = this.isMobile ? 256 : 512;
      const canvas = buildEquirectSkyCanvas(preset, w, h);

      const sourceTex = new pc.Texture(this.app.graphicsDevice, {
        width: w,
        height: h,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        projection: pc.TEXTUREPROJECTION_EQUIRECT,
      });
      sourceTex.setSource(canvas);

      const lightingSource = pc.EnvLighting.generateLightingSource(sourceTex, {
        size: this.isMobile ? 64 : 128,
      });
      const envAtlas = pc.EnvLighting.generateAtlas(lightingSource, {
        size: this.isMobile ? 256 : 512,
        numReflectionSamples: this.isMobile ? 256 : 512,
        numAmbientSamples: this.isMobile ? 512 : 1024,
      });
      const skybox = pc.EnvLighting.generateSkyboxCubemap(sourceTex, this.isMobile ? 256 : 512);
      lightingSource.destroy();

      const bundle: CachedHdrEnv = { envAtlas, skybox, sourceTex };
      this.cache.set(mode, bundle);
      return bundle;
    } catch (err) {
      console.warn('[HdrEnv] Falling back to clearColor sky:', err);
      return null;
    }
  }

  public apply(mode: TimeOfDay, camera?: pc.CameraComponent | null): void {
    const preset = ENV_PRESETS[mode];
    const scene = this.app.scene;

    scene.exposure = preset.exposure;
    scene.skyboxIntensity = preset.skyboxIntensity;
    scene.ambientLight.set(preset.ambient[0], preset.ambient[1], preset.ambient[2]);
    scene.fog.type = pc.FOG_LINEAR;
    scene.fog.color.set(preset.fogColor[0], preset.fogColor[1], preset.fogColor[2]);
    scene.fog.start = preset.fogStart;
    scene.fog.end = preset.fogEnd;

    if (this.sunLight.light) {
      this.sunLight.light.color = new pc.Color(
        preset.sunLightColor[0],
        preset.sunLightColor[1],
        preset.sunLightColor[2]
      );
      this.sunLight.light.intensity = preset.sunLightIntensity;
    }
    this.sunLight.setLocalEulerAngles(preset.sunEuler[0], preset.sunEuler[1], preset.sunEuler[2]);

    if (this.fillLight.light) {
      this.fillLight.light.color = new pc.Color(
        preset.fillColor[0],
        preset.fillColor[1],
        preset.fillColor[2]
      );
      this.fillLight.light.intensity = preset.fillIntensity;
    }

    const env = this.getOrCreateEnv(mode);
    if (env) {
      scene.envAtlas = env.envAtlas;
      scene.skybox = env.skybox;
      scene.skyboxMip = 0;
    }

    if (camera) {
      camera.clearColor = new pc.Color(preset.clearColor[0], preset.clearColor[1], preset.clearColor[2]);
    }
  }
}
