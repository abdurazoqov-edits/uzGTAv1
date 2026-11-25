import * as pc from 'playcanvas';

export type PlateStyle = 'white' | 'vip' | 'taxi';

export interface LicensePlateConfig {
  enabled: boolean;
  region: string; // e.g. "01", "10", "30", "70"
  text: string;   // e.g. "A 777 AA"
  style: PlateStyle;
  frontY: number;
  frontZ: number;
  rearY: number;
  rearZ: number;
  scale: number;
}

export interface PlateMountPreset {
  frontY: number;
  frontZ: number;
  rearY: number;
  rearZ: number;
  scale: number;
}

const STORAGE_PREFIX = 'pc_uz_plate_v2_';

export function getDefaultPlatePreset(carName: string, carLength: number): PlateMountPreset {
  const halfLen = carLength * 0.5;
  const lower = carName.toLowerCase();
  if (/cobalt/i.test(lower)) {
    return {
      frontY: 0.42,
      frontZ: -halfLen - 0.015,
      rearY: 0.72,
      rearZ: halfLen + 0.015,
      scale: 1.0,
    };
  }
  if (/damas/i.test(lower)) {
    return {
      frontY: 0.44,
      frontZ: -halfLen - 0.02,
      rearY: 0.54,
      rearZ: halfLen + 0.02,
      scale: 0.94,
    };
  }
  return {
    frontY: 0.44,
    frontZ: -halfLen - 0.02,
    rearY: 0.62,
    rearZ: halfLen + 0.02,
    scale: 1.0,
  };
}

export function loadSavedPlateConfig(carKey: string, carName: string, carLength: number): LicensePlateConfig {
  const preset = getDefaultPlatePreset(carName, carLength);
  const fallback: LicensePlateConfig = {
    enabled: true,
    region: '01',
    text: 'A 777 AA',
    style: 'white',
    ...preset,
  };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + carKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled,
      region: typeof parsed.region === 'string' ? parsed.region.slice(0, 2) : fallback.region,
      text: typeof parsed.text === 'string' ? parsed.text.slice(0, 10) : fallback.text,
      style: parsed.style === 'vip' || parsed.style === 'taxi' ? parsed.style : 'white',
      frontY: Number.isFinite(parsed.frontY) ? parsed.frontY : fallback.frontY,
      frontZ: Number.isFinite(parsed.frontZ) ? parsed.frontZ : fallback.frontZ,
      rearY: Number.isFinite(parsed.rearY) ? parsed.rearY : fallback.rearY,
      rearZ: Number.isFinite(parsed.rearZ) ? parsed.rearZ : fallback.rearZ,
      scale: Number.isFinite(parsed.scale) ? parsed.scale : fallback.scale,
    };
  } catch {
    return fallback;
  }
}

export function savePlateConfig(carKey: string, cfg: LicensePlateConfig): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + carKey, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Renders an ultra-sharp 1024x256 Uzbekistan license plate canvas (never blurry, high contrast).
 */
