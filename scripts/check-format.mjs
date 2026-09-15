import { execFileSync } from 'node:child_process';
import process from 'node:process';

const supported = /\.(?:cjs|css|js|jsx|json|jsonc|mjs|md|ts|tsx|yaml|yml)$/;
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);

const baseRef = process.argv[2];
const files = baseRef
  ? git(['diff', '--name-only', '--diff-filter=ACMRT', '-z', baseRef, 'HEAD'])
  : git(['ls-files', '-z']);
const formatFiles = files.filter((filePath) => supported.test(filePath));
if (formatFiles.length > 0) {
  execFileSync('prettier', ['--check', '--', ...formatFiles], {
    stdio: 'inherit',
  });
}
