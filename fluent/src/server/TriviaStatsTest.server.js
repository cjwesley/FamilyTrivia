var TriviaStatsTest = Class.create();
TriviaStatsTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _ensureGroup: function(name, ownerId) {
    var s = this._scope();
    var g = new GlideRecord(s + '_group');
    g.addQuery('name', name); g.query();
    if (g.next()) return g.getUniqueValue();
    g.initialize(); g.setValue('name', name); g.setValue('owner', ownerId); g.setValue('active', true);
    return g.insert();
  },
  _mkGame: function(hostId, winnerId, players, groupId) {
    // players: [{userId, score, correct}]
    var s = this._scope();
    if (!groupId) groupId = this._ensureGroup('ZZ StatGrp', hostId);
    var g = new GlideRecord(s + '_game');
    g.initialize(); g.setValue('code', 'ZZZ9'); g.setValue('host', hostId);
    g.setValue('mode', 'uniform'); g.setValue('state', 'finished'); g.setValue('winner', winnerId);
    g.setValue('group', groupId);
    var gid = g.insert();
    for (var i = 0; i < players.length; i++) {
      var p = new GlideRecord(s + '_game_player');
      p.initialize(); p.setValue('game', gid); p.setValue('user', players[i].userId);
      p.setValue('score', players[i].score); p.setValue('correct_count', players[i].correct);
      p.insert();
    }
    return gid;
  },
  _statsFor: function(userId, groupId) {
    var st = new GlideRecord(this._scope() + '_player_stats');
    st.addQuery('user', userId); st.addQuery('group', groupId); st.query();
    if (!st.next()) return null;
    return {
      wins: parseInt(st.getValue('total_wins'), 10),
      points: parseInt(st.getValue('total_points'), 10),
      correct: parseInt(st.getValue('total_correct'), 10),
      cur: parseInt(st.getValue('current_win_streak'), 10),
      longest: parseInt(st.getValue('longest_win_streak'), 10)
    };
  },
  _wipe: function(userIds) {
    var s = this._scope();
    var tables = ['player_stats', 'player_category_stats'];
    for (var t = 0; t < tables.length; t++)
      for (var i = 0; i < userIds.length; i++) {
        var gr = new GlideRecord(s + '_' + tables[t]);
        gr.addQuery('user', userIds[i]); gr.query();
        while (gr.next()) gr.deleteRecord();
      }
    var g = new GlideRecord(s + '_game');
    g.addQuery('code', 'ZZZ9'); g.query();
    while (g.next()) {
      var gp = new GlideRecord(s + '_game_player');
      gp.addQuery('game', g.getUniqueValue()); gp.query();
      while (gp.next()) gp.deleteRecord();
      g.deleteRecord();
    }
  },
  testRollupAndStreaks: function() {
    var a = this._ensureTestUser('statA'), b = this._ensureTestUser('statB');
    var groupId = this._ensureGroup('ZZ StatGrp', a);
    this._wipe([a, b]);
    try {
      var stats = new TriviaStats();
      // game 1: A wins
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 900, correct: 2}, {userId: b, score: 400, correct: 1}], groupId));
      // game 2: A wins again
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 800, correct: 1}, {userId: b, score: 700, correct: 2}], groupId));
      // game 3: B wins
      var g3 = this._mkGame(a, b, [{userId: a, score: 100, correct: 0}, {userId: b, score: 999, correct: 3}], groupId);
      stats.rollupGame(g3);
      var sa = this._statsFor(a, groupId), sb = this._statsFor(b, groupId);
      this.assertEqual(sa.wins, 2, 'A 2 wins');
      this.assertEqual(sa.points, 1800, 'A points accumulate');
      this.assertEqual(sa.correct, 3, 'A correct accumulate');
      this.assertEqual(sa.longest, 2, 'A longest streak 2');
      this.assertEqual(sa.cur, 0, 'A current streak reset');
      this.assertEqual(sb.wins, 1, 'B 1 win');
      this.assertEqual(sb.cur, 1, 'B current streak 1');
      // idempotence: re-rolling game 3 changes nothing
      stats.rollupGame(g3);
      this.assertEqual(this._statsFor(b, groupId).wins, 1, 'rollup is idempotent');
    } finally { this._wipe([a, b]); }
  },
  // same user wins in group A, loses in group B -> stats silo per group;
  // leaderboard(A) must not surface a user who only ever played in B.
  testSiloAcrossGroups: function() {
    var a = this._ensureTestUser('siloA'), b = this._ensureTestUser('siloB'), c = this._ensureTestUser('siloC');
    var groupA = this._ensureGroup('ZZ StatGrp SiloA', a);
    var groupB = this._ensureGroup('ZZ StatGrp SiloB', a);
    this._wipe([a, b, c]);
    try {
      var stats = new TriviaStats();
      // group A: A beats B
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 500, correct: 2}, {userId: b, score: 100, correct: 0}], groupA));
      // group B: A loses to C (C-only player, never appears in group A)
      stats.rollupGame(this._mkGame(a, c, [{userId: a, score: 100, correct: 0}, {userId: c, score: 900, correct: 3}], groupB));
      var aInA = this._statsFor(a, groupA);
      var aInB = this._statsFor(a, groupB);
      this.assertEqual(aInA.wins, 1, 'A has 1 win in group A');
      this.assertEqual(aInA.cur, 1, 'A current streak 1 in group A');
      this.assertEqual(aInB.wins, 0, 'A has 0 wins in group B');
      this.assertEqual(aInB.cur, 0, 'A current streak 0 in group B');
      var boardA = stats.leaderboard(groupA);
      var foundA = false, foundB = false, foundC = false;
      for (var i = 0; i < boardA.rows.length; i++) {
        if (boardA.rows[i].userId === a) foundA = true;
        if (boardA.rows[i].userId === b) foundB = true;
        if (boardA.rows[i].userId === c) foundC = true;
      }
      this.assert(foundA, 'leaderboard(A) includes A');
      this.assert(foundB, 'leaderboard(A) includes B (played in group A)');
      this.assert(!foundC, 'leaderboard(A) excludes C (only played in group B)');
    } finally { this._wipe([a, b, c]); }
  },
  type: 'TriviaStatsTest'
});