function renderUzPlateCanvas(cfg: LicensePlateConfig): HTMLCanvasElement {
  const W = 1024;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const isVip = cfg.style === 'vip';
  const isTaxi = cfg.style === 'taxi';

  const bgTop = isVip ? '#161922' : isTaxi ? '#ffda38' : '#ffffff';
  const bgBot = isVip ? '#0d1016' : isTaxi ? '#f0be12' : '#f1f4f9';
  const ink = isVip ? '#f5cf6e' : '#0b0e14';
  const border = isVip ? '#e5be5e' : '#11151d';

  // Outer metallic backing
  ctx.fillStyle = '#181c24';
  ctx.fillRect(0, 0, W, H);

  // Rounded embossed plate face
  const pad = 10;
  const r = 20;
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(W - pad - r, pad);
  ctx.quadraticCurveTo(W - pad, pad, W - pad, pad + r);
  ctx.lineTo(W - pad, H - pad - r);
  ctx.quadraticCurveTo(W - pad, H - pad, W - pad - r, H - pad);
  ctx.lineTo(pad + r, H - pad);
  ctx.quadraticCurveTo(pad, H - pad, pad, H - pad - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();

  const bgGrad = ctx.createLinearGradient(0, pad, 0, H - pad);
  bgGrad.addColorStop(0, bgTop);
  bgGrad.addColorStop(1, bgBot);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Crisp inner border
  ctx.lineWidth = 10;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Left region divider line (Uzbekistan standard layout: [01 | A 777 AA | FLAG UZ])
  const divX = 212;
  ctx.fillStyle = border;
  ctx.fillRect(divX, pad + 6, 8, H - pad * 2 - 12);

  // Region digits ("01")
  const region = (cfg.region || '01').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 2) || '01';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 132px "Arial Black", "Roboto", system-ui, sans-serif';
  ctx.fillText(region, (pad + divX) * 0.5 + 2, H * 0.54);

  // Main plate characters ("A 777 AA")
  const mainText = (cfg.text || 'A 777 AA').toUpperCase().trim().slice(0, 10) || 'A 777 AA';
  const mainAreaLeft = divX + 18;
  const mainAreaRight = W - 148;
  const mainCenterX = (mainAreaLeft + mainAreaRight) * 0.5;
  const maxTextWidth = mainAreaRight - mainAreaLeft - 14;

  // Dynamic font size so even 9-10 char custom plates stay crisp without clipping
  let fontSize = 136;
  ctx.font = `900 ${fontSize}px "Arial Black", "Roboto", system-ui, sans-serif`;
  while (fontSize > 74 && ctx.measureText(mainText).width > maxTextWidth) {
    fontSize -= 6;
    ctx.font = `900 ${fontSize}px "Arial Black", "Roboto", system-ui, sans-serif`;
  }
  ctx.fillStyle = ink;
  ctx.fillText(mainText, mainCenterX, H * 0.54);

  // Right side: Uzbekistan Flag + "UZ" stamp
  const flagX = W - 134;
  const flagY = 44;
  const flagW = 94;
  const flagH = 56;

  // Blue stripe
  ctx.fillStyle = '#0099b5';
  ctx.fillRect(flagX, flagY, flagW, flagH * 0.31);
  // Top thin red fimbriation
  ctx.fillStyle = '#ce1126';
  ctx.fillRect(flagX, flagY + flagH * 0.31, flagW, flagH * 0.045);
  // White stripe
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(flagX, flagY + flagH * 0.355, flagW, flagH * 0.29);
  // Bottom thin red fimbriation
  ctx.fillStyle = '#ce1126';
  ctx.fillRect(flagX, flagY + flagH * 0.645, flagW, flagH * 0.045);
  // Green stripe
  ctx.fillStyle = '#1eb53a';
  ctx.fillRect(flagX, flagY + flagH * 0.69, flagW, flagH * 0.31);

  // Crescent & tiny stars on blue band
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(flagX + 14, flagY + 8.5, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0099b5';
  ctx.beginPath();
  ctx.arc(flagX + 16.4, flagY + 8.5, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let s = 0; s < 5; s++) {
    ctx.fillRect(flagX + 24 + s * 6, flagY + 5 + (s % 2) * 4, 2.4, 2.4);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.strokeRect(flagX, flagY, flagW, flagH);

  // "UZ" text below flag
  ctx.fillStyle = isVip ? '#f5cf6e' : '#0072bc';
  ctx.font = '900 54px "Arial Black", "Roboto", system-ui, sans-serif';
  ctx.fillText('UZ', flagX + flagW * 0.5, 166);

  // Subtle holographic security dot
  ctx.fillStyle = isVip ? 'rgba(245,207,110,0.45)' : 'rgba(120,145,175,0.35)';
  ctx.beginPath();
  ctx.arc(divX + 34, 42, 7, 0, Math.PI * 2);
  ctx.fill();

  // Mounting bolts
  for (const bx of [246, W - 168]) {
    ctx.fillStyle = isVip ? '#b6994d' : '#7a8494';
    ctx.beginPath();
    ctx.arc(bx, 34, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

export class CarLicensePlateRig {
  private readonly device: pc.GraphicsDevice;
  public readonly frontHolder: pc.Entity;
  public readonly rearHolder: pc.Entity;
  private texture: pc.Texture;
  private faceMat: pc.StandardMaterial;
  private frameMat: pc.StandardMaterial;
  public config: LicensePlateConfig;

  constructor(
    device: pc.GraphicsDevice,
    parentWrapper: pc.Entity,
    initialConfig: LicensePlateConfig
  ) {
    this.device = device;
    this.config = { ...initialConfig };

    this.texture = this.createPlateTexture(this.config);

    // High-clarity face material: mipmapped + anisotropic + subtle self-lit emissive so text is ALWAYS crisp!
    const fm = new pc.StandardMaterial();
    fm.diffuse.set(1, 1, 1);
    fm.diffuseMap = this.texture;
    fm.emissive.set(1, 1, 1);
    fm.emissiveMap = this.texture;
    fm.emissiveIntensity = 0.28;
    fm.useMetalness = true;
    fm.metalness = 0.08;
    fm.gloss = 0.55;
    fm.update();
    this.faceMat = fm;

    const bMat = new pc.StandardMaterial();
    bMat.diffuse.set(0.08, 0.09, 0.11);
    bMat.useMetalness = true;
    bMat.metalness = 0.5;
    bMat.gloss = 0.65;
    bMat.update();
    this.frameMat = bMat;

    this.frontHolder = this.buildPlateAssembly('LicensePlate_Front', true);
    this.rearHolder = this.buildPlateAssembly('LicensePlate_Rear', false);

    parentWrapper.addChild(this.frontHolder);
    parentWrapper.addChild(this.rearHolder);

    this.applyTransformAndVisibility();
  }

  private createPlateTexture(cfg: LicensePlateConfig): pc.Texture {
    const canvas = renderUzPlateCanvas(cfg);
    const maxAniso = Math.min(8, this.device.maxAnisotropy || 4);
    const tex = new pc.Texture(this.device, {
      width: canvas.width,
      height: canvas.height,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      anisotropy: maxAniso,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      srgb: true,
    });
    tex.setSource(canvas);
    return tex;
  }

  private buildPlateAssembly(name: string, isFront: boolean): pc.Entity {
    const holder = new pc.Entity(name);
    // Standard EU/UZ plate dimensions: 0.52m wide x 0.13m tall (4:1 exact ratio matching 1024x256!)
    const W = 0.52;
    const H = 0.13;

    // Backing bezel frame
    const bezel = new pc.Entity(`${name}_Bezel`);
    bezel.setLocalScale(W + 0.022, H + 0.018, 0.014);
    bezel.addComponent('render', {
      type: 'box',
      material: this.frameMat,
      castShadows: false,
      receiveShadows: true,
    });
    holder.addChild(bezel);

    // Crisp front-facing plane sitting cleanly 0.008m ahead of bezel (zero z-fighting!)
    const face = new pc.Entity(`${name}_Face`);
    if (isFront) {
      // Faces -Z (front of car): rotate plane (+Y normal) to face -Z -> (-90, 0, 180)
      face.setLocalPosition(0, 0, -0.009);
      face.setLocalEulerAngles(-90, 180, 0);
    } else {
      // Faces +Z (rear of car): rotate plane (+Y normal) to face +Z -> (90, 0, 0)
      face.setLocalPosition(0, 0, 0.009);
      face.setLocalEulerAngles(90, 0, 0);
    }
    face.setLocalScale(W, 1, H);
    face.addComponent('render', {
      type: 'plane',
      material: this.faceMat,
      castShadows: false,
      receiveShadows: false,
    });
    holder.addChild(face);

    return holder;
  }

  public updateConfig(next: Partial<LicensePlateConfig>): void {
    const texDirty =
      (next.region !== undefined && next.region !== this.config.region) ||
      (next.text !== undefined && next.text !== this.config.text) ||
      (next.style !== undefined && next.style !== this.config.style);

    this.config = { ...this.config, ...next };

    if (texDirty) {
      const oldTex = this.texture;
      this.texture = this.createPlateTexture(this.config);
      this.faceMat.diffuseMap = this.texture;
      this.faceMat.emissiveMap = this.texture;
      this.faceMat.update();
      oldTex.destroy();
    }

    this.applyTransformAndVisibility();
  }

  public applyTransformAndVisibility(): void {
    const s = Math.max(0.55, Math.min(1.65, this.config.scale));
    this.frontHolder.enabled = this.config.enabled;
    this.rearHolder.enabled = this.config.enabled;

    this.frontHolder.setLocalPosition(0, this.config.frontY, this.config.frontZ);
    this.frontHolder.setLocalScale(s, s, s);

    this.rearHolder.setLocalPosition(0, this.config.rearY, this.config.rearZ);
    this.rearHolder.setLocalScale(s, s, s);
  }
}
