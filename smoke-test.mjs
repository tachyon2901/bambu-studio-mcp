import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const client = new Client({ name: 'bambu-local-verification', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./launch.mjs', import.meta.url))],
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  for (const name of ['slice_stl', 'get_printer_status', 'get_slice_settings', 'print_3mf']) {
    if (!tools.some(tool => tool.name === name)) throw new Error(`Missing tool: ${name}`);
  }
  console.log(`MCP initialization passed; ${tools.length} tools available.`);
  const result = await client.callTool({
    name: 'get_slice_settings',
    arguments: { source_path: '/Applications/BambuStudio.app/Contents/Resources/profiles/BBL/machine/Bambu Lab P2S 0.4 nozzle.json' },
  });
  if (result.isError) throw new Error(JSON.stringify(result));
  console.log('P2S machine profile inspection passed. No printer commands sent.');
  if (process.argv.includes('--slice')) {
    const input = process.argv[process.argv.indexOf('--slice') + 1];
    if (!input || input.startsWith('--')) throw new Error('Usage: node smoke-test.mjs --slice /absolute/path/to/model.stl');
    const sliced = await client.callTool({
      name: 'slice_stl',
      arguments: {
        stl_path: path.resolve(input),
        bambu_model: 'p2s',
        nozzle_diameter: '0.4',
        bed_type: 'textured_plate',
        slicer_profile: '/Applications/BambuStudio.app/Contents/Resources/profiles/BBL/process/0.20mm Standard @BBL P2S.json',
        load_filaments: '/Applications/BambuStudio.app/Contents/Resources/profiles/BBL/filament/Bambu PLA Basic @BBL P2S.json',
        use_printer_filaments: false,
      },
    }, undefined, { timeout: 180000 });
    console.log(JSON.stringify(sliced, null, 2));
    if (sliced.isError) throw new Error('Local slicing verification failed.');
  }
} finally {
  await client.close();
}
