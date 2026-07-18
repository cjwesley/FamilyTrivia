import { sn, list } from './snc.mjs';
const [, , cmd, ...args] = process.argv;
if (cmd === 'ping') {
  const r = await list('sys_user', 'active=true', 'sys_id');
  console.log('auth OK, sample rows: ' + r.length);
} else if (cmd === 'get') {
  console.log(JSON.stringify(await list(args[0], args[1] || '', args[2] || ''), null, 2));
} else {
  console.log('usage: node tools/sn-cli.mjs ping | get <table> [query] [fields]');
}
