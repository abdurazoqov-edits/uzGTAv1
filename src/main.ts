import './styles.css';
import { ControlState, HudTelemetry, PlayCanvasCarGame } from './playcanvas/engine';
import { LicensePlateConfig, PlateStyle } from './playcanvas/licensePlate';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

const preloaderEl = document.getElementById('preloader')!;
const preloaderStatusEl = document.getElementById('preloader-status')!;
const preloaderFillEl = document.getElementById('preloader-fill')!;
const contextLostEl = document.getElementById('context-lost')!;
const reloadBtn = document.getElementById('btn-reload-gl')!;

const modeDotEl = document.getElementById('hud-mode-dot')!;
const carNameEl = document.getElementById('hud-car-name')!;
const checkpointsEl = document.getElementById('hud-checkpoints')!;
const plateShortEl = document.getElementById('hud-plate-short')!;
const speedValEl = document.getElementById('speed-val')!;
const gearEl = document.getElementById('speed-gear')!;
const rpmFillEl = document.getElementById('rpm-fill')!;
const nitroFillEl = document.getElementById('nitro-fill')!;

const btnGarage = document.getElementById('btn-garage')!;
const btnPlateQuick = document.getElementById('btn-plate-quick')!;
const btnCamera = document.getElementById('btn-camera')!;
const btnTime = document.getElementById('btn-time')!;
const btnSound = document.getElementById('btn-sound')!;
const btnReset = document.getElementById('btn-reset')!;

const btnEnterExit = document.getElementById('btn-enter-exit')!;
const enterExitLabel = document.getElementById('enter-exit-label')!;
const carSteerPad = document.getElementById('car-steer-pad')!;
const footJoyBase = document.getElementById('foot-joy-base')!;
const footJoyKnob = document.getElementById('foot-joy-knob')!;
const carOnlyEls = Array.from(document.querySelectorAll('.car-only'));
const footOnlyEls = Array.from(document.querySelectorAll('.foot-only'));

// Drawer & Tabs
const garageBackdrop = document.getElementById('garage-backdrop')!;
const garageClose = document.getElementById('garage-close')!;
const garageList = document.getElementById('garage-list')!;
const tabBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
const tabPanes: Record<string, HTMLElement> = {
  cars: document.getElementById('tab-cars')!,
  plate: document.getElementById('tab-plate')!,
  world: document.getElementById('tab-world')!,
};

// File Inputs
const btnImportGlb = document.getElementById('btn-import-glb')!;
const fileInputGlb = document.getElementById('file-input-glb') as HTMLInputElement;
const btnWalkMode = document.getElementById('btn-walk-mode')!;
const btnFlipChar = document.getElementById('btn-flip-char')!;
const btnImportChar = document.getElementById('btn-import-char')!;
const fileInputChar = document.getElementById('file-input-char') as HTMLInputElement;
const btnImportTashkent = document.getElementById('btn-import-tashkent')!;
const fileInputTashkent = document.getElementById('file-input-tashkent') as HTMLInputElement;
const charStatusEl = document.getElementById('char-status')!;
const tashkentStatusEl = document.getElementById('tashkent-status')!;

// License Plate Controls
const platePreviewEl = document.getElementById('plate-preview')!;
const platePrevRegion = document.getElementById('plate-prev-region')!;
const platePrevText = document.getElementById('plate-prev-text')!;
const plateRegionInput = document.getElementById('plate-region') as HTMLInputElement;
const plateTextInput = document.getElementById('plate-text') as HTMLInputElement;
const plateEnabledInput = document.getElementById('plate-enabled') as HTMLInputElement;
const plateFrontY = document.getElementById('plate-front-y') as HTMLInputElement;
const plateFrontZ = document.getElementById('plate-front-z') as HTMLInputElement;
const plateRearY = document.getElementById('plate-rear-y') as HTMLInputElement;
const plateRearZ = document.getElementById('plate-rear-z') as HTMLInputElement;
const plateScale = document.getElementById('plate-scale') as HTMLInputElement;
const valFrontY = document.getElementById('val-front-y')!;
const valFrontZ = document.getElementById('val-front-z')!;
const valRearY = document.getElementById('val-rear-y')!;
const valRearZ = document.getElementById('val-rear-z')!;
const valPlateScale = document.getElementById('val-plate-scale')!;
const stylePills = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-plate-style]'));

let lastCarsSignature = '';
let lastSyncedPlateCarId = '';

function openDrawer(tab: 'cars' | 'plate' | 'world'): void {
  garageBackdrop.classList.remove('hidden');
  for (const b of tabBtns) {
    b.classList.toggle('active', b.dataset.tab === tab);
  }
  for (const [key, pane] of Object.entries(tabPanes)) {
    pane.classList.toggle('hidden', key !== tab);
  }
}

