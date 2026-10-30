import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { inspectProject, editProject } from '../project-tools.mjs';

test('project edits preserve geometry and overrides, reject stale/invalid writes', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-project-test-'));
  try {
    const source = path.join(temp, 'fixture.3mf');
    const fixture = new JSZip();
    fixture.file('Metadata/project_settings.config', JSON.stringify({
      printer_model: 'Bambu Lab P2S', nozzle_diameter: ['0.4'],
      layer_height: '0.2', wall_loops: '2', enable_support: '0', sparse_infill_density: '15%',
      machine_start_gcode: 'G28',
    }));
    fixture.file('Metadata/model_settings.config', '<config><object id="1"><metadata key="wall_loops" value="4"/><part id="1" subtype="normal_part"/></object></config>');
    fixture.file('3D/3dmodel.model', '<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2" paint_color="4"/></triangles></mesh></object></resources></model>');
    fixture.file('Metadata/slice_info.config', '<config/>');
    await fs.writeFile(source, await fixture.generateAsync({ type: 'nodebuffer' }));
    const initial = await inspectProject(source);
    const output = path.join(temp, 'edited.3mf');
    const request = { source, output, expected_sha256: initial.sha256, changes: { layer_height: 0.16, wall_loops: 3, enable_support: true, sparse_infill_density: 20 } };
    const result = await editProject(request);
    assert.equal(result.diff.length, 4);
    const edited = await inspectProject(output);
    assert.equal(edited.settings.layer_height, '0.16');
    assert.equal(edited.settings.enable_support, '1');
    assert.equal(edited.settings.sparse_infill_density, '20%');
    assert.deepEqual(edited.objects_and_plates, initial.objects_and_plates);
    const before = await JSZip.loadAsync(await fs.readFile(source));
    const after = await JSZip.loadAsync(await fs.readFile(output));
    for (const name of Object.keys(before.files).filter(n => n !== 'Metadata/project_settings.config' && n !== 'Metadata/slice_info.config' && !before.files[n].dir)) {
      assert.deepEqual(await after.file(name).async('nodebuffer'), await before.file(name).async('nodebuffer'), name);
    }
    assert.equal((await inspectProject(source)).sha256, initial.sha256);
    await assert.rejects(editProject(request), /EEXIST/);
    await assert.rejects(editProject({ ...request, expected_sha256: 'stale' }), /changed/);
    await assert.rejects(editProject({ ...request, changes: { layer_height: 0.4 } }), /nozzle/);
    await assert.rejects(editProject({ ...request, changes: { enable_support: 'false' } }), /boolean/);
    await assert.rejects(editProject({ ...request, changes: { machine_start_gcode: 'G28' } }), /Unsupported/);
    await assert.rejects(editProject({ ...request, changes: { wall_loops: 2.5 } }), /numeric/);
    before.file('Metadata/plate_1.gcode', 'G28');
    const sliced = path.join(temp, 'sliced.3mf');
    await fs.writeFile(sliced, await before.generateAsync({type:'nodebuffer'}));
    const snap = await inspectProject(sliced);
    await assert.rejects(editProject({ ...request, source: sliced, expected_sha256: snap.sha256 }), /G-code/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
