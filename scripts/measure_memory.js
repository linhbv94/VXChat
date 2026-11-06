'use strict';
// Metadata only: never reads process arguments, heap, cookies or memory contents.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const root = Number(process.argv[2]);
const output = process.argv[3];
if (!Number.isSafeInteger(root) || root <= 1 || !output) throw new Error('Usage: node scripts/measure_memory.js APP_PID OUTPUT_JSON');
const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' }).trim().split('\n').map(line => {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
  return m ? { pid: +m[1], parent_pid: +m[2], rss_kib: +m[3], executable: m[4] } : null;
}).filter(Boolean);
const primary = rows.find(r => r.pid === root);
if (!primary || !/\/(?:Electron|VXChat)(?:\.exe)?$/.test(primary.executable)) throw new Error('Expected a live VXChat/Electron primary PID');
const selected = new Set([root]);
for (let changed = true; changed;) { changed = false; for (const r of rows) if (selected.has(r.parent_pid) && !selected.has(r.pid)) { selected.add(r.pid); changed = true; } }
const processes = rows.filter(r => selected.has(r.pid));
const args = ['--noCategories', '--swapped', '--format', 'bytes', ...processes.flatMap(r => ['-p', String(r.pid)])];
let footprint = null; let physicalFootprintBytes = null; let footprintError = null;
try {
  footprint = execFileSync('/usr/bin/footprint', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
  const match = /Summary Footprint:\s*(\d+)\s*(?:B|bytes)?/i.exec(footprint);
  if (match) physicalFootprintBytes = Number(match[1]);
} catch (error) { footprintError = String(error.code || error.status || 'measurement_failed'); }
const report = { measured_at: new Date().toISOString(), root_pid: root, process_count: processes.length, rss_sum_mib: processes.reduce((n,r) => n + r.rss_kib, 0) / 1024, physical_footprint_bytes: physicalFootprintBytes, footprint_error: footprintError, caveats: ['RSS may count shared pages more than once.', 'Instantaneous measurement; aggregate individual peaks is not a simultaneous peak.', 'Workload/service tabs must be recorded separately; this tool does not inspect chat contents.'], processes: processes.map(({ executable, ...p }) => ({ ...p, role: executable.includes('Renderer') ? 'renderer' : executable.includes('Helper') ? 'helper_gpu_or_utility' : 'primary' })), footprint };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ report: output, process_count: report.process_count, rss_sum_mib: report.rss_sum_mib, physical_footprint_bytes: physicalFootprintBytes, footprint_error: footprintError }));
if (footprintError || physicalFootprintBytes === null) process.exitCode = 1;
