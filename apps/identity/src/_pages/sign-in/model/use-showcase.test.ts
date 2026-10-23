// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { CarouselApi } from "@hotkey-tools/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShowcase } from "./use-showcase";

let reduced = false;
let desktop = true;
let hidden = false;
const mediaListeners = new Set<() => void>();

function fakeCarousel() {
  let active = 0;
  const events = new Map<string, Set<() => void>>();
  const api = {
    selectedScrollSnap: () => active,
    on: (name: string, listener: () => void) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name)!.add(listener);
      return api;
    },
    off: (name: string, listener: () => void) => {
      events.get(name)?.delete(listener);
      return api;
    },
    scrollNext: vi.fn(() => {
      active = (active + 1) % 3;
      events.get("select")?.forEach((run) => run());
    }),
    scrollPrev: vi.fn(),
    scrollTo: vi.fn(),
  };
  return {
    api: api as unknown as NonNullable<CarouselApi>,
    calls: api,
    emit: (event: string) => events.get(event)?.forEach((run) => run()),
    events,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  desktop = true;
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        get matches() {
          return query.includes("reduced-motion") ? reduced : desktop;
        },
        addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          mediaListeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mediaListeners.clear();
});

describe("accessible login showcase rotation", () => {
  it("rotates on desktop, pauses on hover, and stops until explicitly restarted after interaction", () => {
    const carousel = fakeCarousel();
    const { result } = renderHook(() => useShowcase());
    act(() => result.current.setApi(carousel.api));
    act(() => vi.advanceTimersByTime(7_000));
    expect(carousel.calls.scrollNext).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(1);
    act(() => result.current.hover(true));
    act(() => vi.advanceTimersByTime(14_000));
    expect(carousel.calls.scrollNext).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.hover(false);
      result.current.pause();
    });
    act(() => vi.advanceTimersByTime(14_000));
    expect(result.current.rotating).toBe(false);
    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(7_000));
    expect(carousel.calls.scrollNext).toHaveBeenCalledTimes(2);
  });

  it("respects reduced motion immediately and uses nonanimated manual navigation", () => {
    reduced = true;
    const carousel = fakeCarousel();
    const { result } = renderHook(() => useShowcase());
    act(() => result.current.setApi(carousel.api));
    act(() => vi.advanceTimersByTime(21_000));
    expect(carousel.calls.scrollNext).not.toHaveBeenCalled();
    act(() => {
      result.current.select(2);
      result.current.previous();
      result.current.next();
    });
    expect(carousel.calls.scrollTo).toHaveBeenCalledWith(2, true);
    expect(carousel.calls.scrollPrev).toHaveBeenCalledWith(true);
    expect(carousel.calls.scrollNext).toHaveBeenCalledWith(true);
    act(() => {
      reduced = false;
      mediaListeners.forEach((listener) => listener());
    });
    expect(result.current.playing).toBe(false);
  });

  it("does not run in the hidden mobile panel or background document and cleans up on unmount", () => {
    desktop = false;
    const carousel = fakeCarousel();
    const { result, unmount } = renderHook(() => useShowcase());
    act(() => result.current.setApi(carousel.api));
    act(() => vi.advanceTimersByTime(14_000));
    expect(carousel.calls.scrollNext).not.toHaveBeenCalled();
    act(() => {
      desktop = true;
      mediaListeners.forEach((listener) => listener());
    });
    expect(result.current.rotating).toBe(true);
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.rotating).toBe(false);
    unmount();
    expect([...carousel.events.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(mediaListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops automatic rotation when the user starts a swipe", () => {
    const carousel = fakeCarousel();
    const { result } = renderHook(() => useShowcase());
    act(() => result.current.setApi(carousel.api));
    act(() => carousel.emit("pointerDown"));
    expect(result.current.playing).toBe(false);
    act(() => vi.advanceTimersByTime(14_000));
    expect(carousel.calls.scrollNext).not.toHaveBeenCalled();
  });
});
