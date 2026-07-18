import { APP_ID, ensure, list } from './snc.mjs';
const [, , pageId, widgetId, roles] = process.argv;
const page = await ensure('sp_page', 'id=' + pageId, {
  id: pageId, title: pageId, sys_scope: APP_ID, ...(roles ? { roles } : {}),
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
