import { APP_ID, ensure, list } from './snc.mjs';
// 3rd positional arg is normally a comma-separated roles list (never used by
// any caller to date); the literal value "public" is reserved instead to
// mark the page publicly (unauthenticated) accessible, matching sp_page's
// own `public` field. Backward compatible: omitted or any non-"public"
// value behaves exactly as before.
const [, , pageId, widgetId, arg3] = process.argv;
const isPublic = arg3 === 'public';
const roles = arg3 && !isPublic ? arg3 : undefined;
const page = await ensure('sp_page', 'id=' + pageId, {
  id: pageId, title: pageId, sys_scope: APP_ID,
  ...(roles ? { roles } : {}),
  ...(isPublic ? { public: 'true' } : {}),
});
const container = await ensure('sp_container', 'sp_page=' + page.sys_id, {
  sp_page: page.sys_id, sys_scope: APP_ID,
});
const row = await ensure('sp_row', 'sp_container=' + container.sys_id, {
  sp_container: container.sys_id, sys_scope: APP_ID,
});
const col = await ensure('sp_column', 'sp_row=' + row.sys_id, {
  sp_row: row.sys_id, size: 12, sys_scope: APP_ID,
});
const widget = (await list('sp_widget', 'id=' + widgetId, 'sys_id'))[0];
if (!widget) throw new Error('widget not deployed: ' + widgetId);
await ensure('sp_instance', 'sp_column=' + col.sys_id, {
  sp_column: col.sys_id, sp_widget: widget.sys_id, id: pageId + '_inst', sys_scope: APP_ID,
});
console.log('page ' + pageId + ' -> widget ' + widgetId);
