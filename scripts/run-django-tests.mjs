#!/usr/bin/env node
/**
 * Cross-Platform Pytest Test Runner for Django Backend
 * Automatically detects and executes the virtual environment's pytest binary.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

function getPytestBinary() {
  const winVenvPytest = path.join(backendDir, '.venv', 'Scripts', 'pytest.exe');
  const posixVenvPytest = path.join(backendDir, '.venv', 'bin', 'pytest');

  if (process.platform === 'win32' && existsSync(winVenvPytest)) {
    return winVenvPytest;
  }
  if (existsSync(posixVenvPytest)) {
    return posixVenvPytest;
  }
  return 'pytest';
}

const pytestBin = getPytestBinary();
const userArgs = process.argv.slice(2);
const args = userArgs.length > 0 ? userArgs : ['tests/', '-v'];

console.log(`[test:django] Executing: ${pytestBin} ${args.join(' ')}`);
console.log(`[test:django] Working directory: ${backendDir}\n`);

const proc = spawn(pytestBin, args, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false,
});

proc.on('close', (code) => {
  process.exit(code ?? 0);
});

proc.on('error', (err) => {
  console.error(`[test:django] Failed to launch pytest:`, err.message);
  process.exit(1);
});
