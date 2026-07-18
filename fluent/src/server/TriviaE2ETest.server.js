var TriviaE2ETest = Class.create();
TriviaE2ETest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _seed: function(tag) {
    // one category: 8 game-pool MC questions (difficulty 3, 2 options each,
    // first option correct) for the adaptive game, plus 1 practice-pool MC
    // question in the SAME category for the practice-isolation check.
    var s = this._scope();
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ E2E ' + tag); c.setValue('active', true);
    var catId = c.insert();
    for (var i = 0; i < 8; i++) {
      var q = new GlideRecord(s + '_question');
      q.initialize(); q.setValue('text', 'E2EGameQ' + tag + i); q.setValue('qtype', 'mc');
      q.setValue('category', catId); q.setValue('difficulty', 3);
      q.setValue('pool', 'game'); q.setValue('active', true);
      var qId = q.insert();
      for (var o = 0; o < 2; o++) {
        var op = new GlideRecord(s + '_question_option');
        op.initialize(); op.setValue('question', qId);
        op.setValue('text', 'Opt' + o); op.setValue('correct', o === 0); op.setValue('order', o);
        op.insert();
      }
    }
    var pq = new GlideRecord(s + '_question');
    pq.initialize(); pq.setValue('text', 'E2EPracQ' + tag); pq.setValue('qtype', 'mc');
    pq.setValue('category', catId); pq.setValue('difficulty', 3);
    pq.setValue('pool', 'practice'); pq.setValue('active', true);
    var pqId = pq.insert();
    for (var po = 0; po < 2; po++) {
      var pop = new GlideRecord(s + '_question_option');
      pop.initialize(); pop.setValue('question', pqId);
      pop.setValue('text', 'POpt' + po); pop.setValue('correct', po === 0); pop.setValue('order', po);
      pop.insert();
    }
    // group: createGame now gates on membership before it inserts anything,
    // so the owner (the game host below) is pre-granted membership here.
    var ownerId = this._ensureTestUser(tag + 'GrpOwn');
    var grp = new GlideRecord(s + '_group');
    grp.initialize();
    grp.setValue('name', 'ZZ E2EGrp ' + tag);
    grp.setValue('owner', ownerId);
    grp.setValue('active', true);
    var groupId = grp.insert();
    new TriviaGroups().ensureMember(ownerId, groupId);
    return { catId: catId, groupId: groupId, ownerId: ownerId };
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
    // famtriv.test.* stats rows: player_stats/player_category_stats (game
    // rollup) and practice_session/skill_rating (practice + adaptive rating).
    var statsTables = ['player_stats', 'player_category_stats', 'practice_session', 'skill_rating'];
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
  _wrongOptionFor: function(gameId, round, userId) {
    // mirrors _correctOptionFor but returns an incorrect option for the
    // player's own per-round question row (adaptive games serve one
    // game_question row per player per round).
    var s = this._scope();
    var gq = new GlideRecord(s + '_game_question');
    gq.addQuery('game', gameId); gq.addQuery('round', round); gq.query();
    var qId = '';
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (pl === userId) { qId = gq.getValue('question'); break; }
      if (!pl) qId = gq.getValue('question');
    }
    var op = new GlideRecord(s + '_question_option');
    op.addQuery('question', qId); op.addQuery('correct', false);
    op.query(); op.next();
    return op.getUniqueValue();
  },
  _backdateQuestionStart: function(gameId, seconds) {
    var g = new GlideRecord(this._scope() + '_game'); g.get(gameId);
    var gdt = new GlideDateTime(); gdt.addSeconds(-seconds);
    g.setValue('question_started_at', gdt); g.update();
  },
  _statsFor: function(userId) {
    // missing row == a user who has never won/played a rolled-up game yet;
    // treat as all-zero so before/after comparisons work whether or not a
    // player_stats row already exists.
    var st = new GlideRecord(this._scope() + '_player_stats');
    st.addQuery('user', userId); st.query();
    if (!st.next()) return { wins: 0, points: 0, correct: 0, cur: 0, longest: 0 };
    return {
      wins: parseInt(st.getValue('total_wins'), 10) || 0,
      points: parseInt(st.getValue('total_points'), 10) || 0,
      correct: parseInt(st.getValue('total_correct'), 10) || 0,
      cur: parseInt(st.getValue('current_win_streak'), 10) || 0,
      longest: parseInt(st.getValue('longest_win_streak'), 10) || 0
    };
  },
  _skillRatingExists: function(userId, categoryId) {
    var r = new GlideRecord(this._scope() + '_skill_rating');
    r.addQuery('user', userId); r.addQuery('category', categoryId);
    r.query();
    return r.next();
  },

  // Full-stack smoke test: seeds its own category/questions, plays a
  // complete adaptive game between two users (A always correct, B always
  // wrong), asserts the finished-game invariants (winner/champion/stats/
  // skill ratings), then proves practice sessions never touch the
  // leaderboard. Single test method by design: the game and the practice
  // isolation check share the same seeded users/category and before/after
  // stats snapshots, so splitting them would require re-deriving state.
  testAdaptiveGameLifecycleAndPracticeIsolation: function() {
    var seed = this._seed('X');
    var a = seed.ownerId, b = this._ensureTestUser('e2eB');
    try {
      var winsBeforeA = this._statsFor(a).wins;

      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'adaptive', categories: [seed.catId], questionCount: 3, secondsPerQuestion: 20, groupId: seed.groupId });
      this.assertEqual(made.code.length, 4, '4-char join code');
      var joined = eng.joinGame(b, made.code);
      this.assertEqual(joined.gameId, made.gameId, 'B joins by code');
      eng.startGame(made.gameId, a);

      var st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'in_question', 'game started, round 1 open');
      var totalRounds = st.totalRounds;
      this.assert(totalRounds >= 1, 'has at least one round');

      // Every round: A answers correctly, B answers incorrectly. Both
      // players answer every round, so TriviaEngine.answer's own
      // "all answered -> reveal" early-close fires automatically (no
      // question-timeout backdate+tick needed to leave in_question). The
      // host (A) then advances explicitly (advance() has no reveal-timeout
      // requirement), which on the final round triggers finish() inside
      // TriviaEngine._advance() -- again no backdate+tick needed. Both
      // helpers are still copied in above per the brief's required helper
      // set, for any future test in this class that DOES need to force a
      // timeout (e.g. a player who stops answering).
      for (var round = 1; round <= totalRounds; round++) {
        st = eng.getState(made.gameId, a);
        this.assertEqual(st.state, 'in_question', 'round ' + round + ' open before answers');
        var ra = eng.answer(made.gameId, a, this._correctOptionFor(made.gameId, round, a), 1000);
        this.assert(ra.accepted && ra.correct, 'A answers correctly, round ' + round);
        var rb = eng.answer(made.gameId, b, this._wrongOptionFor(made.gameId, round, b), 5000);
        this.assert(rb.accepted && !rb.correct, 'B answers incorrectly, round ' + round);
        st = eng.getState(made.gameId, a);
        this.assertEqual(st.state, 'reveal', 'both answered -> auto reveal, round ' + round);
        eng.advance(made.gameId, a);
      }

      st = eng.getState(made.gameId, a);
      this.assertEqual(st.state, 'finished', 'game finished');
      this.assertEqual(st.winner, a, 'A is the winner');
      this.assertEqual(st.podium[0].userId, a, 'A tops the podium');
      this.assertEqual(eng.champion(seed.groupId).userId, a, 'champion() returns A');

      var statsAfterA = this._statsFor(a);
      this.assertEqual(statsAfterA.wins, winsBeforeA + 1, "A's total_wins incremented by exactly 1 vs. before-snapshot");

      var statsAfterB = this._statsFor(b);
      this.assertEqual(statsAfterB.cur, 0, "B's current_win_streak is 0 after a loss");

      this.assert(this._skillRatingExists(a, seed.catId), 'skill_rating row exists for A in the test category');
      this.assert(this._skillRatingExists(b, seed.catId), 'skill_rating row exists for B in the test category');

      // Practice isolation: one practice answer for B in the SAME test
      // category must NOT change player_stats at all (practice never
      // touches the leaderboard).
      var statsBeforePractice = this._statsFor(b);
      var pr = new TriviaPractice();
      var sess = pr.startSession(b, seed.catId);
      this.assert(!!sess.sessionId, 'practice session created');
      var nq = pr.nextQuestion(sess.sessionId, b);
      this.assert(nq.question && nq.question.options.length, 'practice question served');
      pr.answerQuestion(sess.sessionId, b, nq.question.id, nq.question.options[0].id, 3000);
      var statsAfterPractice = this._statsFor(b);
      this.assertEqual(statsAfterPractice.wins, statsBeforePractice.wins, 'practice does not change total_wins');
      this.assertEqual(statsAfterPractice.points, statsBeforePractice.points, 'practice does not change total_points');
      this.assertEqual(statsAfterPractice.correct, statsBeforePractice.correct, 'practice does not change total_correct');
      this.assertEqual(statsAfterPractice.cur, statsBeforePractice.cur, 'practice does not change current_win_streak');
      this.assertEqual(statsAfterPractice.longest, statsBeforePractice.longest, 'practice does not change longest_win_streak');
    } finally {
      this._cleanup(seed.catId, seed.groupId);
    }
  },
  type: 'TriviaE2ETest'
});