for (const b of tabBtns) {
  b.addEventListener('click', () => {
    const t = b.dataset.tab as 'cars' | 'plate' | 'world';
    if (t) openDrawer(t);
  });
}

function syncPlateEditorFromConfig(cfg: LicensePlateConfig): void {
  platePreviewEl.className = `uz-plate-live style-${cfg.style}`;
  platePrevRegion.textContent = (cfg.region || '01').toUpperCase();
  platePrevText.textContent = (cfg.text || 'A 777 AA').toUpperCase();
  plateShortEl.textContent = `${cfg.region} ${cfg.text}`.trim();

  if (document.activeElement !== plateRegionInput) plateRegionInput.value = cfg.region;
  if (document.activeElement !== plateTextInput) plateTextInput.value = cfg.text;
  plateEnabledInput.checked = cfg.enabled;

  plateFrontY.value = cfg.frontY.toFixed(2);
  plateFrontZ.value = cfg.frontZ.toFixed(2);
  plateRearY.value = cfg.rearY.toFixed(2);
  plateRearZ.value = cfg.rearZ.toFixed(2);
  plateScale.value = cfg.scale.toFixed(2);

  valFrontY.textContent = cfg.frontY.toFixed(2);
  valFrontZ.textContent = cfg.frontZ.toFixed(2);
  valRearY.textContent = cfg.rearY.toFixed(2);
  valRearZ.textContent = cfg.rearZ.toFixed(2);
  valPlateScale.textContent = `${Math.round(cfg.scale * 100)}%`;

  for (const p of stylePills) {
    p.classList.toggle('active', p.dataset.plateStyle === cfg.style);
  }
}

function renderGarageList(t: HudTelemetry, game: PlayCanvasCarGame): void {
  const sig = `${t.activeCarId}|${t.cars.map((c) => `${c.id}:${c.flip180}:${c.scaleMul}:${c.wheelCount}`).join(',')}`;
  if (sig === lastCarsSignature) return;
  lastCarsSignature = sig;

  garageList.innerHTML = '';
  for (const car of t.cars) {
    const isActive = car.id === t.activeCarId;
    const row = document.createElement('div');
    row.className = `car-row${isActive ? ' active' : ''}`;

    const sourceLabel =
      car.source === 'models' ? 'models/*.glb' : car.source === 'local' ? 'Local .glb' : 'Built-in 3D';
    const wheelTag = car.wheelCount > 0 ? `${car.wheelCount} wheels` : 'rigid';

    row.innerHTML = `
      <div class="car-row-top">
        <div>
          <div class="car-row-name">${car.name}</div>
          <div class="car-row-meta">${sourceLabel} · ${wheelTag} · ${Math.round(car.scaleMul * 100)}%${car.flip180 ? ' · 180°' : ''}</div>
        </div>
        <button type="button" class="car-mini-btn drive">${isActive ? 'Driving' : 'Drive'}</button>
      </div>
      <div class="car-row-actions">
        <button type="button" class="car-mini-btn" data-act="flip">Flip 180°</button>
        <button type="button" class="car-mini-btn" data-act="scale-down">Size −</button>
        <button type="button" class="car-mini-btn" data-act="scale-up">Size +</button>
      </div>
    `;

    row.querySelector('.drive')?.addEventListener('click', () => {
      game.selectCar(car.id);
      garageBackdrop.classList.add('hidden');
    });
    row.querySelector('[data-act="flip"]')?.addEventListener('click', () => game.flipCar(car.id));
    row.querySelector('[data-act="scale-down"]')?.addEventListener('click', () => game.scaleCar(car.id, -0.1));
    row.querySelector('[data-act="scale-up"]')?.addEventListener('click', () => game.scaleCar(car.id, 0.1));

    garageList.appendChild(row);
  }
}

