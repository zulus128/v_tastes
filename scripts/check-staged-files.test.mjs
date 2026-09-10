import { describe, expect, it } from "vitest";
import { getBlockingReason, shouldSecretlint } from "./check-staged-files.mjs";

describe("sensitive-file policy", () => {
  it("rejects Apple private keys even when they are force-added", () => {
    expect(getBlockingReason("credentials/AuthKey_TEST123.p8")).toBe(
      "key or signing credential",
    );
  });

  it.each([".npmrc", "packages/mobile/.npmrc", ".yarnrc.yml", "bunfig.toml"])(
    "routes package-manager auth config %s through secretlint",
    (filePath) => {
      expect(shouldSecretlint(filePath)).toBe(true);
    },
  );
});
