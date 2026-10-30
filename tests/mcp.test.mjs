import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

test('Studio MCP initializes and serves its schema without Studio installed', async () => {
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../studio-server.mjs', import.meta.url))] }));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['studio_setting_schema', 'studio_inspect_project', 'studio_edit_project']);
    const result = await client.callTool({ name: 'studio_setting_schema', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(Object.keys(JSON.parse(result.content[0].text)).length, 22);
    const failed = await client.callTool({ name: 'studio_inspect_project', arguments: { source: '/nonexistent-project.3mf' } });
    assert.equal(failed.isError, true);
  } finally { await client.close(); }
});
