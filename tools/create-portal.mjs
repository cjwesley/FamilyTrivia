import { readFileSync } from 'node:fs';
import { APP_ID, ensure, list } from './snc.mjs';
const theme = await ensure('sp_theme', 'name=Family Trivia', {
  name: 'Family Trivia', sys_scope: APP_ID, css_variables: '',
});
// sp_theme has no css field; theme CSS lives in sp_css, linked to the theme
// via sp_css_include + m2m_sp_theme_css_include. theme.css is plain CSS, so
// skip SCSS compilation and serve it raw via the record's .spcssdbx endpoint
// (source=url include, same pattern as OOB ec-theme-lato-fonts) — the
// source=local compile path serves empty for this scoped record.
const css = await ensure('sp_css', 'name=Family Trivia Theme', {
  name: 'Family Trivia Theme', sys_scope: APP_ID,
  css: readFileSync('src/portal/theme.css', 'utf8'),
  turn_off_scss_compilation: 'true',
});
const inc = await ensure('sp_css_include', 'sp_css=' + css.sys_id, {
  name: 'Family Trivia Theme', sp_css: css.sys_id, sys_scope: APP_ID,
  source: 'url', url: '/' + css.sys_id + '.spcssdbx',
});
await ensure('m2m_sp_theme_css_include',
  'sp_theme=' + theme.sys_id + '^sp_css_include=' + inc.sys_id, {
  sp_theme: theme.sys_id, sp_css_include: inc.sys_id, order: 100, sys_scope: APP_ID,
});
const home = (await list('sp_page', 'id=ft_home', 'sys_id'))[0];
await ensure('sp_portal', 'url_suffix=trivia', {
  title: 'Family Trivia', url_suffix: 'trivia', sys_scope: APP_ID,
  theme: theme.sys_id, ...(home ? { homepage: home.sys_id } : {}),
});
console.log('portal /trivia ensured');
