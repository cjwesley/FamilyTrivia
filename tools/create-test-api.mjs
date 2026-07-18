import { readFileSync } from 'node:fs';
import { APP_ID, ensure, list } from './snc.mjs';
const wsdef = await ensure('sys_ws_definition', 'service_id=ftest^sys_scope=' + APP_ID, {
  name: 'Family Trivia Tests', service_id: 'ftest', sys_scope: APP_ID, active: 'true',
});
await ensure('sys_ws_operation', 'web_service_definition=' + wsdef.sys_id + '^name=run', {
  name: 'run', web_service_definition: wsdef.sys_id, http_method: 'GET',
  relative_path: '/run', sys_scope: APP_ID, active: 'true',
  operation_script: readFileSync('src/rest/test_run.js', 'utf8'),
  requires_authentication: 'true', requires_acl_authorization: 'false',
});
// sys_ws_definition.namespace is server-calculated from the app's vendor
// prefix (e.g. "tekvo") and ignores any value passed via the Table API, so
// it can differ from the full scope name (SCOPE). Read the real path back
// instead of assuming it equals /api/<SCOPE>/ftest/run.
const [op] = await list('sys_ws_operation', 'web_service_definition=' + wsdef.sys_id + '^name=run', 'operation_uri');
console.log('test API at ' + (op ? op.operation_uri : '/api/<namespace>/ftest/run'));
