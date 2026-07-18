import { APP_ID, list, sn } from './snc.mjs';
// sys_ws_definition.namespace is server-calculated from the app's vendor
// prefix and can differ from the full scope name (SCOPE), so look up the
// real operation_uri instead of assuming /api/<SCOPE>/ftest/run.
const [op] = await list('sys_ws_operation', `name=run^sys_scope=${APP_ID}`, 'operation_uri');
if (!op) throw new Error('Scripted REST operation "run" not found; run tools/create-test-api.mjs first.');
const r = await sn('GET', op.operation_uri);
for (const s of r.suites) {
  console.log(`${s.passed ? 'PASS' : 'FAIL'}  ${s.name} (${s.total} tests)`);
  for (const f of s.failures) console.log('   - ' + f);
}
process.exit(r.passed ? 0 : 1);
