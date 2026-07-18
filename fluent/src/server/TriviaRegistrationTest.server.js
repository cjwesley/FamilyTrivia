var TriviaRegistrationTest = Class.create();
TriviaRegistrationTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  // One group + one lobby-state game with a fresh invite token, owned/hosted
  // by a persistent famtriv.test.* fixture user (never deleted, same
  // convention as sibling suites). Only the group/game/registration rows
  // created below are cleaned up, in _cleanupSeed.
  _seedLobbyGame: function(tag) {
    var s = this._scope();
    var ownerId = this._ensureTestUser('regOwn' + tag);
    var grp = new GlideRecord(s + '_group');
    grp.initialize();
    grp.setValue('name', 'ZZ RegGrp ' + tag);
    grp.setValue('owner', ownerId);
    grp.setValue('active', true);
    var groupId = grp.insert();
    var token = new TriviaGroups().newToken();
    var g = new GlideRecord(s + '_game');
    g.initialize();
    g.setValue('code', 'RG' + tag.substring(0, 2).toUpperCase());
    g.setValue('host', ownerId);
    g.setValue('group', groupId);
    g.setValue('invite_token', token);
    g.setValue('mode', 'uniform');
    g.setValue('question_count', 10);
    g.setValue('seconds_per_question', 20);
    g.setValue('state', 'lobby');
    g.setValue('current_round', 0);
    var gameId = g.insert();
    return { groupId: groupId, ownerId: ownerId, gameId: gameId, token: token };
  },
  _setGameState: function(gameId, state) {
    var g = new GlideRecord(this._scope() + '_game');
    if (g.get(gameId)) { g.setValue('state', state); g.update(); }
  },
  _cleanupSeed: function(seed) {
    var s = this._scope();
    if (seed.gameId) {
      var log = new GlideRecord(s + '_registration_log');
      log.addQuery('game', seed.gameId); log.query();
      while (log.next()) log.deleteRecord();
      var g = new GlideRecord(s + '_game');
      if (g.get(seed.gameId)) g.deleteRecord();
    }
    if (seed.groupId) {
      var m = new GlideRecord(s + '_group_member');
      m.addQuery('group', seed.groupId); m.query();
      while (m.next()) m.deleteRecord();
      var grp = new GlideRecord(s + '_group');
      if (grp.get(seed.groupId)) grp.deleteRecord();
    }
  },
  // Deletes every sys_user this suite created -- identified by the
  // throwaway @famtriv-test.example email domain, never the persistent
  // famtriv.test.* fixture users -- plus their role grants and profiles.
  //
  // KNOWN LIMITATION: this scoped app has cross-scope create/write/read
  // privilege on sys_user and sys_user_has_role (needed for registration
  // itself) but no cross-scope DELETE privilege on either OOB table
  // (verified via sys_scope_privilege -- no operation=delete rows exist for
  // sys_user or sys_user_has_role). deleteRecord() on those two tables
  // below is therefore a best-effort no-op here; it silently returns
  // without deleting or throwing. Deleting them for real requires the
  // Table API from outside the scope (see tools/cleanup-famtriv-test-users.mjs,
  // which uses the same admin OAuth this app is built/deployed with -- run
  // it after exercising this suite to leave zero residue). Registration
  // itself never needs delete rights: production revocation of a bad
  // registration is meant to go through registration_log-driven
  // bulk-disable, not sys_user deletion (see plan's Global Constraints).
  _cleanupRegisteredUsers: function() {
    var s = this._scope();
    var u = new GlideRecord('sys_user');
    u.addQuery('email', 'ENDSWITH', '@famtriv-test.example');
    u.query();
    while (u.next()) {
      var uid = u.getUniqueValue();
      var role = new GlideRecord('sys_user_has_role');
      role.addQuery('user', uid); role.query();
      while (role.next()) role.deleteRecord();
      var prof = new GlideRecord(s + '_profile');
      prof.addQuery('user', uid); prof.query();
      while (prof.next()) prof.deleteRecord();
      u.deleteRecord();
    }
  },
  _countRegisteredUsers: function() {
    var u = new GlideRecord('sys_user');
    u.addQuery('email', 'ENDSWITH', '@famtriv-test.example');
    u.query();
    var n = 0; while (u.next()) n++; return n;
  },

  testValidateStates: function() {
    var lobby = this._seedLobbyGame('Val' + gs.generateGUID().substring(0, 6));
    var started = this._seedLobbyGame('Val2' + gs.generateGUID().substring(0, 6));
    this._setGameState(started.gameId, 'in_question');
    try {
      var reg = new TriviaRegistration();
      var r1 = reg.validate(lobby.token);
      this.assert(r1.ok, 'lobby token validates ok');
      this.assertEqual(r1.gameId, lobby.gameId, 'validate returns the lobby game id');

      var r2 = reg.validate(started.token);
      this.assert(!r2.ok, 'started-game token is rejected');
      this.assertEqual(r2.reason, 'not_lobby', 'started game token reason is not_lobby');

      var r3 = reg.validate('this-token-does-not-exist-anywhere-0000000');
      this.assert(!r3.ok, 'garbage token is rejected');
      this.assertEqual(r3.reason, 'invalid', 'garbage token reason is invalid');
    } finally {
      this._cleanupSeed(lobby);
      this._cleanupSeed(started);
    }
  },

  testRegisterHappyPath: function() {
    var seed = this._seedLobbyGame('Happy' + gs.generateGUID().substring(0, 6));
    // Short local part: sys_user.user_name is OOB-capped at 40 chars, and the
    // normalized email is stored there verbatim, so local-part + the 21-char
    // '@famtriv-test.example' domain must stay well under that cap.
    var mixedCaseEmail = 'Hap' + gs.generateGUID().substring(0, 6) + '@FamTriv-Test.example';
    var normEmail = mixedCaseEmail.toLowerCase();
    var password = 'Fam-Test-Pw-9f2c!'; // literal throwaway string; only checked for hash presence + not-plaintext below, never echoed
    var ip = '203.0.113.10';
    try {
      var reg = new TriviaRegistration();
      var result = reg.register(seed.token, 'Happy Camper', mixedCaseEmail, password, ip);
      this.assert(result.ok, 'happy-path registration succeeds');
      this.assertEqual(result.userName, normEmail, 'returned userName is the lowercased email');

      var u = new GlideRecord('sys_user');
      u.addQuery('user_name', normEmail); u.query();
      this.assert(u.next(), 'sys_user row exists for the normalized user_name');
      this.assertEqual(u.getValue('email'), normEmail, 'sys_user email is normalized');
      this.assertEqual(u.getValue('first_name'), 'Happy Camper', 'sys_user first_name is the nickname');
      this.assert(u.getValue('active') == 'true' || u.getValue('active') === true || u.getValue('active') === '1', 'sys_user is active');
      this.assert(!!u.getValue('user_password'), 'login-capable account was created (password hash present)');
      // assert() not assertEqual(): a failure message must never echo either
      // the stored value or the throwaway literal.
      this.assert(u.getValue('user_password') !== password, 'stored password is not plaintext');
      var userId = u.getUniqueValue();

      var roleRec = new GlideRecord('sys_user_has_role');
      roleRec.addQuery('user', userId); roleRec.query();
      var roleCount = 0; var roleNames = [];
      while (roleRec.next()) { roleCount++; roleNames.push(roleRec.role.name.toString()); }
      this.assertEqual(roleCount, 1, 'exactly one role granted');
      this.assertEqual(roleNames[0], 'x_tekvo_famtriv.player', 'the granted role is x_tekvo_famtriv.player');

      var prof = new GlideRecord(this._scope() + '_profile');
      prof.addQuery('user', userId); prof.query();
      this.assert(prof.next(), 'profile row exists');
      this.assertEqual(prof.getValue('nickname'), 'Happy Camper', 'profile nickname matches');

      var log = new GlideRecord(this._scope() + '_registration_log');
      log.addQuery('user', userId); log.addQuery('game', seed.gameId); log.query();
      this.assert(log.next(), 'registration_log row written');
      this.assertEqual(log.getValue('ip'), ip, 'registration_log records the ip');

      var gp = new GlideRecord(this._scope() + '_game_player');
      gp.addQuery('game', seed.gameId); gp.addQuery('user', userId); gp.query();
      this.assert(!gp.next(), 'registration does not join the game');
    } finally {
      this._cleanupRegisteredUsers();
      this._cleanupSeed(seed);
    }
  },

  testDuplicateEmail: function() {
    var seed = this._seedLobbyGame('Dup' + gs.generateGUID().substring(0, 6));
    var email = 'Dup' + gs.generateGUID().substring(0, 6) + '@famtriv-test.example';
    var password = 'Fam-Test-Pw-77aq!';
    try {
      var reg = new TriviaRegistration();
      var first = reg.register(seed.token, 'First One', email, password, '198.51.100.20');
      this.assert(first.ok, 'first registration with this email succeeds');
      var before = this._countRegisteredUsers();

      var second = reg.register(seed.token, 'Second One', email.toUpperCase(), password, '198.51.100.21');
      this.assert(!second.ok, 'second registration with the same email is rejected');
      this.assertEqual(second.reason, 'duplicate_email', 'reason is duplicate_email');
      this.assertEqual(this._countRegisteredUsers(), before, 'no second sys_user was created');
    } finally {
      this._cleanupRegisteredUsers();
      this._cleanupSeed(seed);
    }
  },

  testRateLimitPerGame: function() {
    var seed = this._seedLobbyGame('Rate' + gs.generateGUID().substring(0, 6));
    var dummyUser = this._ensureTestUser('regRateDummy');
    try {
      for (var i = 0; i < 15; i++) {
        var log = new GlideRecord(this._scope() + '_registration_log');
        log.initialize();
        log.setValue('user', dummyUser);
        log.setValue('game', seed.gameId);
        log.setValue('ip', '198.51.100.' + (30 + i));
        log.insert();
      }
      var email = 'Rat' + gs.generateGUID().substring(0, 6) + '@famtriv-test.example';
      // Relative before/after count (not an absolute zero): a scoped app has
      // no cross-scope DELETE privilege on sys_user/sys_user_has_role (only
      // create/write/read -- confirmed via sys_scope_privilege), so
      // _cleanupRegisteredUsers cannot guarantee earlier tests' accounts are
      // gone by the time this one runs. A before/after delta is immune to
      // that and still proves this specific call created nothing.
      var before = this._countRegisteredUsers();
      var reg = new TriviaRegistration();
      var result = reg.register(seed.token, 'Rate Limited', email, 'Fam-Test-Pw-33zz!', '198.51.100.99');
      this.assert(!result.ok, 'registration blocked once the per-game cap is reached');
      this.assertEqual(result.reason, 'rate_limited', 'reason is rate_limited');
      this.assertEqual(this._countRegisteredUsers(), before, 'no sys_user created when rate limited');
      var u = new GlideRecord('sys_user');
      u.addQuery('user_name', email.toLowerCase()); u.query();
      this.assert(!u.next(), 'the specific rate-limited email has no sys_user row');
    } finally {
      this._cleanupRegisteredUsers();
      this._cleanupSeed(seed);
    }
  },

  type: 'TriviaRegistrationTest'
});
