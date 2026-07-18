import { SCOPE, APP_ID, ensure } from './snc.mjs';
const script = `
var g = new GlideRecord('${SCOPE}_game');
g.addQuery('state', '!=', 'finished');
g.addQuery('sys_updated_on', '<', gs.hoursAgoStart(1));
g.query();
while (g.next()) {
  if (g.getValue('state') === 'lobby') { g.setValue('state', 'finished'); g.update(); }
  else new TriviaEngine().finish(g.getUniqueValue());
}
`;
await ensure('sysauto_script', 'name=Family Trivia stale game cleanup', {
  name: 'Family Trivia stale game cleanup', sys_scope: APP_ID, active: 'true',
  script, run_type: 'periodically', run_period: '1970-01-01 01:00:00',
});
console.log('cleanup job ensured');
