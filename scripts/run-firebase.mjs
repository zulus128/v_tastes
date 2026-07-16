/* global console, process */

import { execFileSync, spawn } from 'node:child_process';

const env = { ...process.env };

if (process.platform === 'darwin') {
  try {
    env.JAVA_HOME = execFileSync('/usr/libexec/java_home', ['-v', '21'], {
      encoding: 'utf8',
    }).trim();
    env.PATH = `${env.JAVA_HOME}/bin:${env.PATH ?? ''}`;
  } catch {
    console.error('Java 21 is required. Install it or set JAVA_HOME before running Firebase emulators.');
    process.exit(1);
  }
}

const child = spawn('firebase', process.argv.slice(2), {
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
