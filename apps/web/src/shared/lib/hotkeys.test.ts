import { describe, expect, it } from "vitest";
import { normalizeHotkey } from "./hotkeys";

describe("normalizeHotkey", () => {
  it("normalizes a keyboard combination for display", () => {
    expect(normalizeHotkey(" ctrl + shift + p ")).toBe("Ctrl + Shift + P");
  });
});
