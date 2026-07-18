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
  _mkGame: function(hostId, winnerId, players) {
    // players: [{userId, score, correct}]
    var s = this._scope();
    var g = new GlideRecord(s + '_game');
    g.initialize(); g.setValue('code', 'ZZZ9'); g.setValue('host', hostId);
    g.setValue('mode', 'uniform'); g.setValue('state', 'finished'); g.setValue('winner', winnerId);
    var gid = g.insert();
    for (var i = 0; i < players.length; i++) {
      var p = new GlideRecord(s + '_game_player');
      p.initialize(); p.setValue('game', gid); p.setValue('user', players[i].userId);
      p.setValue('score', players[i].score); p.setValue('correct_count', players[i].correct);
      p.insert();
    }
    return gid;
  },
  _statsFor: function(userId) {
    var st = new GlideRecord(this._scope() + '_player_stats');
    st.addQuery('user', userId); st.query();
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
    this._wipe([a, b]);
    try {
      var stats = new TriviaStats();
      // game 1: A wins
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 900, correct: 2}, {userId: b, score: 400, correct: 1}]));
      // game 2: A wins again
      stats.rollupGame(this._mkGame(a, a, [{userId: a, score: 800, correct: 1}, {userId: b, score: 700, correct: 2}]));
      // game 3: B wins
      var g3 = this._mkGame(a, b, [{userId: a, score: 100, correct: 0}, {userId: b, score: 999, correct: 3}]);
      stats.rollupGame(g3);
      var sa = this._statsFor(a), sb = this._statsFor(b);
      this.assertEqual(sa.wins, 2, 'A 2 wins');
      this.assertEqual(sa.points, 1800, 'A points accumulate');
      this.assertEqual(sa.correct, 3, 'A correct accumulate');
      this.assertEqual(sa.longest, 2, 'A longest streak 2');
      this.assertEqual(sa.cur, 0, 'A current streak reset');
      this.assertEqual(sb.wins, 1, 'B 1 win');
      this.assertEqual(sb.cur, 1, 'B current streak 1');
      // idempotence: re-rolling game 3 changes nothing
      stats.rollupGame(g3);
      this.assertEqual(this._statsFor(b).wins, 1, 'rollup is idempotent');
    } finally { this._wipe([a, b]); }
  },
  type: 'TriviaStatsTest'
});