function syncHud(t: HudTelemetry, game: PlayCanvasCarGame): void {
  const isFoot = t.playerMode === 'foot';
  modeDotEl.classList.toggle('foot', isFoot);
  carNameEl.textContent = isFoot ? t.characterLabel : t.activeCarName;
  checkpointsEl.textContent = `${t.checkpointsCollected}/${t.checkpointsTotal}`;
  speedValEl.textContent = String(t.speedKmh);
  gearEl.textContent = t.gear;
  rpmFillEl.style.width = `${Math.round(t.rpmNorm * 100)}%`;
  nitroFillEl.style.width = `${t.nitroPct}%`;

  const camLabels = { chase: 'Chase', hood: 'Hood', orbit: 'Orbit' } as const;
  const timeLabels = { day: 'Day', sunset: 'Sunset', night: 'Night' } as const;
  btnCamera.textContent = camLabels[t.cameraMode];
  btnTime.textContent = timeLabels[t.timeOfDay];
  btnSound.style.opacity = t.muted ? '0.45' : '1';

  // Toggle Car vs On-Foot transparent controls
  carSteerPad.classList.toggle('hidden', isFoot);
  footJoyBase.classList.toggle('hidden', !isFoot);
  for (const el of carOnlyEls) el.classList.toggle('hidden', isFoot);
  for (const el of footOnlyEls) el.classList.toggle('hidden', !isFoot);

  if (isFoot) {
    if (t.nearbyCarName) {
      enterExitLabel.textContent = 'ENTER';
      btnEnterExit.classList.add('pulse');
    } else {
      enterExitLabel.textContent = 'CAR';
      btnEnterExit.classList.remove('pulse');
    }
  } else {
    enterExitLabel.textContent = 'EXIT';
    btnEnterExit.classList.remove('pulse');
  }

  // World & Character status
  charStatusEl.textContent = t.isCustomCharacter
    ? `Loaded: ${t.characterLabel}`
    : 'Articulated Character (drop models/character.glb or Load below)';
  tashkentStatusEl.textContent = t.isCustomTashkent
    ? 'Loaded: tashkent.glb · Central Plaza (0, 29)'
    : 'Architectural Tower · Central Plaza (drop models/tashkent.glb or Load below)';

  // Sync license plate UI when active car changes
  const activeCar = t.cars.find((c) => c.id === t.activeCarId);
  if (activeCar && activeCar.id !== lastSyncedPlateCarId) {
    lastSyncedPlateCarId = activeCar.id;
    syncPlateEditorFromConfig(activeCar.plate);
  } else if (activeCar) {
    plateShortEl.textContent = `${activeCar.plate.region} ${activeCar.plate.text}`.trim();
  }

  renderGarageList(t, game);
}

const game = new PlayCanvasCarGame(canvas, {
  onLoadProgress(label, pct) {
    preloaderStatusEl.textContent = label;
    preloaderFillEl.style.width = `${Math.max(8, Math.min(100, pct))}%`;
  },
  onReady(telemetry) {
    syncHud(telemetry, game);
    preloaderEl.classList.add('hidden');
  },
  onTelemetry(telemetry) {
    syncHud(telemetry, game);
  },
  onContextLost(lost) {
    contextLostEl.classList.toggle('hidden', !lost);
  },
});

reloadBtn.addEventListener('click', () => window.location.reload());

// Top Bar Handlers
btnGarage.addEventListener('click', () => {
  game.audio.unlock();
  if (garageBackdrop.classList.contains('hidden')) openDrawer('cars');
  else garageBackdrop.classList.add('hidden');
});
btnPlateQuick.addEventListener('click', () => {
  game.audio.unlock();
  openDrawer('plate');
});
garageClose.addEventListener('click', () => garageBackdrop.classList.add('hidden'));
garageBackdrop.addEventListener('click', (e) => {
  if (e.target === garageBackdrop) garageBackdrop.classList.add('hidden');
});

btnCamera.addEventListener('click', () => game.cycleCamera());
btnTime.addEventListener('click', () => game.cycleTimeOfDay());
btnSound.addEventListener('click', () => game.toggleMute());
btnReset.addEventListener('click', () => game.resetActiveCar());

// GTA Enter / Exit Car Button
btnEnterExit.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.toggleEnterExitCar();
});

// License Plate Real-Time Editing
function pushPlateUpdate(patch: Partial<LicensePlateConfig>): void {
  game.updateActiveCarPlate(patch);
  const car = game.fleet.getActiveCar();
  if (car) syncPlateEditorFromConfig(car.plateRig.config);
}

plateRegionInput.addEventListener('input', () => {
  const cleaned = plateRegionInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 2);
  pushPlateUpdate({ region: cleaned || '01' });
});
plateTextInput.addEventListener('input', () => {
  const cleaned = plateTextInput.value.toUpperCase().slice(0, 10);
  pushPlateUpdate({ text: cleaned || 'A 777 AA' });
});
plateEnabledInput.addEventListener('change', () => {
  pushPlateUpdate({ enabled: plateEnabledInput.checked });
});
for (const p of stylePills) {
  p.addEventListener('click', () => {
    const st = (p.dataset.plateStyle as PlateStyle) || 'white';
    pushPlateUpdate({ style: st });
  });
}
plateFrontY.addEventListener('input', () => pushPlateUpdate({ frontY: Number(plateFrontY.value) }));
plateFrontZ.addEventListener('input', () => pushPlateUpdate({ frontZ: Number(plateFrontZ.value) }));
plateRearY.addEventListener('input', () => pushPlateUpdate({ rearY: Number(plateRearY.value) }));
plateRearZ.addEventListener('input', () => pushPlateUpdate({ rearZ: Number(plateRearZ.value) }));
plateScale.addEventListener('input', () => pushPlateUpdate({ scale: Number(plateScale.value) }));

