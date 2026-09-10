import { execFileSync } from "node:child_process";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const allowedEnvironmentFiles = new Set([".env.example", ".xcode.env"]);
const forbiddenExtensions = new Set([
  ".der",
  ".jks",
  ".key",
  ".keystore",
  ".mobileprovision",
  ".p12",
  ".p8",
  ".pem",
  ".pfx",
  ".provisionprofile",
]);
const forbiddenCredentialNames = [
  /^application_default_credentials\.json$/i,
  /^credentials\.json$/i,
  /^firebase-adminsdk.*\.json$/i,
  /^google-services\.json$/i,
  /^id_(?:dsa|ecdsa|ed25519|rsa)$/i,
  /^service[-_]?account.*\.json$/i,
];
const secretlintExtensions = new Set([
  ".bash",
  ".cjs",
  ".conf",
  ".config",
  ".env",
  ".gradle",
  ".ini",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".plist",
  ".properties",
  ".sh",
  ".sql",
  ".tf",
  ".tfvars",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);
const packageManagerAuthFiles = new Set([
  ".npmrc",
  ".pnpmrc",
  ".yarnrc",
  ".yarnrc.yml",
  "bunfig.toml",
]);

function isAllowedEnvironmentExample(fileName) {
  return (
    allowedEnvironmentFiles.has(fileName) ||
    /^\.env(?:\..+)?\.example$/i.test(fileName) ||
    /\.tfvars(?:\.json)?\.example$/i.test(fileName)
  );
}

export function getBlockingReason(filePath) {
  const fileName = path.posix.basename(filePath);
  const normalizedName = fileName.toLowerCase();

  if (
    (normalizedName === ".env" ||
      normalizedName.startsWith(".env.") ||
      normalizedName === ".xcode.env.local") &&
    !isAllowedEnvironmentExample(normalizedName)
  ) {
    return "environment-specific file";
  }

  if (
    /\.tfvars(?:\.json)?$/i.test(normalizedName) &&
    !isAllowedEnvironmentExample(normalizedName)
  ) {
    return "environment-specific Terraform variables";
  }

  if (
    forbiddenExtensions.has(path.posix.extname(normalizedName)) &&
    normalizedName !== "debug.keystore"
  ) {
    return "key or signing credential";
  }

  if (forbiddenCredentialNames.some((pattern) => pattern.test(fileName))) {
    return "credential file";
  }

  return null;
}

export function shouldSecretlint(filePath) {
  const fileName = path.posix.basename(filePath).toLowerCase();
  return (
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    packageManagerAuthFiles.has(fileName) ||
    secretlintExtensions.has(path.posix.extname(fileName))
  );
}

function main() {
  const changedFromIndex = process.argv.indexOf("--changed-from");
  const changedFrom =
    changedFromIndex >= 0 ? process.argv[changedFromIndex + 1] : null;
  if (changedFromIndex >= 0 && !changedFrom) {
    throw new Error("--changed-from requires a Git revision");
  }

  const scanChangedFiles = changedFrom !== null;
  const candidateFiles = execFileSync(
    "git",
    scanChangedFiles
      ? [
          "diff",
          changedFrom,
          "HEAD",
          "--name-only",
          "--diff-filter=ACMRT",
          "-z",
        ]
      : ["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

  const blockedFiles = candidateFiles
    .map((filePath) => ({ filePath, reason: getBlockingReason(filePath) }))
    .filter(({ reason }) => reason !== null);

  if (blockedFiles.length > 0) {
    console.error(
      `${scanChangedFiles ? "CI check" : "Commit"} blocked: sensitive files are ${scanChangedFiles ? "changed" : "staged"}:`,
    );
    for (const { filePath, reason } of blockedFiles) {
      console.error(`  - ${filePath} (${reason})`);
    }
    console.error("\nRemove these files and store secrets outside Git.");
    process.exit(1);
  }

  if (process.argv.includes("--secretlint")) {
    const filesToLint = candidateFiles.filter(shouldSecretlint);
    if (filesToLint.length > 0) {
      execFileSync(
        "pnpm",
        ["exec", "secretlint", "--no-glob", "--no-gitignore", ...filesToLint],
        { stdio: "inherit" },
      );
    }
  }

  console.log(
    `${scanChangedFiles ? "Changed" : "Staged"}-file guard passed (${candidateFiles.length} file(s) checked).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
