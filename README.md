# Bambu Studio MCP

An early local MCP integration for Bambu Studio and a Bambu Lab P2S. Combines a
custom project-settings editor with a pinned installation of the third-party
[bambu-printer-mcp](https://github.com/DMontgomery40/bambu-printer-mcp).

The editor supports a bounded set of settings. It is not a complete Studio API,
an autonomous print monitor, or a direct Bambu Handy integration.

## Install

Requires Node.js 22 or newer. The printer launcher and slicer smoke check target
macOS with Bambu Studio in `/Applications/BambuStudio.app`. The project editor
and automated tests do not require Studio or a printer.

```sh
npm ci --ignore-scripts
node node_modules/bambu-printer-mcp/scripts/install-patches.mjs
npm test
```

The explicit patch step installs the upstream package's required compatibility
patch for its pinned printer dependency. Dependency versions and integrity
hashes are recorded in `package-lock.json`.

## Add to Codex

From this repository directory:

```sh
codex mcp add bambu-studio-projects -- "$(command -v node)" "$PWD/studio-server.mjs"
codex mcp add bambu-p2s -- "$(command -v node)" "$PWD/launch.mjs"
```

Reload MCP connections or restart Codex; check `codex mcp list`. Registrations
use absolute paths: keep the checkout in place or register again after moving
it. Other MCP clients can use the same Node executable and server paths as
stdio commands. No public endpoint is needed.

## Project tools

| Tool | Purpose |
| --- | --- |
| `studio_setting_schema` | Supported setting names, typed inputs and conservative limits |
| `studio_inspect_project` | All embedded global settings, object/part metadata, plates and source hash |
| `studio_edit_project` | Validated global edits to a **new** unsliced P2S 3MF |

Supported controls (22): layer/first-layer height, wall count, top/bottom shell
layers, infill density/pattern, support enable/type/angle/build-plate restriction,
support top/bottom gaps and interface layers, seam position, outer/inner wall
speeds, infill/first-layer speeds, brim width and separation.

Example request:

> Inspect this P2S project. Save a new copy with 0.16 mm layers, 3 walls and 20%
> gyroid infill. Show the changes and any object overrides before slicing it.

Edits require the inspected source hash, reject existing output files and
projects containing G-code, and preserve geometry and painting. Each field must
already exist in the project. Slice summaries are invalidated; thumbnails may
remain stale until regenerated in Studio.

**Local overrides remain in effect.** Global edits do not supersede objects,
parts, painted regions or layer ranges. Bounds are conservative local editing
limits, not a complete extraction of Studio validation or a print-quality
guarantee. Inspect the resulting slice before printing.

## Printer and slicing tools

`launch.mjs` starts upstream `bambu-printer-mcp@1.1.36`, configured for P2S and
Bambu Studio. Its 46 tools include slicing, profile inspection, AMS mapping,
status and camera access; printer features depend on connectivity.

```sh
npm run smoke
# Optional local slice: P2S 0.4 mm, PLA Basic, textured plate
node smoke-test.mjs --slice /absolute/path/to/model.stl
```

Neither check sends printer commands. Outputs persist in ignored `output/`.
A restricted macOS sandbox can cause Studio to abort even when the same local
slicing command works outside the sandbox.

For optional direct LAN access, copy `printer.example.json` to
`printer.local.json` and supply the actual address, serial, nozzle and plate.
The launcher reads the matching saved LAN access code from Studio or accepts
`BAMBU_TOKEN` in its environment. Credentials are not stored in this repository.

Direct control depends on firmware and LAN/Developer Mode. LAN Only disconnects
cloud/Handy access; preserve the existing mode if you want Handy. Printer
configuration is optional for local editing. Direct printer commands have not
been validated on the development printer; its Studio Device page was inspected.

## Verification and limits

- Automated tests cover archive preservation, source immutability, types/ranges,
  stale hashes, overwrite refusal, refusal of sliced projects and MCP startup.
- Tests generate a synthetic archive; it is a format test, not a printable model.
  GitHub Actions runs these tests on Node 22 without Studio.
- Separate local validation used a real P2S project with 557 settings. Studio
  successfully sliced changes to layers, walls, supports and infill; exported
  settings and G-code retained those values. No print was sent.
- Studio emitted `Invalid T command (T65535)` even on the successful slice.
  This warning remains undiagnosed. Treat this as an early version.

Still to build: per-object editing, modifier creation, adaptive-layer editing,
colour/support/seam painting, structured preview analysis, reliable live
telemetry, spool inventory, print history and failure monitoring. Existing
spatial project data is preserved, but not decoded or edited.

## Repository scope

Includes source, tests, documentation and dependency locks. Excludes printer
credentials, local settings, templates, models, generated G-code, logs and
installed dependencies. Custom source is private and not licensed for
redistribution. Dependencies retain their own licenses; upstream
`bambu-printer-mcp` identifies itself as GPL-2.0.

References: [Bambu 3MF implementation](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Format/bbs_3mf.cpp),
[Studio CLI](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage),
[Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp).
