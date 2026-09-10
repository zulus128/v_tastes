import { execFileSync } from 'node:child_process';

const supported = /\.(?:cjs|css|js|jsx|json|jsonc|mjs|md|ts|tsx|yaml|yml)$/;
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);

let files = [];
try {
  files = git(['diff', '--name-only', '--diff-filter=ACMRT', '-z', 'HEAD']);
  if (files.length === 0) {
    files = git([
      'diff',
      '--name-only',
      '--diff-filter=ACMRT',
      '-z',
      'HEAD^',
      'HEAD',
    ]);
  }
} catch {
  files = git(['ls-files', '-z']);
}

const formatFiles = files.filter((filePath) => supported.test(filePath));
if (formatFiles.length > 0) {
  execFileSync('prettier', ['--check', ...formatFiles], { stdio: 'inherit' });
}
