var TriviaStats = Class.create();
TriviaStats.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  _statsRow: function(userId, groupId) {
    var st = new GlideRecord(this.scope + '_player_stats');
    st.addQuery('user', userId); st.addQuery('group', groupId); st.query();
    if (!st.next()) {
      st.initialize(); st.setValue('user', userId); st.setValue('group', groupId);
      st.setValue('total_wins', 0); st.setValue('total_points', 0); st.setValue('total_correct', 0);
      st.setValue('longest_win_streak', 0); st.setValue('current_win_streak', 0);
      st.insert(); st.get(st.getUniqueValue());
    }
    return st;
  },
  _int: function(gr, f) { return parseInt(gr.getValue(f), 10) || 0; },

  rollupGame: function(gameId) {
    var g = new GlideRecord(this.scope + '_game');
    if (!g.get(gameId) || g.getValue('rolled_up') === '1' || g.getValue('rolled_up') === 'true') return;
    var groupId = g.getValue('group');
    if (!groupId) {
      gs.warn('TriviaStats.rollupGame: game ' + gameId + ' has no group; skipping rollup');
      return;
    }
    var winner = g.getValue('winner');
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.query();
    while (p.next()) {
      var userId = p.getValue('user');
      var st = this._statsRow(userId, groupId);
      st.setValue('total_points', this._int(st, 'total_points') + this._int(p, 'score'));
      st.setValue('total_correct', this._int(st, 'total_correct') + this._int(p, 'correct_count'));
      if (userId === winner) {
        st.setValue('total_wins', this._int(st, 'total_wins') + 1);
        var cur = this._int(st, 'current_win_streak') + 1;
        st.setValue('current_win_streak', cur);
        if (cur > this._int(st, 'longest_win_streak')) st.setValue('longest_win_streak', cur);
      } else {
        st.setValue('current_win_streak', 0);
      }
      st.update();
      // per-category correct counts from this game's responses
      var r = new GlideRecord(this.scope + '_response');
      r.addQuery('game', gameId); r.addQuery('player', userId); r.addQuery('correct', true);
      r.query();
      var perCat = {};
      while (r.next()) {
        var q = new GlideRecord(this.scope + '_question');
        if (q.get(r.getValue('question'))) {
          var cat = q.getValue('category');
          perCat[cat] = (perCat[cat] || 0) + 1;
        }
      }
      for (var cat2 in perCat) {
        var cs = new GlideRecord(this.scope + '_player_category_stats');
        cs.addQuery('user', userId); cs.addQuery('group', groupId); cs.addQuery('category', cat2); cs.query();
        if (!cs.next()) {
          cs.initialize(); cs.setValue('user', userId); cs.setValue('group', groupId); cs.setValue('category', cat2);
          cs.setValue('correct_count', 0); cs.insert(); cs.get(cs.getUniqueValue());
        }
        cs.setValue('correct_count', this._int(cs, 'correct_count') + perCat[cat2]);
        cs.update();
      }
    }
    g.setValue('rolled_up', true);
    g.update();
  },

  leaderboard: function(groupId) {
    var rows = [];
    var st = new GlideRecord(this.scope + '_player_stats');
    st.addQuery('group', groupId); st.query();
    while (st.next()) rows.push({
      userId: st.getValue('user'),
      wins: this._int(st, 'total_wins'), points: this._int(st, 'total_points'),
      correct: this._int(st, 'total_correct'),
      longestStreak: this._int(st, 'longest_win_streak'),
      currentStreak: this._int(st, 'current_win_streak')
    });
    var byCategory = {};
    var cs = new GlideRecord(this.scope + '_player_category_stats');
    cs.addQuery('group', groupId);
    cs.orderByDesc('correct_count'); cs.query();
    while (cs.next()) {
      var cat = cs.getValue('category');
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ userId: cs.getValue('user'), correct: this._int(cs, 'correct_count') });
    }
    return { rows: rows, byCategory: byCategory };
  },
  type: 'TriviaStats'
};
