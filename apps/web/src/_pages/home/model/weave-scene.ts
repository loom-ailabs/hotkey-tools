export const WEAVE_RIBBONS = 10;
export const WEAVE_SAMPLES = 56;

export type WeavePalette = Record<"primary" | "secondary" | "highlight" | "muted" | "glow", string>;
export type WeavePointer = { x: number; y: number; energy: number };
type WeavePoint = {
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  alpha: number;
  light: number;
  glyph: string | null;
};
export type WeaveScene = { width: number; height: number; ribbons: WeavePoint[][] };

/** Fixed topology keeps the field deterministic and avoids searching particle pairs per frame. */
export function createWeaveScene(width: number, height: number): WeaveScene {
  const ribbons = Array.from({ length: WEAVE_RIBBONS }, (_, ribbon) => {
    const lower = ribbon >= WEAVE_RIBBONS / 2;
    const offset = ((ribbon % 5) - 2) * 0.027;
    return Array.from({ length: WEAVE_SAMPLES }, (_, sample) => {
      const t = sample / (WEAVE_SAMPLES - 1);
      const x = (t * 1.18 - 0.09) * width;
      const wave = Math.sin(t * Math.PI * 1.45 + (lower ? 1.3 : -0.5));
      const y = ((lower ? 0.79 : 0.17) + wave * (lower ? 0.23 : 0.26) + offset) * height;
      const noise = ((sample * 37 + ribbon * 61) % 97) / 97;
      const edge = Math.min(1, Math.abs(t - 0.5) * 2.2 + 0.08);
      return {
        x,
        y,
        drawX: x,
        drawY: y,
        alpha: (0.18 + noise * 0.36) * edge,
        light: 0,
        glyph: sample % 4 === 0 ? String((sample * 7 + ribbon * 3) % 10) : null,
      };
    });
  });
  return { width, height, ribbons };
}

/** At most 560 glyph/dot fills and 20 batched thread strokes; no React or DOM work. */
export function paintWeave(
  context: CanvasRenderingContext2D,
  scene: WeaveScene,
  pointer: WeavePointer,
  palette: WeavePalette,
) {
  context.clearRect(0, 0, scene.width, scene.height);
  context.font = `${Math.max(9, Math.min(11, scene.width / 110))}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const radius = Math.min(190, Math.max(110, scene.width * 0.16));

  scene.ribbons.forEach((ribbon, index) => {
    ribbon.forEach((point) => {
      const dx = point.x - pointer.x;
      const dy = point.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / radius) ** 2 * pointer.energy;
      point.drawX = point.x + (dx / Math.max(1, distance)) * influence * 20;
      point.drawY = point.y + (dy / Math.max(1, distance)) * influence * 15;
      point.light = influence;
    });

    context.strokeStyle = index < WEAVE_RIBBONS / 2 ? palette.primary : palette.secondary;
    context.lineWidth = 0.65;
    context.globalAlpha = 0.11;
    context.beginPath();
    ribbon.forEach((point, sample) => {
      if (sample === 0) context.moveTo(point.drawX, point.drawY);
      else context.lineTo(point.drawX, point.drawY);
    });
    context.stroke();

    context.strokeStyle = pointer.energy > 0 ? palette.glow : palette.muted;
    context.globalAlpha = 0.28;
    context.beginPath();
    ribbon.forEach((point, sample) => {
      const next = ribbon[sample + 1];
      if (sample % 8 !== 2 || !next) return;
      context.moveTo(point.drawX, point.drawY);
      context.lineTo(
        point.drawX + (next.drawX - point.drawX) * 0.45,
        point.drawY + (next.drawY - point.drawY) * 0.45,
      );
    });
    context.stroke();

    ribbon.forEach((point) => {
      context.fillStyle =
        point.light > 0.08 ? palette.highlight : index % 2 ? palette.primary : palette.secondary;
      context.globalAlpha = Math.min(0.85, point.alpha + point.light * 0.55);
      if (point.glyph) context.fillText(point.glyph, point.drawX, point.drawY);
      else context.fillRect(point.drawX, point.drawY, 0.9, 0.9);
    });
  });
  context.globalAlpha = 1;
}
