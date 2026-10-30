import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const settingsPath = path.join(root, 'printer.local.json');
const settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
process.env.MCP_TRANSPORT = 'stdio';
process.env.BAMBU_MODEL = 'p2s';
process.env.SLICER_TYPE = 'bambustudio';
process.env.SLICER_PATH = '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
process.env.NOZZLE_DIAMETER = String(settings.nozzle_diameter ?? '0.4');
process.env.BAMBU_TEMPLATE_DIR = path.join(root, 'templates');
// Keep slicing results available after the MCP process exits.
process.env.TEMP_DIR = path.join(root, 'output');
fs.mkdirSync(process.env.TEMP_DIR, { recursive: true });
if (settings.bed_type) process.env.BED_TYPE = settings.bed_type;
if (settings.host && settings.serial) {
  process.env.PRINTER_HOST = settings.host;
  process.env.BAMBU_SERIAL = settings.serial;
  // Reuse Studio's local LAN credential without copying it to this project.
  if (!process.env.BAMBU_TOKEN) {
    const studioPath = path.join(os.homedir(), 'Library/Application Support/BambuStudio/BambuStudio.conf');
    const studio = JSON.parse(fs.readFileSync(studioPath, 'utf8'));
    const token = studio.user_access_code?.[settings.serial] || studio.access_code?.[settings.serial];
    if (typeof token !== 'string' || !token) throw new Error('No saved LAN access code for the configured printer.');
    process.env.BAMBU_TOKEN = token;
  }
}
await import('./node_modules/bambu-printer-mcp/dist/index.js');
