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
    expect(shouldSecretlint(filePath)).toBe(true);
  });

  it("allows tracked public Firebase configs but rejects untracked copies", () => {
    expect(
      getBlockingReason("apps/mobile/GoogleService-Info.plist"),
    ).toBeNull();
    expect(shouldSecretlint("apps/mobile/GoogleService-Info.plist")).toBe(
      false,
    );
    expect(getBlockingReason("tmp/GoogleService-Info.plist")).toBe(
      "credential file",
    );
    expect(getBlockingReason("apps/mobile/google-services.json")).toBeNull();
    expect(shouldSecretlint("apps/mobile/google-services.json")).toBe(false);
  });

  it.each([
    "apps/mobile/release.mobileprovision",
    "apps/desktop/release.provisionprofile",
  ])("rejects provisioning profile %s", (filePath) => {
    expect(getBlockingReason(filePath)).toBe("key or signing credential");
  });

  it("rejects PuTTY private keys by extension", () => {
    expect(getBlockingReason("keys/production.ppk")).toBe(
      "key or signing credential",
    );
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

  it("allows only the repository Android development keystore path", () => {
    expect(
      getBlockingReason("apps/mobile/android/app/debug.keystore"),
    ).toBeNull();
    expect(getBlockingReason("release/debug.keystore")).toBe(
      "key or signing credential",
    );
    expect(getBlockingReason("debug.keystore")).toBe(
      "key or signing credential",
    );
    expect(getBlockingReason("apps/mobile/android/App/debug.keystore")).toBe(
      "key or signing credential",
    );
  });

  it.each([
    "notes.txt",
    "notes.TXT",
    "secrets.text",
    "config/SECRETS.JSON",
    "logs/build.log",
    "exports/users.csv",
    "styles/app.css",
    "firestore.rules",
    "assets/icon.svg",
    "generated/dependencies.lock",
    "Dockerfile",
    "config/README",
  ])("routes ordinary plaintext file %s through secretlint", (filePath) => {
    expect(shouldSecretlint(filePath)).toBe(true);
  });

  it("does not route a binary asset through secretlint", () => {
    expect(shouldSecretlint("assets/photo.png")).toBe(false);
  });

  it.each([".npmrc", "packages/mobile/.npmrc", ".yarnrc.yml", "bunfig.toml"])(
    "routes package-manager auth config %s through secretlint",
    (filePath) => {
      expect(shouldSecretlint(filePath)).toBe(true);
    },
  );
});
