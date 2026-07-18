import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { APP_ID, ensure } from './snc.mjs';
const dir = process.argv[2];
const meta = JSON.parse(readFileSync(join(dir, 'widget.json'), 'utf8'));
const read = f => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '';
await ensure('sp_widget', 'id=' + meta.id, {
  id: meta.id, name: meta.name, sys_scope: APP_ID,
  template: read('template.html'), css: read('css.scss'),
  client_script: read('client.js'), script: read('server.js'),
  public: 'false',
});
console.log('deployed widget: ' + meta.id);
