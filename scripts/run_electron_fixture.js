'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fixture = process.argv[2];
if (!['electron_lifecycle', 'electron_shell', 'electron_updates'].includes(fixture)) throw new Error('unknown_fixture');
const prefix = fixture === 'electron_shell' ? 'vxchat_shell_fixture_' : 'vxchat_electron_fixture_';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const child = spawn(process.execPath, [require.resolve('electron/cli.js'), path.join(__dirname, '..', 'tests', `${fixture}.js`)], {
  env: { ...process.env, VXCHAT_FIXTURE_DIR: temporary },
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
});
let output = ''; let timedOut = false;
child.stdout.on('data', data => { output += data; process.stdout.write(data); });
child.stderr.on('data', data => process.stderr.write(data));
function stop(signal) {
  try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch { /* Already exited. */ }
}
const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); }, 60000);
const hardTimer = setTimeout(() => { timedOut = true; stop('SIGKILL'); }, 65000);
child.on('exit', () => { clearTimeout(timer); clearTimeout(hardTimer); stop('SIGTERM'); });
child.on('close', code => {
  clearTimeout(timer); clearTimeout(hardTimer);
  let ok = !timedOut && code === 0;
  try {
    const results = output.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    ok = ok && results.some(result => result.result === 'PASS');
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) { console.error(error.message); ok = false; }
  console.log(JSON.stringify({ fixture, exited_cleanly: ok, native_exit_code: code, timed_out: timedOut }));
  process.exitCode = ok ? 0 : 1;
});
child.on('error', error => { console.error(error.message); stop('SIGTERM'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(signal); process.exitCode = 1; });
