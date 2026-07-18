// TriviaRegistrationTest creates throwaway sys_user accounts (email domain
// @famtriv-test.example) to exercise TriviaRegistration.register(). The
// scoped app has cross-scope create/write/read privilege on sys_user and
// sys_user_has_role (needed for registration itself) but no cross-scope
// DELETE privilege on either OOB table, so the test's own in-scope cleanup
// (GlideRecord.deleteRecord() from TriviaRegistrationTest.server.js) cannot
// remove them -- it silently no-ops rather than throwing. This script
// hard-deletes them via the Table API instead, which runs outside the
// scope boundary under the same admin OAuth used for build/deploy. Run it
// after `node tools/run-tests.mjs` whenever TriviaRegistrationTest ran.
//
// sys_user_has_role rows for a deleted user are cascade-removed by the
// platform automatically (verified empirically); this script does not need
// to delete them separately.
import { list, del } from './snc.mjs';

const users = await list('sys_user', 'emailENDSWITH@famtriv-test.example', 'sys_id,user_name');
if (!users.length) {
  console.log('no @famtriv-test.example residue found');
  process.exit(0);
}
for (const u of users) {
  await del('sys_user', u.sys_id);
  console.log('deleted', u.user_name, u.sys_id);
}
console.log(`cleaned up ${users.length} test user(s)`);
