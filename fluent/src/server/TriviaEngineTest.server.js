var TriviaEngineTest = Class.create();
TriviaEngineTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  // Astral (4-byte) emoji must round-trip through the icon field without the
  // platform's FDD6/FDD7+base64 fallback encoding (requires a text-typed column).
  testCategoryIconRoundTrip: function() {
    var s = this._scope();
    var brain = String.fromCodePoint(0x1F9E0);
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ IconProbe'); c.setValue('icon', brain);
    c.setValue('active', false);
    var id = c.insert();
    try {
      var back = new GlideRecord(s + '_category');
      back.get(id);
      var icon = back.getValue('icon') || '';
      this.assert(icon.indexOf('﷖') === -1, 'icon not stored via FDD6 fallback encoding');
      this.assert(icon.indexOf(brain) !== -1, 'icon round-trips the emoji intact');
    } finally {
      var del = new GlideRecord(s + '_category');
      if (del.get(id)) del.deleteRecord();
    }
  },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  // one category + 4 MC questions (difficulty 3) with 2 options each, first
  // option correct, PLUS a 'ZZ EngGrp '+tag group owned by a fresh test user
  // (the group's "first test user"). createGame now gates on membership
  // before it inserts anything, so the owner is pre-granted membership here
  // and is the intended host actor for tests that build on this seed.
  _seed: function(tag) {
    var s = this._scope();
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ Eng ' + tag); c.setValue('active', true);
    var catId = c.insert();
    var correctIds = [];
    for (var i = 0; i < 4; i++) {
      var q = new GlideRecord(s + '_question');
      q.initialize(); q.setValue('text', 'EngQ' + tag + i); q.setValue('qtype', 'mc');
      q.setValue('category', catId); q.setValue('difficulty', 3);
      q.setValue('pool', 'game'); q.setValue('active', true);
      var qId = q.insert();
      for (var o = 0; o < 2; o++) {
        var op = new GlideRecord(s + '_question_option');
        op.initialize(); op.setValue('question', qId);
        op.setValue('text', 'Opt' + o); op.setValue('correct', o === 0); op.setValue('order', o);
        var opId = op.insert();
        if (o === 0) correctIds.push(opId);
      }
    }
    var ownerId = this._ensureTestUser(tag + 'GrpOwn');
    var grp = new GlideRecord(s + '_group');
    grp.initialize();
    grp.setValue('name', 'ZZ EngGrp ' + tag);
    grp.setValue('owner', ownerId);
    grp.setValue('active', true);
    var groupId = grp.insert();
    new TriviaGroups().ensureMember(ownerId, groupId);
    return { catId: catId, correctIds: correctIds, groupId: groupId, ownerId: ownerId };
  },
  _cleanup: function(catId, groupId) {
    var s = this._scope();
    var del = function(table, field, value) {
      var gr = new GlideRecord(s + '_' + table);
      gr.addQuery(field, value); gr.query();
      while (gr.next()) gr.deleteRecord();
    };
    del('response', 'question.category', catId);
    del('game_question', 'question.category', catId);
    del('question_option', 'question.category', catId);
    del('question', 'category', catId);
    del('category', 'sys_id', catId);
    var statsTables = ['player_stats', 'player_category_stats'];
    for (var st = 0; st < statsTables.length; st++) {
      var sgr = new GlideRecord(s + '_' + statsTables[st]);
      sgr.addQuery('user.user_name', 'STARTSWITH', 'famtriv.test'); sgr.query();
      while (sgr.next()) sgr.deleteRecord();
    }
    // games created by tests: host is a famtriv.test user
    var g = new GlideRecord(s + '_game');
    g.addQuery('host.user_name', 'STARTSWITH', 'famtriv.test'); g.query();
    while (g.next()) {
      del('game_player', 'game', g.getUniqueValue());
      g.deleteRecord();
    }
    if (groupId) {
      del('group_member', 'group', groupId);
      var grp = new GlideRecord(s + '_group');
      if (grp.get(groupId)) grp.deleteRecord();
    }
  },
  _correctOptionFor: function(gameId, round, userId) {
    var s = this._scope();
    var gq = new GlideRecord(s + '_game_question');
    gq.addQuery('game', gameId); gq.addQuery('round', round); gq.query();
    var qId = '';
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (pl === userId) { qId = gq.getValue('question'); break; }
      if (!pl) qId = gq.getValue('question'); // uniform row
    }
    var op = new GlideRecord(s + '_question_option');
    op.addQuery('question', qId); op.addQuery('correct', true);
    op.query(); op.next();
    return op.getUniqueValue();
  },
  _backdateQuestionStart: function(gameId, seconds) {
    var g = new GlideRecord(this._scope() + '_game'); g.get(gameId);
    var gdt = new GlideDateTime(); gdt.addSeconds(-seconds);
    g.setValue('question_started_at', gdt); g.update();
  },
  testFullUniformGame: function() {
    var seed = this._seed('U');
    var a = seed.ownerId, b = this._ensureTestUser('engB');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20, groupId: seed.groupId });
      this.assertEqual(made.code.length, 4, '4-char code');
      var joined = eng.joinGame(b, made.code);
      this.assertEqual(joined.gameId, made.gameId, 'join by code');
      eng.startGame(made.gameId, a);
      var st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'in_question', 'started');
      this.assertEqual(st.round, 1, 'round 1');
      this.assert(st.question && st.question.options.length === 2, 'question served');
      this.assert(JSON.stringify(st.question).indexOf('correct') === -1, 'no correct leak in question');
      // both answer round 1 correctly -> auto reveal
      var ra = eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 1, a), 1000);
      this.assert(ra.accepted && ra.correct && ra.points > 0, 'A scored');
      var dup = eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 1, a), 1000);
      this.assert(!dup.accepted, 'duplicate rejected');
      eng.answer(made.gameId, b, this._correctOptionFor(made.gameId, 1, b), 5000);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'reveal', 'all answered -> reveal');
      // host advances to round 2; only A answers; timeout closes the round without B
      eng.advance(made.gameId, a);
      eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, 2, a), 1000);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'in_question', 'round stays open until timeout');
      this._backdateQuestionStart(made.gameId, 30);
      eng.tick(made.gameId);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'reveal', 'timeout closed round, absent player scores 0');
      eng.advance(made.gameId, a);
      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'finished', 'game finished');
      this.assertEqual(st.podium[0].userId, a, 'A wins (faster + 2 correct)');
      this.assertEqual(eng.champion(seed.groupId).userId, a, 'champion is A');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  // Round progression must never depend on a client explicitly calling tick():
  // any state read (every player's 3s poll) must lazily close an expired round.
  // Regression for the 2026-07-20 live-game hang (clients burned their one-shot
  // tick inside the server's 2s grace window and rounds stuck at 0s forever).
  testGetStateClosesExpiredRound: function() {
    var seed = this._seed('L');
    var a = seed.ownerId, b = this._ensureTestUser('engLazy');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      eng.joinGame(b, made.code);
      eng.startGame(made.gameId, a);
      this._backdateQuestionStart(made.gameId, 30);
      // NO tick call - a plain state read must close the expired round
      var st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'reveal', 'getState lazily closed the expired round');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  testTickClosesExpiredQuestion: function() {
    var seed = this._seed('T');
    var a = seed.ownerId;
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      eng.startGame(made.gameId, a);
      this._backdateQuestionStart(made.gameId, 30);
      eng.tick(made.gameId);
      this.assertEqual(eng.getState(made.gameId, a).state, 'reveal', 'tick closed expired question');
      // backdate reveal_started_at by 10s -> tick finishes (only 1 round)
      var g = new GlideRecord(this._scope() + '_game'); g.get(made.gameId);
      var gdt = new GlideDateTime(); gdt.addSeconds(-10);
      g.setValue('reveal_started_at', gdt); g.update();
      eng.tick(made.gameId);
      this.assertEqual(eng.getState(made.gameId, a).state, 'finished', 'tick finished game');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  testAdaptiveServesPerPlayer: function() {
    var seed = this._seed('A');
    var a = seed.ownerId, b = this._ensureTestUser('engE');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'adaptive', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20, groupId: seed.groupId });
      eng.joinGame(b, made.code);
      eng.startGame(made.gameId, a);
      var s = this._scope();
      var gq = new GlideAggregate(s + '_game_question');
      gq.addQuery('game', made.gameId);
      gq.addAggregate('COUNT'); gq.query(); gq.next();
      this.assertEqual(gq.getAggregate('COUNT'), 4, '2 rounds x 2 players rows');
      var stA = eng.getState(made.gameId, a);
      var stB = eng.getState(made.gameId, b);
      this.assert(stA.question.gqId !== stB.question.gqId, 'per-player question rows');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  testSpectatorCannotAnswerAndQrJoins: function() {
    var seed = this._seed('S');
    var host = seed.ownerId, spectator = this._ensureTestUser('engSpectator');
    try {
      var eng = new TriviaEngine();
      var s = this._scope();
      // host-only 1-question game, started with just the host as a player
      var made = eng.createGame(host, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      eng.startGame(made.gameId, host);
      var st = eng.getState(made.gameId, host);
      this.assertEqual(st.state, 'in_question', 'game started with host only');
      // a QR/deep-link viewer who never joined tries to answer
      var correctOpt = this._correctOptionFor(made.gameId, 1, host);
      var res = eng.answer(made.gameId, spectator, correctOpt, 1000);
      this.assertEqual(res.accepted, false, 'spectator answer rejected');
      st = eng.getState(made.gameId, host);
      this.assertEqual(st.state, 'in_question', 'round did not close early from ghost response');
      var respCheck = new GlideRecord(s + '_response');
      respCheck.addQuery('game', made.gameId); respCheck.addQuery('player', spectator); respCheck.query();
      this.assert(!respCheck.next(), 'no response row written for spectator');

      // ensureJoined: a second game still sitting in the lobby
      var made2 = eng.createGame(host, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      eng.ensureJoined(made2.gameId, spectator);
      var gp = new GlideRecord(s + '_game_player');
      gp.addQuery('game', made2.gameId); gp.addQuery('user', spectator); gp.query();
      this.assert(gp.next(), 'ensureJoined added the spectator to the lobby game');
      eng.ensureJoined(made2.gameId, spectator); // idempotent
      var gpCount = new GlideAggregate(s + '_game_player');
      gpCount.addQuery('game', made2.gameId); gpCount.addQuery('user', spectator);
      gpCount.addAggregate('COUNT'); gpCount.query(); gpCount.next();
      this.assertEqual(parseInt(gpCount.getAggregate('COUNT'), 10), 1, 'ensureJoined is idempotent - exactly one row');

      // ensureJoined must NOT join a game that already started
      eng.ensureJoined(made.gameId, spectator);
      var gp3 = new GlideRecord(s + '_game_player');
      gp3.addQuery('game', made.gameId); gp3.addQuery('user', spectator); gp3.query();
      this.assert(!gp3.next(), 'ensureJoined does not join a game past the lobby state');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  // non-member cannot create a game in a group they haven't been added to
  testCreateRequiresMembership: function() {
    var seed = this._seed('M');
    var nonMember = this._ensureTestUser('engNonMember');
    try {
      var eng = new TriviaEngine();
      var res = eng.createGame(nonMember, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      this.assert(!!res.error, 'non-member cannot create a game in the group');
      this.assertEqual(res.error, 'Not a member of that group', 'exact error message');
      var g = new GlideRecord(this._scope() + '_game');
      g.addQuery('host', nonMember); g.addQuery('group', seed.groupId); g.query();
      this.assert(!g.next(), 'no game record was inserted for the rejected create');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  // joining a game (by code) auto-grants group membership to the joiner
  testJoinGrantsGroupMembership: function() {
    var seed = this._seed('J');
    var joiner = this._ensureTestUser('engJoiner');
    try {
      var eng = new TriviaEngine();
      var groups = new TriviaGroups();
      var made = eng.createGame(seed.ownerId, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      this.assert(!groups.isMember(joiner, seed.groupId), 'joiner is not yet a member before joining');
      var joined = eng.joinGame(joiner, made.code);
      this.assertEqual(joined.gameId, made.gameId, 'join by code succeeds');
      this.assert(groups.isMember(joiner, seed.groupId), 'joining the game grants group membership');
      var gm = new GlideRecord(this._scope() + '_group_member');
      gm.addQuery('user', joiner); gm.addQuery('group', seed.groupId); gm.query();
      this.assert(gm.next(), 'group_member row exists for the joiner');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  // lobby getState exposes a 40-char inviteToken that round-trips through
  // resolveInvite; once the game leaves the lobby the token is no longer
  // exposed on getState but resolveInvite still resolves it to the current state
  testResolveInviteAndLobbyToken: function() {
    var seed = this._seed('R');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(seed.ownerId, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed.groupId });
      var st = eng.getState(made.gameId, seed.ownerId);
      this.assertEqual(st.state, 'lobby', 'game starts in lobby');
      this.assert(!!st.inviteToken, 'lobby state exposes an inviteToken');
      this.assertEqual(st.inviteToken.length, 40, 'inviteToken is 40 chars');
      var resolved = eng.resolveInvite(st.inviteToken);
      this.assertEqual(resolved.gameId, made.gameId, 'resolveInvite round-trips to the same game');
      this.assertEqual(resolved.state, 'lobby', 'resolveInvite reports lobby state');
      eng.startGame(made.gameId, seed.ownerId);
      var st2 = eng.getState(made.gameId, seed.ownerId);
      this.assertEqual(st2.state, 'in_question', 'game started');
      this.assert(!st2.inviteToken, 'inviteToken is omitted once the game leaves lobby');
      var resolved2 = eng.resolveInvite(st.inviteToken);
      this.assertEqual(resolved2.gameId, made.gameId, 'resolveInvite still resolves the game after start');
      this.assertEqual(resolved2.state, 'in_question', 'resolveInvite reports the current state');
      var bad = eng.resolveInvite('');
      this.assertEqual(bad.error, 'invalid', 'empty token is rejected');
      var bad2 = eng.resolveInvite('not-a-real-token');
      this.assertEqual(bad2.error, 'invalid', 'garbage token is rejected');
    } finally { this._cleanup(seed.catId, seed.groupId); }
  },
  // two groups, two finished 1-player games with different winners ->
  // champion(g1) != champion(g2)
  testChampionScopedToGroup: function() {
    var seed1 = this._seed('C1');
    var seed2 = this._seed('C2');
    var winner2 = this._ensureTestUser('engChampB');
    try {
      var eng = new TriviaEngine();
      var groups = new TriviaGroups();

      var made1 = eng.createGame(seed1.ownerId, { mode: 'uniform', categories: [seed1.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed1.groupId });
      eng.startGame(made1.gameId, seed1.ownerId);
      eng.answer(made1.gameId, seed1.ownerId, this._correctOptionFor(made1.gameId, 1, seed1.ownerId), 1000);
      this.assertEqual(eng.getState(made1.gameId, seed1.ownerId).state, 'reveal', 'group1 game auto-revealed');
      eng.advance(made1.gameId, seed1.ownerId);
      this.assertEqual(eng.getState(made1.gameId, seed1.ownerId).state, 'finished', 'group1 game finished');

      groups.ensureMember(winner2, seed2.groupId);
      var made2 = eng.createGame(winner2, { mode: 'uniform', categories: [seed2.catId], questionCount: 1, secondsPerQuestion: 20, groupId: seed2.groupId });
      eng.startGame(made2.gameId, winner2);
      eng.answer(made2.gameId, winner2, this._correctOptionFor(made2.gameId, 1, winner2), 1000);
      this.assertEqual(eng.getState(made2.gameId, winner2).state, 'reveal', 'group2 game auto-revealed');
      eng.advance(made2.gameId, winner2);
      this.assertEqual(eng.getState(made2.gameId, winner2).state, 'finished', 'group2 game finished');

      var champ1 = eng.champion(seed1.groupId).userId;
      var champ2 = eng.champion(seed2.groupId).userId;
      this.assertEqual(champ1, seed1.ownerId, 'champion(g1) is g1 winner');
      this.assertEqual(champ2, winner2, 'champion(g2) is g2 winner');
      this.assert(champ1 !== champ2, 'champions differ across groups');
    } finally {
      this._cleanup(seed1.catId, seed1.groupId);
      this._cleanup(seed2.catId, seed2.groupId);
    }
  },
  type: 'TriviaEngineTest'
});
