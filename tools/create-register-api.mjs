import { readFileSync } from 'node:fs';
import { APP_ID, ensure, list } from './snc.mjs';
const wsdef = await ensure('sys_ws_definition', 'service_id=ftreg^sys_scope=' + APP_ID, {
  name: 'Family Trivia Registration', service_id: 'ftreg', sys_scope: APP_ID, active: 'true',
});
await ensure('sys_ws_operation', 'web_service_definition=' + wsdef.sys_id + '^name=register', {
  name: 'register', web_service_definition: wsdef.sys_id, http_method: 'POST',
  relative_path: '/register', sys_scope: APP_ID, active: 'true',
  operation_script: readFileSync('src/rest/register.js', 'utf8'),
  requires_authentication: 'false', requires_acl_authorization: 'false',
});
// See create-test-api.mjs: sys_ws_definition.namespace is server-calculated
// from the app's vendor prefix and can differ from the full scope name, so
// read the real operation_uri back instead of assuming a path.
const [op] = await list('sys_ws_operation', 'web_service_definition=' + wsdef.sys_id + '^name=register', 'operation_uri');
if (!op) throw new Error('Scripted REST operation "register" missing after ensure(); check sys_ws_operation on the instance.');
console.log('register API at ' + op.operation_uri);
