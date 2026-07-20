// Wires up the stock SPEntryPage post-login router (unset by default on this
// instance). Root cause this fixes: with glide.entry.first.page.script unset,
// mobile logins land on the ServiceNow mobile page instead of returning to the
// pending /trivia?... target. SPEntryPage (global, ships with Service Portal):
//   - pending Service Portal target (nav_to) -> return to it after login
//   - role-holding user, non-portal target  -> stock platform behavior
//   - role-less user, no target             -> instance default portal (sp)
// INSTANCE-WIDE setting; revert by deleting the property. We deliberately do
// NOT touch glide.entry.page.script (login page choice) or portal defaults.
import { ensure, sn } from './snc.mjs';

await ensure('sys_properties', 'name=glide.entry.first.page.script', {
  name: 'glide.entry.first.page.script',
  value: 'new SPEntryPage().getFirstPageURL()',
  type: 'string',
  description: 'Post-login landing router (stock Service Portal SPEntryPage). Set for the Family Trivia app so portal logins return to their target page instead of the mobile UI. Managed by FamilyTrivia/tools/create-entry-page-config.mjs.',
});
console.log('glide.entry.first.page.script set to stock SPEntryPage router');

// property changes can be cached; flush like create-portal.mjs does
try { await sn('GET', '/cache.do'); console.log('cache flushed'); }
catch (e) { console.log('cache flush skipped (' + e.message.slice(0, 60) + ') - property takes effect within a few minutes'); }
