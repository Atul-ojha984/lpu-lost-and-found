#!/usr/bin/env node
/**
 * Cross-Platform Django Management CLI Runner
 * Automatically detects and executes python inside the virtual environment.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

function getPythonBinary() {
  const winVenvPython = path.join(backendDir, '.venv', 'Scripts', 'python.exe');
  const posixVenvPython = path.join(backendDir, '.venv', 'bin', 'python');

  if (process.platform === 'win32' && existsSync(winVenvPython)) {
    return winVenvPython;
  }
  if (existsSync(posixVenvPython)) {
    return posixVenvPython;
  }
  return 'python';
}

const pythonBin = getPythonBinary();
const userArgs = process.argv.slice(2);
const managePy = path.join(backendDir, 'manage.py');
const args = [managePy, ...(userArgs.length > 0 ? userArgs : ['check'])];

const proc = spawn(pythonBin, args, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false,
});

proc.on('close', (code) => {
  process.exit(code ?? 0);
});

proc.on('error', (err) => {
  console.error(`[manage:django] Failed to launch python:`, err.message);
  process.exit(1);
});
