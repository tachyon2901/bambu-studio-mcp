import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { createHash } from 'node:crypto';

const number = (min, max, integer = false) => ({ type: integer ? 'integer' : 'number', minimum: min, maximum: max });
// Deliberately bounded initial editing surface, not a claim to cover every Studio option.
export const settingsSchema = {
  layer_height: number(0.05, 0.6), initial_layer_print_height: number(0.05, 0.6),
  wall_loops: number(1, 20, true), top_shell_layers: number(0, 30, true), bottom_shell_layers: number(0, 30, true),
  sparse_infill_density: number(0, 100),
  sparse_infill_pattern: { type: 'string', enum: ['grid', 'gyroid', 'rectilinear', 'honeycomb', 'cubic', 'adaptivecubic', 'lightning'] },
  enable_support: { type: 'boolean' }, support_on_build_plate_only: { type: 'boolean' },
  support_type: { type: 'string', enum: ['normal(auto)', 'normal(manual)', 'tree(auto)', 'tree(manual)'] },
  support_threshold_angle: number(0, 90, true), support_top_z_distance: number(0, 1), support_bottom_z_distance: number(0, 1),
  support_interface_top_layers: number(0, 10, true), support_interface_bottom_layers: number(0, 10, true),
  seam_position: { type: 'string', enum: ['nearest', 'aligned', 'back', 'random'] },
  outer_wall_speed: number(1, 500), inner_wall_speed: number(1, 500),
  sparse_infill_speed: number(1, 500), initial_layer_speed: number(1, 100),
  brim_width: number(0, 30), brim_object_gap: number(0, 2),
};
const settingsFile = 'Metadata/project_settings.config';
const digest = data => createHash('sha256').update(data).digest('hex');

async function load(source) {
  const bytes = await fs.readFile(source);
  if (bytes.length > 100 * 1024 * 1024) throw new Error('Project exceeds the 100 MiB input limit.');
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(settingsFile);
  if (!entry) throw new Error('Expected a Bambu project with Metadata/project_settings.config.');
  const settings = JSON.parse(await entry.async('string'));
  return { zip, settings, sha256: digest(bytes) };
}

export async function inspectProject(source) {
  const { zip, settings, sha256 } = await load(source);
  const model = zip.file('Metadata/model_settings.config');
  const structure = model ? await parseStringPromise(await model.async('string')) : null;
  return {
    source, sha256, settings,
    objects_and_plates: structure?.config ?? null,
    geometry_files: Object.keys(zip.files).filter(n => n.endsWith('.model')),
    has_sliced_gcode: Object.keys(zip.files).some(n => /\.gcode$/i.test(n)),
    spatial_data_files: Object.keys(zip.files).filter(n => /layer_height|layer_config|support|seam/i.test(n)),
    note: 'Global settings do not supersede object, part, layer-range or painted overrides. Mesh painting is preserved but not decoded by this tool.',
  };
}

function validate(key, value) {
  if (!Object.hasOwn(settingsSchema, key)) throw new Error(`Unsupported setting: ${key}. Use studio_setting_schema.`);
  const schema = settingsSchema[key];
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${key} must be boolean.`);
  if (schema.type === 'string' && !schema.enum.includes(value)) throw new Error(`Invalid value for ${key}.`);
  if (['number', 'integer'].includes(schema.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum || (schema.type === 'integer' && !Number.isInteger(value))) {
      throw new Error(`Invalid numeric value for ${key}.`);
    }
  }
  return typeof value === 'boolean' ? (value ? '1' : '0') : key === 'sparse_infill_density' ? `${value}%` : String(value);
}

export async function editProject({ source, output, changes, expected_sha256 }) {
  if (!output?.endsWith('.3mf')) throw new Error('Output must be a new .3mf file.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) throw new Error('Provide at least one setting change.');
  const { zip, settings, sha256 } = await load(source);
  if (sha256 !== expected_sha256) throw new Error('Source changed since inspection; inspect again.');
  if (Object.keys(zip.files).some(n => /\.gcode$/i.test(n))) throw new Error('Edit the unsliced source project, not a project containing G-code.');
  if (!String(settings.printer_model).includes('P2S')) throw new Error('This initial editor requires a P2S project.');
  const diff = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(settings, key)) throw new Error(`${key} is absent from this Studio project; refusing to invent a setting.`);
    const encoded = validate(key, value);
    diff.push({ key, before: settings[key], after: encoded });
    settings[key] = encoded;
  }
  const nozzle = Number(Array.isArray(settings.nozzle_diameter) ? settings.nozzle_diameter[0] : settings.nozzle_diameter);
  for (const key of ['layer_height', 'initial_layer_print_height']) {
    if (Object.hasOwn(changes, key) && (!Number.isFinite(nozzle) || Number(settings[key]) > nozzle * 0.75)) throw new Error(`${key} exceeds this editor's 75%-of-nozzle limit or nozzle is unknown.`);
  }
  zip.file(settingsFile, JSON.stringify(settings, null, 2));
  // Invalidate derived slicing summaries. Preserve meshes, painting, placements and project structure.
  zip.remove('Metadata/slice_info.config');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(output, bytes, { flag: 'wx' });
  return { output, sha256: digest(bytes), source_sha256: sha256, diff, requires_reslice: true,
    warnings: ['Object/part/layer overrides and existing painting remain in effect.', 'Embedded preview images are retained and may be stale. Regenerate them in Studio.', 'Schema bounds are conservative editing limits, not print-quality guarantees. Inspect the sliced preview before printing.'] };
}
