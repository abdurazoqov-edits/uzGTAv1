import * as pc from 'playcanvas';
import {
  applyBoneCharAngles,
  buildRealisticHumanEntity,
  computeFreshEntityBounds,
  HumanoidRig,
  instantiateNormalizedHumanGlb,
} from './character';

const DRIVER_OUTFITS: Array<{
  top: [number, number, number];
  bottom: [number, number, number];
  shoes: [number, number, number];
  hair: [number, number, number];
}> = [
  { top: [0.88, 0.92, 0.98], bottom: [0.32, 0.40, 0.56], shoes: [0.95, 0.95, 0.96], hair: [0.22, 0.18, 0.14] },
  { top: [0.26, 0.30, 0.38], bottom: [0.28, 0.32, 0.40], shoes: [0.94, 0.94, 0.96], hair: [0.12, 0.10, 0.09] },
  { top: [0.34, 0.64, 0.48], bottom: [0.56, 0.50, 0.42], shoes: [0.92, 0.90, 0.86], hair: [0.38, 0.28, 0.18] },
];

/**
 * Seats a realistic driver STRICTLY INSIDE the car cabin behind the windshield!
 */
export function createSeatedDriverEntity(
  app: pc.Application,
  seed: number,
  carWidth: number,
  carHeight: number,
  carLength: number,
  carName: string,
  rpmContainer?: pc.ContainerResource | null
): pc.Entity {
  const tint = DRIVER_OUTFITS[seed % DRIVER_OUTFITS.length];
  const holder = new pc.Entity(`TrafficDriver_${seed}`);
  const driverScaleHeight = Math.max(1.20, Math.min(1.44, carHeight * 0.84));

  let modelEntity: pc.Entity;
  let rig: HumanoidRig;

  if (rpmContainer) {
    const built = instantiateNormalizedHumanGlb(app, rpmContainer, driverScaleHeight, false, tint);
    modelEntity = built.wrapper;
    rig = built.rig;
  } else {
    const fallback = buildRealisticHumanEntity(
      {
        skin: [0.85, 0.67, 0.54],
        hair: tint.hair,
        jacket: tint.top,
        shirt: [0.94, 0.95, 0.96],
        pants: tint.bottom,
        shoes: tint.shoes,
        heightScale: driverScaleHeight / 1.76,
      },
      false
    );
    modelEntity = fallback.entity;
    rig = fallback.rig;
  }

  applyBoneCharAngles(rig.leftUpLeg, 88, 0, 0);
  applyBoneCharAngles(rig.rightUpLeg, 88, 0, 0);
  applyBoneCharAngles(rig.leftLeg, -88, 0, 0);
  applyBoneCharAngles(rig.rightLeg, -88, 0, 0);
  applyBoneCharAngles(rig.leftArm, 56, -10, rig.leftArmDropDeg);
  applyBoneCharAngles(rig.rightArm, 56, 10, -rig.rightArmDropDeg);
  applyBoneCharAngles(rig.leftForeArm, 24, 0, 0);
  applyBoneCharAngles(rig.rightForeArm, 24, 0, 0);
  applyBoneCharAngles(rig.spine, -6, 0, 0);

  app.root.addChild(modelEntity);
  modelEntity.getWorldTransform();
  let headTopY = driverScaleHeight;
  if (rig.head) {
    headTopY = rig.head.node.getPosition().y + 0.22 * (driverScaleHeight / 1.76);
  } else {
    const b = computeFreshEntityBounds(modelEntity);
    if (b) {
      const top = b.center.y + b.halfExtents.y;
      if (top > 0.4) headTopY = top;
    }
  }
  app.root.removeChild(modelEntity);

  const isVan = /damas/i.test(carName);
  const desiredHeadTopY = Math.max(0.90, carHeight * (isVan ? 0.76 : 0.72));
  const seatX = -Math.min(0.40, carWidth * 0.21);
  const seatY = desiredHeadTopY - headTopY;
  const seatZ = isVan ? -carLength * 0.20 : 0.04;

  holder.setLocalPosition(seatX, seatY, seatZ);
  holder.addChild(modelEntity);
  return holder;
}