// Runtime Local GLB Loaders (Car, character.glb, tashkent.glb)
btnImportGlb.addEventListener('click', () => fileInputGlb.click());
fileInputGlb.addEventListener('change', async () => {
  const file = fileInputGlb.files?.[0];
  fileInputGlb.value = '';
  if (!file) return;
  btnImportGlb.textContent = `Loading ${file.name}…`;
  try {
    await game.importLocalGlb(file);
    garageBackdrop.classList.add('hidden');
  } catch (err) {
    console.warn('Local car GLB import failed:', err);
  } finally {
    btnImportGlb.textContent = '+ Load local .glb car';
  }
});

btnWalkMode.addEventListener('click', () => {
  game.switchToFootMode();
  garageBackdrop.classList.add('hidden');
});
btnFlipChar.addEventListener('click', () => game.flipCharacter());
btnImportChar.addEventListener('click', () => fileInputChar.click());
fileInputChar.addEventListener('change', async () => {
  const file = fileInputChar.files?.[0];
  fileInputChar.value = '';
  if (!file) return;
  btnImportChar.textContent = 'Loading…';
  try {
    await game.importCharacterGlb(file);
    garageBackdrop.classList.add('hidden');
  } finally {
    btnImportChar.textContent = '+ Load character.glb';
  }
});

btnImportTashkent.addEventListener('click', () => fileInputTashkent.click());
fileInputTashkent.addEventListener('change', async () => {
  const file = fileInputTashkent.files?.[0];
  fileInputTashkent.value = '';
  if (!file) return;
  btnImportTashkent.textContent = 'Loading…';
  try {
    await game.importTashkentGlb(file);
    garageBackdrop.classList.add('hidden');
  } finally {
    btnImportTashkent.textContent = '+ Load tashkent.glb';
  }
});

// Multi-Touch Hold Controls (Steering, Pedals, Drift, Nitro, Sprint)
function bindHoldControl(elId: string, control: Exclude<keyof ControlState, 'joyX' | 'joyY'>): void {
  const el = document.getElementById(elId);
  if (!el) return;
  const activePointers = new Set<number>();

  const updateState = () => {
    const on = activePointers.size > 0;
    el.classList.toggle('active', on);
    game.setControl(control, on);
  };

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    activePointers.add(e.pointerId);
    updateState();
  });

  const release = (e: PointerEvent) => {
    if (activePointers.delete(e.pointerId)) updateState();
  };

  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
}

bindHoldControl('touch-left', 'left');
bindHoldControl('touch-right', 'right');
bindHoldControl('touch-gas', 'gas');
bindHoldControl('touch-brake', 'brake');
bindHoldControl('touch-drift', 'drift');
bindHoldControl('touch-nitro', 'nitro');
bindHoldControl('touch-sprint', 'sprint');

document.getElementById('touch-horn')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  game.triggerHorn();
});

// On-Foot Virtual Analog Thumbstick
(() => {
  let joyPointerId: number | null = null;
  const maxR = 42;

  const updateJoy = (clientX: number, clientY: number) => {
    const rect = footJoyBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    footJoyKnob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    game.setJoystick(dx / maxR, -dy / maxR);
  };

  const resetJoy = () => {
    joyPointerId = null;
    footJoyKnob.style.transform = 'translate3d(0, 0, 0)';
    game.setJoystick(0, 0);
  };

  footJoyBase.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    joyPointerId = e.pointerId;
    try {
      footJoyBase.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    updateJoy(e.clientX, e.clientY);
  });

  footJoyBase.addEventListener('pointermove', (e) => {
    if (joyPointerId !== e.pointerId) return;
    e.preventDefault();
    updateJoy(e.clientX, e.clientY);
  });

  const endJoy = (e: PointerEvent) => {
    if (joyPointerId === e.pointerId) resetJoy();
  };
  footJoyBase.addEventListener('pointerup', endJoy);
  footJoyBase.addEventListener('pointercancel', endJoy);
  footJoyBase.addEventListener('lostpointercapture', endJoy);
})();

game.init().catch((err) => {
  console.error('[PlayCanvasCarGame] Init failed:', err);
  preloaderStatusEl.textContent = 'Failed to initialize 3D engine';
});
