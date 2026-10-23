// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntelligenceWeave } from "../ui/intelligence-weave";
import { mountIntelligenceWeave } from "./weave-controller";

let now = 0;
let reduced = false;
let fine = true;
let forced = false;
let hidden = false;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const mediaListeners = new Map<string, Set<() => void>>();
const context = {
  clearRect: vi.fn(),
  setTransform: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: "",
};
let themeColor = "rgb(10, 20, 30)";
let cleanup: (() => void) | undefined;

class Intersection {
  static instances: Intersection[] = [];
  target?: Element;
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) {
    Intersection.instances.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  emit(isIntersecting: boolean) {
    this.callback(
      [{ target: this.target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
class Resize {
  static instances: Resize[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) {
    Resize.instances.push(this);
  }
}
class Mutation {
  static instances: Mutation[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(readonly callback: MutationCallback) {
    Mutation.instances.push(this);
  }
}

function advance(milliseconds: number) {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(now));
}
function mount() {
  const hero = document.createElement("section");
  hero.dataset.loomHero = "";
  const root = document.createElement("div");
  root.dataset.weaveState = "fallback";
  root.dataset.weaveDrawn = "false";
  root.innerHTML = '<svg class="loom-weave-fallback"></svg><canvas></canvas>';
  const canvas = root.querySelector("canvas")!;
  const bounds = vi
    .spyOn(root, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(30, 50, 1_200, 600));
  hero.appendChild(root);
  document.body.appendChild(hero);
  cleanup = mountIntelligenceWeave(root, canvas);
  return { hero, root, canvas, bounds };
}
function move(hero: HTMLElement) {
  hero.dispatchEvent(new MouseEvent("mousemove", { clientX: 230, clientY: 250 }));
}
function emitMedia(query?: string) {
  const lists = query ? [mediaListeners.get(query)] : mediaListeners.values();
  for (const listeners of lists) listeners?.forEach((listener) => listener());
}

beforeEach(() => {
  now = 0;
  reduced = false;
  fine = true;
  forced = false;
  hidden = false;
  themeColor = "rgb(10, 20, 30)";
  frames.clear();
  mediaListeners.clear();
  Intersection.instances = [];
  Resize.instances = [];
  Mutation.instances = [];
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", Intersection);
  vi.stubGlobal("ResizeObserver", Resize);
  vi.stubGlobal("MutationObserver", Mutation);
  vi.stubGlobal("devicePixelRatio", 3);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => frames.delete(id));
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        get matches() {
          return query.includes("reduced-motion")
            ? reduced
            : query.includes("forced-colors")
              ? forced
              : fine;
        },
        addEventListener: (_event: string, listener: () => void) => {
          if (!mediaListeners.has(query)) mediaListeners.set(query, new Set());
          mediaListeners.get(query)!.add(listener);
        },
        removeEventListener: (_event: string, listener: () => void) => {
          const listeners = mediaListeners.get(query);
          listeners?.delete(listener);
          if (!listeners?.size) mediaListeners.delete(query);
        },
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        color: themeColor,
        getPropertyValue: () => themeColor,
      }) as unknown as CSSStyleDeclaration,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("intelligence weave lifecycle", () => {
  it("server renders a decorative static fallback without reading a canvas or browser state", () => {
    const markup = renderToStaticMarkup(createElement(IntelligenceWeave));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-weave-state="fallback"');
    expect(markup).toContain('class="loom-weave-fallback"');
    expect(markup).toContain("<path");
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(window.matchMedia).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("paints once, caps DPR, reacts without layout reads per move and settles to an idle frame", () => {
    const { hero, root, canvas, bounds } = mount();
    expect(root.dataset.weaveState).toBe("idle");
    expect(root.dataset.weaveDrawn).toBe("true");
    expect(canvas.width).toBe(1_800);
    expect(canvas.height).toBe(900);
    expect(frames.size).toBe(0);
    expect(context.clearRect).toHaveBeenCalledTimes(1);

    move(hero);
    move(hero);
    expect(bounds).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    expect(root.dataset.weaveState).toBe("active");
    advance(16);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    advance(1);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 32; index++) advance(34);
    expect(context.clearRect.mock.calls.length).toBeLessThanOrEqual(32);
    expect(root.dataset.weaveState).toBe("idle");
    expect(frames.size).toBe(0);
  });

  it.each(["reduced", "coarse"])(
    "uses a static frame for %s input and responds to preference changes",
    (kind) => {
      reduced = kind === "reduced";
      fine = kind !== "coarse";
      const { hero, root } = mount();
      move(hero);
      expect(root.dataset.weaveState).toBe("static");
      expect(frames.size).toBe(0);
      reduced = false;
      fine = true;
      emitMedia();
      move(hero);
      expect(frames.size).toBe(1);
      reduced = true;
      emitMedia();
      expect(root.dataset.weaveState).toBe("static");
      expect(frames.size).toBe(0);
    },
  );

  it("does not draw or animate when forced colors hides decoration, including live media changes", () => {
    forced = true;
    const { hero, root } = mount();
    move(hero);
    expect(root.dataset.weaveState).toBe("paused");
    expect(root.dataset.weaveDrawn).toBe("false");
    expect(context.clearRect).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    forced = false;
    emitMedia("(forced-colors: active)");
    expect(root.dataset.weaveState).toBe("idle");
    expect(root.dataset.weaveDrawn).toBe("true");
    move(hero);
    expect(frames.size).toBe(1);
    forced = true;
    emitMedia("(forced-colors: active)");
    expect(root.dataset.weaveState).toBe("paused");
    expect(frames.size).toBe(0);
    const paints = context.clearRect.mock.calls.length;
    move(hero);
    advance(50);
    expect(context.clearRect).toHaveBeenCalledTimes(paints);
  });

  it.each(["normal", "reduced", "forced"])(
    "restores the SVG on context loss and safely redraws %s input after actual restore events",
    (kind) => {
      const { hero, root, canvas } = mount();
      move(hero);
      expect(frames.size).toBe(1);
      const lost = new Event("contextlost", { cancelable: true });
      canvas.dispatchEvent(lost);
      expect(lost.defaultPrevented).toBe(false);
      expect(root.dataset.weaveState).toBe("fallback");
      expect(root.dataset.weaveDrawn).toBe("false");
      expect(canvas.hidden).toBe(true);
      expect(frames.size).toBe(0);
      const paints = context.clearRect.mock.calls.length;
      move(hero);
      expect(frames.size).toBe(0);
      reduced = kind === "reduced";
      forced = kind === "forced";
      emitMedia("(prefers-reduced-motion: reduce)");
      emitMedia("(forced-colors: active)");
      expect(context.clearRect).toHaveBeenCalledTimes(paints);
      canvas.dispatchEvent(new Event("contextrestored"));
      expect(context.setTransform).toHaveBeenCalledTimes(2);
      expect(context.clearRect).toHaveBeenCalledTimes(paints + (forced ? 0 : 1));
      expect(root.dataset.weaveState).toBe(forced ? "paused" : reduced ? "static" : "idle");
      expect(root.dataset.weaveDrawn).toBe(forced ? "false" : "true");
      expect(canvas.hidden).toBe(forced);
      expect(frames.size).toBe(0);
      move(hero);
      expect(frames.size).toBe(reduced || forced ? 0 : 1);
      if (forced) {
        forced = false;
        emitMedia("(forced-colors: active)");
        expect(root.dataset.weaveDrawn).toBe("true");
        expect(root.dataset.weaveState).toBe("idle");
        expect(frames.size).toBe(0);
      }
    },
  );

  it("invalidates scroll coordinates without reading layout until the next pointer movement", () => {
    const { hero, bounds } = mount();
    bounds.mockReturnValue(new DOMRect(30, -100, 1_200, 600));
    hero.dispatchEvent(new Event("scroll"));
    expect(bounds).toHaveBeenCalledTimes(1);
    move(hero);
    expect(bounds).toHaveBeenCalledTimes(2);
    move(hero);
    expect(bounds).toHaveBeenCalledTimes(2);
  });

  it("stops while hidden or offscreen, then resumes only in response to a fresh pointer movement", () => {
    const { hero, root } = mount();
    move(hero);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.dataset.weaveState).toBe("paused");
    expect(frames.size).toBe(0);
    move(hero);
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.dataset.weaveState).toBe("idle");
    expect(frames.size).toBe(0);
    move(hero);
    Intersection.instances[0]!.emit(false);
    expect(root.dataset.weaveState).toBe("paused");
    expect(frames.size).toBe(0);
    Intersection.instances[0]!.emit(true);
    expect(root.dataset.weaveState).toBe("idle");
    expect(frames.size).toBe(0);
  });

  it("redraws a static theme change without polling or starting animation", () => {
    const { root } = mount();
    expect(context.fillStyle).toBe(themeColor);
    themeColor = "rgb(80, 90, 100)";
    Mutation.instances[0]!.callback([], {} as MutationObserver);
    expect(context.fillStyle).toBe(themeColor);
    expect(root.dataset.weaveState).toBe("idle");
    expect(frames.size).toBe(0);
    expect(Mutation.instances[0]!.observe).toHaveBeenCalledWith(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  it("preserves the SVG fallback if a context is unavailable or drawing fails", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    const missing = mount();
    expect(missing.root.dataset.weaveState).toBe("fallback");
    expect(missing.root.dataset.weaveDrawn).toBe("false");
    cleanup?.();
    context.clearRect.mockImplementationOnce(() => {
      throw new Error("context_lost");
    });
    const failed = mount();
    expect(failed.root.dataset.weaveState).toBe("fallback");
    expect(failed.root.dataset.weaveDrawn).toBe("false");
    expect(failed.canvas.hidden).toBe(true);
    move(failed.hero);
    expect(frames.size).toBe(0);
  });

  it("cancels frames and removes media, observer and DOM listeners on disposal", () => {
    const { hero, root, canvas } = mount();
    const removeCanvasListener = vi.spyOn(canvas, "removeEventListener");
    move(hero);
    expect(frames.size).toBe(1);
    cleanup?.();
    cleanup = undefined;
    const paints = context.clearRect.mock.calls.length;
    move(hero);
    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(context.clearRect).toHaveBeenCalledTimes(paints);
    expect(frames.size).toBe(0);
    expect(mediaListeners.size).toBe(0);
    expect(Intersection.instances[0]!.disconnect).toHaveBeenCalledOnce();
    expect(Resize.instances[0]!.disconnect).toHaveBeenCalledOnce();
    expect(Mutation.instances[0]!.disconnect).toHaveBeenCalledOnce();
    expect(root.dataset.weaveState).toBe("fallback");
    expect(removeCanvasListener).toHaveBeenCalledWith("contextlost", expect.any(Function));
    expect(removeCanvasListener).toHaveBeenCalledWith("contextrestored", expect.any(Function));
    canvas.dispatchEvent(new Event("contextrestored"));
    expect(context.clearRect).toHaveBeenCalledTimes(paints);
  });
});
