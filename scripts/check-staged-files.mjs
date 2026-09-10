import { execFileSync } from "node:child_process";
import console from "node:console";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const allowedEnvironmentFiles = new Set([".env.example", ".xcode.env"]);
const allowedCredentialPaths = new Set([
  "apps/mobile/android/app/debug.keystore",
]);
// Firebase mobile configuration contains public SDK identifiers and is
// intentionally tracked because Expo consumes it during native builds.
// Keep the allowlist exact so similarly named credential files remain blocked.
const allowedPublicFirebaseConfigPaths = new Set([
  "apps/mobile/GoogleService-Info.plist",
  "apps/mobile/google-services.json",
]);
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
  ".ppk",
  ".provisionprofile",
]);
const forbiddenCredentialNames = [
  /^application_default_credentials\.json$/i,
  /^credentials\.json$/i,
  /^firebase-adminsdk.*\.json$/i,
  /^GoogleService-Info\.plist$/i,
  /^google-services\.json$/i,
  /^id_(?:dsa|ecdsa|ed25519|rsa)$/i,
  /^service[-_]?account.*\.json$/i,
];
const secretlintExtensions = new Set([
  ".bash",
  ".cjs",
  ".conf",
  ".config",
  ".csv",
  ".css",
  ".env",
  ".gradle",
  ".ini",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".lock",
  ".log",
  ".md",
  ".mjs",
  ".plist",
  ".properties",
  ".rules",
  ".sh",
  ".sql",
  ".svg",
  ".tf",
  ".tfvars",
  ".toml",
  ".ts",
  ".tsx",
  ".text",
  ".txt",
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
  const normalizedPath = path.posix.normalize(filePath).replace(/^\.\//, "");

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
    !allowedCredentialPaths.has(normalizedPath)
  ) {
    return "key or signing credential";
  }

  if (forbiddenCredentialNames.some((pattern) => pattern.test(fileName))) {
    if (allowedPublicFirebaseConfigPaths.has(normalizedPath)) return null;
    return "credential file";
  }

  return null;
}

export function shouldSecretlint(filePath) {
  if (
    allowedPublicFirebaseConfigPaths.has(
      path.posix.normalize(filePath).replace(/^\.\//, ""),
    )
  ) {
    return false;
  }
  const fileName = path.posix.basename(filePath).toLowerCase();
  const extension = path.posix.extname(fileName);
  return (
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    isAllowedEnvironmentExample(fileName) ||
    packageManagerAuthFiles.has(fileName) ||
    extension === "" ||
    secretlintExtensions.has(extension)
  );
}

function gitNamesForCommit(commit) {
  return execFileSync(
    "git",
    [
      "diff-tree",
      "--root",
      "-m",
      "--no-commit-id",
      "--name-only",
      "--diff-filter=ACMRT",
      "-r",
      "-z",
      commit,
    ],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
}

function historyFiles(changedFrom) {
  const commits = execFileSync("git", ["rev-list", `${changedFrom}..HEAD`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const files = new Set();
  for (const commit of commits) {
    for (const filePath of gitNamesForCommit(commit)) files.add(filePath);
  }
  return { commits, files: [...files] };
}

function materializeHistoricalTextFiles(commits, directory) {
  const materialized = [];
  let index = 0;
  for (const commit of commits) {
    const changedPaths = new Set(gitNamesForCommit(commit));
    const entries = execFileSync("git", ["ls-tree", "-r", "-z", commit], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
    for (const entry of entries) {
      const separator = entry.indexOf("\t");
      if (separator < 0) continue;
      const metadata = entry.slice(0, separator).split(" ");
      const filePath = entry.slice(separator + 1);
      if (
        !changedPaths.has(filePath) ||
        metadata[1] !== "blob" ||
        !shouldSecretlint(filePath)
      )
        continue;
      const target = path.join(
        directory,
        `${index++}-${path.posix.basename(filePath)}`,
      );
      writeFileSync(
        target,
        execFileSync("git", ["cat-file", "blob", metadata[2]]),
      );
      materialized.push(target);
    }
  }
  return materialized;
}

function main() {
  const changedFromIndex = process.argv.indexOf("--changed-from");
  const changedFrom =
    changedFromIndex >= 0 ? process.argv[changedFromIndex + 1] : null;
  if (changedFromIndex >= 0 && !changedFrom) {
    throw new Error("--changed-from requires a Git revision");
  }

  const scanChangedFiles = changedFrom !== null;
  const history = scanChangedFiles
    ? historyFiles(changedFrom)
    : { commits: [], files: [] };
  const candidateFiles = scanChangedFiles
    ? history.files
    : execFileSync(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"],
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
    const filesToLint = candidateFiles.filter(
      (filePath) => shouldSecretlint(filePath) && existsSync(filePath),
    );
    let historicalDirectory;
    try {
      let historicalFiles = [];
      if (scanChangedFiles) {
        historicalDirectory = mkdtempSync(
          path.join(os.tmpdir(), "tastes-secretlint-"),
        );
        historicalFiles = materializeHistoricalTextFiles(
          history.commits,
          historicalDirectory,
        );
      }
      const lintFiles = [...new Set([...filesToLint, ...historicalFiles])];
      if (lintFiles.length > 0) {
        execFileSync(
          "pnpm",
          [
            "exec",
            "secretlint",
            "--no-glob",
            "--no-gitignore",
            "--",
            ...lintFiles,
          ],
          { stdio: "inherit" },
        );
      }
    } finally {
      if (historicalDirectory)
        rmSync(historicalDirectory, { recursive: true, force: true });
    }
  }

  console.log(
    `${scanChangedFiles ? "Changed" : "Staged"}-file guard passed (${candidateFiles.length} file(s) checked).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
