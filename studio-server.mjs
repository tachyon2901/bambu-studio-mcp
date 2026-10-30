import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inspectProject, editProject, settingsSchema } from './project-tools.mjs';

const server = new Server({ name: 'bambu-studio-projects', version: '0.1.0' }, { capabilities: { tools: {} } });
const tools = [
  { name: 'studio_setting_schema', description: 'List supported global Bambu Studio project edits, types and conservative bounds. Density is a percentage number; booleans are actual booleans. This is a subset of Studio settings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'studio_inspect_project', description: 'Read all global settings, object/part overrides and plate structure in a Bambu 3MF. Returns a source hash required for editing. Does not decode painted triangles.', inputSchema: { type: 'object', properties: { source: { type: 'string' } }, required: ['source'], additionalProperties: false } },
  { name: 'studio_edit_project', description: 'Edit supported global slicing settings in an unsliced P2S project, writing a NEW 3MF. Preserves geometry, painting and local overrides. Requires a source hash from inspection. Never overwrites files, slices or prints.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, output: { type: 'string' }, expected_sha256: { type: 'string' }, changes: { type: 'object', properties: settingsSchema, additionalProperties: false, minProperties: 1 } }, required: ['source', 'output', 'expected_sha256', 'changes'], additionalProperties: false } },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    const args = params.arguments ?? {};
    let result;
    if (params.name === 'studio_setting_schema') result = settingsSchema;
    else if (params.name === 'studio_inspect_project') result = await inspectProject(args.source);
    else if (params.name === 'studio_edit_project') result = await editProject(args);
    else throw new Error('Unknown tool.');
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
});
await server.connect(new StdioServerTransport());
