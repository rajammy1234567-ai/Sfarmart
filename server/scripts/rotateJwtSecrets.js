import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve paths
const envPath = path.resolve(__dirname, '..', '.env');
const backupDir = path.resolve(__dirname, '../../scratch');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
const backupPath = path.join(backupDir, '.env.backup');

// Backup current .env
fs.copyFileSync(envPath, backupPath);

// Read current env lines
const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

function replaceOrAdd(prefix, value) {
  const idx = lines.findIndex(line => line.startsWith(prefix));
  const newLine = `${prefix}${value}`;
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
}

// Generate new secrets
const newAccess = crypto.randomBytes(64).toString('hex');
const newRefresh = crypto.randomBytes(64).toString('hex');

replaceOrAdd('JWT_ACCESS_SECRET=', newAccess);
replaceOrAdd('JWT_REFRESH_SECRET=', newRefresh);

// Write updated env
fs.writeFileSync(envPath, lines.join('\n'), 'utf8');

console.log('JWT_ACCESS_SECRET rotated');
console.log('JWT_REFRESH_SECRET rotated');
