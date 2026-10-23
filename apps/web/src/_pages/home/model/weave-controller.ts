import {
  createWeaveScene,
  paintWeave,
  type WeavePalette,
  type WeavePointer,
  type WeaveScene,
} from "./weave-scene";

export const WEAVE_MAX_DPR = 1.5;
export const WEAVE_FRAME_MS = 1_000 / 30;
export const WEAVE_IDLE_MS = 1_000;
const MAX_BACKING_PIXELS = 2_000_000;

type WeaveState = "fallback" | "static" | "idle" | "active" | "paused";

/** Mount only from an effect. The decoration never owns navigation, focus or account state. */
export function mountIntelligenceWeave(root: HTMLElement, canvas: HTMLCanvasElement) {
  const view = root.ownerDocument.defaultView;
  const hero = root.closest<HTMLElement>("[data-loom-hero]");
  if (!view || !hero) return () => {};
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return () => {};
  }
  if (!context) return () => {};

  const document = root.ownerDocument;
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = view.matchMedia("(hover: hover) and (pointer: fine)");
  const forcedColors = view.matchMedia("(forced-colors: active)");
  let disposed = false;
  let failed = false;
  let contextLost = false;
  let intersecting = true;
  let scene: WeaveScene | undefined;
  let palette: WeavePalette;
  let rect: DOMRect | undefined;
  let frame: number | undefined;
  let previousFrame = -Infinity;
  let previousStep = 0;
  let lastMove = 0;
  const pointer: WeavePointer = { x: 0, y: 0, energy: 0 };
  const target = { x: 0, y: 0 };

  const state = (next: WeaveState) => {
    root.dataset.weaveState = next;
  };
  const cancel = () => {
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const visible = () => !document.hidden && intersecting && !forcedColors.matches;
  const interactive = () => finePointer.matches && !motion.matches;
  const fallback = () => {
    cancel();
    pointer.energy = 0;
    canvas.hidden = true;
    root.dataset.weaveDrawn = "false";
    state("fallback");
  };
  const readPalette = () => {
    const style = view.getComputedStyle(canvas);
    const color = (name: string) =>
      style.getPropertyValue(`--hero-canvas-${name}`).trim() || style.color;
    return {
      primary: color("primary"),
      secondary: color("secondary"),
      highlight: color("highlight"),
      muted: color("muted"),
      glow: color("glow"),
    };
  };
  const paint = () => {
    if (!scene || failed || contextLost || disposed) return false;
    try {
      paintWeave(context, scene, pointer, palette);
      canvas.hidden = false;
      root.dataset.weaveDrawn = "true";
      return true;
    } catch {
      failed = true;
      fallback();
      return false;
    }
  };
  const settle = () => {
    cancel();
    pointer.energy = 0;
    if (failed || contextLost || disposed) return;
    if (!visible()) {
      state("paused");
      return;
    }
    if (paint()) state(interactive() ? "idle" : "static");
  };
  const resize = () => {
    if (failed || contextLost || disposed) return;
    const bounds = root.getBoundingClientRect();
    rect = bounds;
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const dpr = Math.min(
      WEAVE_MAX_DPR,
      Math.max(1, view.devicePixelRatio || 1),
      Math.sqrt(MAX_BACKING_PIXELS / (bounds.width * bounds.height)),
    );
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene = createWeaveScene(bounds.width, bounds.height);
    palette = readPalette();
    settle();
  };
  const step = (now: number) => {
    frame = undefined;
    if (failed || contextLost || disposed) return;
    if (!visible() || !interactive()) {
      settle();
      return;
    }
    if (now - previousFrame < WEAVE_FRAME_MS) {
      frame = view.requestAnimationFrame(step);
      return;
    }
    const delta = Math.min(100, Math.max(0, now - previousStep));
    const ease = 1 - Math.exp(-delta / 65);
    pointer.x += (target.x - pointer.x) * ease;
    pointer.y += (target.y - pointer.y) * ease;
    pointer.energy = Math.min(1, Math.max(0, 1 - (now - lastMove) / WEAVE_IDLE_MS)) ** 2;
    previousStep = now;
    previousFrame = Number.isFinite(previousFrame)
      ? now - ((now - previousFrame) % WEAVE_FRAME_MS)
      : now;
    if (!paint()) return;
    if (pointer.energy === 0) state("idle");
    else frame = view.requestAnimationFrame(step);
  };
  const schedule = () => {
    if (disposed || failed || contextLost || frame !== undefined) return;
    state("active");
    previousFrame = -Infinity;
    previousStep = view.performance.now();
    frame = view.requestAnimationFrame(step);
  };
  const enter = () => {
    rect = root.getBoundingClientRect();
  };
  const invalidateRect = () => {
    rect = undefined;
  };
  const move = (event: MouseEvent) => {
    if (!scene || !visible() || !interactive() || failed || contextLost || disposed) return;
    rect ??= root.getBoundingClientRect();
    target.x = event.clientX - rect.left;
    target.y = event.clientY - rect.top;
    if (pointer.energy === 0) {
      pointer.x = target.x;
      pointer.y = target.y;
    }
    lastMove = view.performance.now();
    schedule();
  };
  const leave = () => {
    rect = undefined;
    if (!pointer.energy || !visible() || !interactive()) return;
    lastMove = view.performance.now() - WEAVE_IDLE_MS * 0.65;
    schedule();
  };
  const loseContext = () => {
    if (disposed) return;
    contextLost = true;
    fallback();
  };
  const restoreContext = () => {
    if (disposed || failed || !contextLost) return;
    contextLost = false;
    try {
      // Restored 2D contexts reset their drawing state. Reinitialize, then stay idle/static.
      resize();
    } catch {
      failed = true;
      fallback();
    }
  };
  const theme = new MutationObserver(() => {
    palette = readPalette();
    settle();
  });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const intersection =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => {
          const entry = entries.find((item) => item.target === root);
          if (!entry) return;
          intersecting = entry.isIntersecting;
          settle();
        });
  intersection?.observe(root);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
  observer?.observe(root);
  hero.addEventListener("mouseenter", enter, { passive: true });
  hero.addEventListener("mousemove", move, { passive: true });
  hero.addEventListener("mouseleave", leave, { passive: true });
  view.addEventListener("resize", resize, { passive: true });
  view.addEventListener("scroll", invalidateRect, { passive: true, capture: true });
  document.addEventListener("visibilitychange", settle);
  motion.addEventListener("change", settle);
  finePointer.addEventListener("change", settle);
  forcedColors.addEventListener("change", settle);
  canvas.addEventListener("contextlost", loseContext);
  canvas.addEventListener("contextrestored", restoreContext);
  resize();

  return () => {
    disposed = true;
    cancel();
    theme.disconnect();
    intersection?.disconnect();
    observer?.disconnect();
    hero.removeEventListener("mouseenter", enter);
    hero.removeEventListener("mousemove", move);
    hero.removeEventListener("mouseleave", leave);
    view.removeEventListener("resize", resize);
    view.removeEventListener("scroll", invalidateRect, true);
    document.removeEventListener("visibilitychange", settle);
    motion.removeEventListener("change", settle);
    finePointer.removeEventListener("change", settle);
    forcedColors.removeEventListener("change", settle);
    canvas.removeEventListener("contextlost", loseContext);
    canvas.removeEventListener("contextrestored", restoreContext);
    root.dataset.weaveDrawn = "false";
    state("fallback");
    canvas.hidden = true;
  };
}
