import { describe, expect, it } from "vitest";
import { SessionCrypto } from "./session-crypto";

const config = {
  appId: "test-app",
  endpoint: "https://auth.example.test",
  cookieSecret: "fixture-key-with-at-least-thirty-two-characters",
};
const data = {
  idToken: "fixture-id-token",
  refreshToken: "fixture-refresh-token",
  accessToken: "{}",
};

describe("encrypted server session snapshots", () => {
  it("round-trips SDK string storage using a new random IV for each write", async () => {
    const cipher = new SessionCrypto(config);
    const first = await cipher.encrypt("session-a", data);
    const second = await cipher.encrypt("session-a", data);
    expect(first).not.toBe(second);
    expect(first).not.toContain(data.refreshToken);
    expect(await cipher.decrypt("session-a", first)).toEqual(data);
    expect(await cipher.decrypt("session-a", await cipher.encrypt("session-a", {}))).toEqual({});
  });

  it("binds ciphertext to the application, provider endpoint and session hash", async () => {
    const cipher = new SessionCrypto(config);
    const value = await cipher.encrypt("session-a", data);
    expect(await cipher.decrypt("session-b", value)).toBeNull();
    for (const other of [
      { ...config, appId: "other-app" },
      { ...config, endpoint: "https://other.example.test" },
      { ...config, cookieSecret: "a-different-fixture-key-with-thirty-two-characters" },
    ])
      expect(await new SessionCrypto(other).decrypt("session-a", value)).toBeNull();
  });

  it("rejects modified ciphertext and malformed version, IV and encoding", async () => {
    const cipher = new SessionCrypto(config);
    const value = await cipher.encrypt("session-a", data);
    const parts = value.split(".");
    const ciphertext = parts[2]!;
    const changed = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
    for (const invalid of [
      "",
      "1",
      "2.ab.cd",
      "1.ab.cd",
      "1.**.**",
      "1.ab.cd.extra",
      `1.${parts[1]}.${changed}`,
    ])
      expect(await cipher.decrypt("session-a", invalid)).toBeNull();
  });

  it("requires validated string-only storage and sufficient encryption configuration", async () => {
    for (const invalid of [
      { ...config, appId: "" },
      { ...config, endpoint: "" },
      { ...config, cookieSecret: "short" },
    ])
      expect(() => new SessionCrypto(invalid)).toThrow(TypeError);
    const cipher = new SessionCrypto(config);
    for (const invalid of [null, [], { idToken: 1 }])
      await expect(cipher.encrypt("session-a", invalid as never)).rejects.toThrow(TypeError);
  });
});
