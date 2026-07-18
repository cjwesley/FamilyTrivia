import { readFileSync } from 'node:fs';
import { APP_ID, ensure, list } from './snc.mjs';
const theme = await ensure('sp_theme', 'name=Family Trivia', {
  name: 'Family Trivia', sys_scope: APP_ID, css_variables: '',
  css: readFileSync('src/portal/theme.css', 'utf8'),
});
const home = (await list('sp_page', 'id=ft_home', 'sys_id'))[0];
await ensure('sp_portal', 'url_suffix=trivia', {
  title: 'Family Trivia', url_suffix: 'trivia', sys_scope: APP_ID,
  theme: theme.sys_id, ...(home ? { homepage: home.sys_id } : {}),
});
console.log('portal /trivia ensured');
