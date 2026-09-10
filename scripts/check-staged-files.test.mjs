import { describe, expect, it } from "vitest";
import { getBlockingReason, shouldSecretlint } from "./check-staged-files.mjs";

describe("sensitive-file policy", () => {
  it("rejects Apple private keys even when they are force-added", () => {
    expect(getBlockingReason("credentials/AuthKey_TEST123.p8")).toBe(
      "key or signing credential",
    );
  });

  it.each(["terraform/production.tfvars", "terraform/production.tfvars.json"])(
    "rejects Terraform variable file %s",
    (filePath) => {
      expect(getBlockingReason(filePath)).toBe(
        "environment-specific Terraform variables",
      );
    },
  );

  it.each([
    "terraform/production.tfvars.example",
    "terraform/production.tfvars.json.example",
  ])("allows documented Terraform variable example %s", (filePath) => {
    expect(getBlockingReason(filePath)).toBeNull();
  });

  it.each([
    "apps/mobile/release.mobileprovision",
    "apps/desktop/release.provisionprofile",
  ])("rejects provisioning profile %s", (filePath) => {
    expect(getBlockingReason(filePath)).toBe("key or signing credential");
  });

  it.each(["id_rsa", "keys/id_dsa", "keys/id_ecdsa", "keys/id_ed25519"])(
    "rejects extensionless SSH private key %s",
    (filePath) => {
      expect(getBlockingReason(filePath)).toBe("credential file");
    },
  );

  it("does not block an SSH public key by filename", () => {
    expect(getBlockingReason("keys/id_ed25519.pub")).toBeNull();
  });

  it.each([".npmrc", "packages/mobile/.npmrc", ".yarnrc.yml", "bunfig.toml"])(
    "routes package-manager auth config %s through secretlint",
    (filePath) => {
      expect(shouldSecretlint(filePath)).toBe(true);
    },
  );
});
