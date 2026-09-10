import { execFileSync } from "node:child_process";
import console from "node:console";
import path from "node:path";
import process from "node:process";

const stagedFiles = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const allowedEnvironmentFiles = new Set([".env.example", ".xcode.env"]);
const forbiddenExtensions = new Set([
  ".der",
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);
const forbiddenCredentialNames = [
  /^application_default_credentials\.json$/i,
  /^credentials\.json$/i,
  /^firebase-adminsdk.*\.json$/i,
  /^google-services\.json$/i,
  /^service[-_]?account.*\.json$/i,
];

function isAllowedEnvironmentExample(fileName) {
  return (
    allowedEnvironmentFiles.has(fileName) ||
    /^\.env(?:\..+)?\.example$/i.test(fileName) ||
    /\.tfvars\.example$/i.test(fileName)
  );
}

function getBlockingReason(filePath) {
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

const blockedFiles = stagedFiles
  .map((filePath) => ({ filePath, reason: getBlockingReason(filePath) }))
  .filter(({ reason }) => reason !== null);

if (blockedFiles.length > 0) {
  console.error("Commit blocked: sensitive files are staged:");
  for (const { filePath, reason } of blockedFiles) {
    console.error(`  - ${filePath} (${reason})`);
  }
  console.error("\nUnstage these files and store secrets outside Git.");
  process.exit(1);
}

console.log(
  `Staged-file guard passed (${stagedFiles.length} file(s) checked).`,
);
