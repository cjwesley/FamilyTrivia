import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { APP_ID, ensure } from './snc.mjs';
const dir = process.argv[2];
const meta = JSON.parse(readFileSync(join(dir, 'widget.json'), 'utf8'));
const read = f => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '';
// Optional "public": true in widget.json marks sp_widget.public=true
// (accessible without authorization). Default/absent -> 'false', matching
// every existing widget.json (backward compatible).
const isPublic = meta.public === true;
// Optional lib.js (vendored browser libraries, e.g. the local QR encoder).
// Service Portal evaluates client_script in EXPRESSION position (effectively
// `var x = <script>`), so the combined script must be a single expression:
// top-level statements like `var ...` are a SyntaxError that silently blanks
// the widget. lib.js must therefore be a bare assignment expression; it is
// composed with client.js (trailing semicolons stripped) via the comma
// operator: (lib, api.controller = function(){...}).
const lib = read('lib.js').trim().replace(/;+\s*$/, '');
const client = read('client.js').trim().replace(/;+\s*$/, '');
const clientScript = lib ? '(' + lib + ',\n' + client + ')' : read('client.js');
if (lib) new Function('var x = (' + clientScript + ')'); // fail deploy on the exact SP failure mode
await ensure('sp_widget', 'id=' + meta.id, {
  id: meta.id, name: meta.name, sys_scope: APP_ID,
  template: read('template.html'), css: read('css.scss'),
  client_script: clientScript, script: read('server.js'),
  public: isPublic ? 'true' : 'false',
});
console.log('deployed widget: ' + meta.id + (isPublic ? ' (public)' : ''));
