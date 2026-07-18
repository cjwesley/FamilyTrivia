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
// Optional lib.js (vendored browser libraries, e.g. the local QR encoder) is
// prepended to the widget's client script so it loads before the controller.
const lib = read('lib.js');
const clientScript = lib ? lib + '\n' + read('client.js') : read('client.js');
await ensure('sp_widget', 'id=' + meta.id, {
  id: meta.id, name: meta.name, sys_scope: APP_ID,
  template: read('template.html'), css: read('css.scss'),
  client_script: clientScript, script: read('server.js'),
  public: isPublic ? 'true' : 'false',
});
console.log('deployed widget: ' + meta.id + (isPublic ? ' (public)' : ''));
