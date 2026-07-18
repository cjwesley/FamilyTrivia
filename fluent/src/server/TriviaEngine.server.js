var TriviaEngine = Class.create();
TriviaEngine.prototype = {
  initialize: function() {
    this.scope = gs.getCurrentScopeName();
    this.GRACE_MS = 2000;   // network grace after question timer
    this.REVEAL_MS = 8000;  // spec: 8s auto-advance
  },

  _now: function() { return new GlideDateTime().getNumericValue(); },
  _ms: function(glideValue) {
    if (!glideValue) return 0;
    return new GlideDateTime(glideValue).getNumericValue();
  },
  _game: function(gameId) {
    var g = new GlideRecord(this.scope + '_game');
    return g.get(gameId) ? g : null;
  },
  _players: function(gameId) {
    var out = [];
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.orderByDesc('score'); p.query();
    while (p.next()) out.push({
      id: p.getUniqueValue(), userId: p.getValue('user'),
      score: parseInt(p.getValue('score'), 10) || 0,
      correct: parseInt(p.getValue('correct_count'), 10) || 0,
      timeMs: parseInt(p.getValue('answer_time_total_ms'), 10) || 0,
      place: parseInt(p.getValue('place'), 10) || 0
    });
    return out;
  },

  createGame: function(userId, opts) {
    if (!new TriviaGroups().isMember(userId, opts.groupId)) return { error: 'Not a member of that group' };
    var code = this._newCode();
    var g = new GlideRecord(this.scope + '_game');
    g.initialize();
    g.setValue('code', code);
    g.setValue('host', userId);
    g.setValue('group', opts.groupId);
    g.setValue('invite_token', new TriviaGroups().newToken());
    g.setValue('mode', opts.mode === 'adaptive' ? 'adaptive' : 'uniform');
    g.setValue('categories', (opts.categories || []).join(','));
    g.setValue('question_count', opts.questionCount || 10);
    g.setValue('seconds_per_question', opts.secondsPerQuestion || 20);
    g.setValue('state', 'lobby');
    g.setValue('current_round', 0);
    var gameId = g.insert();
    this._join(gameId, userId);
    return { gameId: gameId, code: code };
  },

  _newCode: function() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 confusion
    while (true) {
      var code = '';
      for (var i = 0; i < 4; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      var g = new GlideRecord(this.scope + '_game');
      g.addQuery('code', code);
      g.addQuery('state', '!=', 'finished');
      g.query();
      if (!g.next()) return code;
    }
  },

  _join: function(gameId, userId) {
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.addQuery('user', userId); p.query();
    var existingId = p.next() ? p.getUniqueValue() : null;
    // every join path (create/joinGame/ensureJoined) auto-grants group membership
    var g = this._game(gameId);
    if (g && g.getValue('group')) new TriviaGroups().ensureMember(userId, g.getValue('group'));
    if (existingId) return existingId;
    p.initialize(); p.setValue('game', gameId); p.setValue('user', userId);
    p.setValue('score', 0); p.setValue('correct_count', 0); p.setValue('answer_time_total_ms', 0);
    return p.insert();
  },

  joinGame: function(userId, code) {
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('code', String(code).toUpperCase());
    g.addQuery('state', 'lobby');
    g.orderByDesc('sys_created_on'); g.query();
    if (!g.next()) return { error: 'No open game with that code' };
    var gameId = g.getUniqueValue();
    this._join(gameId, userId);
    return { gameId: gameId };
  },

  // Public, idempotent, self-guarding: only joins while the game is still in
  // the lobby. Used by the game widget so QR/deep-link viewers become players
  // instead of silent spectators. No-op for missing games or games already
  // under way (in_question/reveal/finished).
  ensureJoined: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'lobby') return;
    this._join(gameId, userId);
  },

  startGame: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'lobby') return { error: 'Not in lobby' };
    if (g.getValue('host') !== userId) return { error: 'Only the host can start' };
    var cats = (g.getValue('categories') || '').split(',');
    var n = parseInt(g.getValue('question_count'), 10);
    var players = this._players(gameId);
    var sel = new TriviaSelector();
    var i, gq;
    if (g.getValue('mode') === 'uniform') {
      var userIds = [];
      for (i = 0; i < players.length; i++) userIds.push(players[i].userId);
      var qs = sel.pickUniform(cats, n, userIds);
      for (i = 0; i < qs.length; i++) {
        gq = new GlideRecord(this.scope + '_game_question');
        gq.initialize(); gq.setValue('game', gameId);
        gq.setValue('round', i + 1); gq.setValue('question', qs[i]);
        gq.insert();
      }
      n = qs.length; // pool may be smaller than requested
    } else {
      var roundCats = sel.roundCategories(cats, n);
      for (i = 0; i < n; i++) {
        for (var p = 0; p < players.length; p++) {
          var exclude = this._questionsInGameFor(gameId, players[p].userId);
          var qId = sel.pickForUser(roundCats[i], players[p].userId, exclude, 'game');
          if (!qId) continue;
          gq = new GlideRecord(this.scope + '_game_question');
          gq.initialize(); gq.setValue('game', gameId);
          gq.setValue('round', i + 1); gq.setValue('question', qId);
          gq.setValue('player', players[p].userId);
          gq.insert();
        }
      }
    }
    g.setValue('question_count', n);
    g.setValue('state', 'in_question');
    g.setValue('current_round', 1);
    g.setValue('question_started_at', new GlideDateTime());
    g.update();
    return { started: true };
  },

  _questionsInGameFor: function(gameId, userId) {
    var out = [];
    var gq = new GlideRecord(this.scope + '_game_question');
    gq.addQuery('game', gameId);
    gq.query();
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (!pl || pl === userId) out.push(gq.getValue('question'));
    }
    return out;
  },

  _gameQuestionFor: function(gameId, round, userId) {
    var gq = new GlideRecord(this.scope + '_game_question');
    gq.addQuery('game', gameId); gq.addQuery('round', round);
    gq.query();
    var uniform = null;
    while (gq.next()) {
      var pl = gq.getValue('player');
      if (pl === userId) return { gqId: gq.getUniqueValue(), questionId: gq.getValue('question') };
      if (!pl) uniform = { gqId: gq.getUniqueValue(), questionId: gq.getValue('question') };
    }
    return uniform;
  },

  answer: function(gameId, userId, optionId, clientMs) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'in_question') return { accepted: false, reason: 'round closed' };
    var membership = new GlideRecord(this.scope + '_game_player');
    membership.addQuery('game', gameId); membership.addQuery('user', userId); membership.query();
    if (!membership.next()) return { accepted: false, reason: 'not a player in this game' };
    var round = parseInt(g.getValue('current_round'), 10);
    // first write wins
    var dup = new GlideRecord(this.scope + '_response');
    dup.addQuery('game', gameId); dup.addQuery('player', userId); dup.addQuery('round', round);
    dup.query();
    if (dup.next()) return { accepted: false, reason: 'already answered' };
    var mine = this._gameQuestionFor(gameId, round, userId);
    if (!mine) return { accepted: false, reason: 'no question for you this round' };
    var op = new GlideRecord(this.scope + '_question_option');
    if (!op.get(optionId) || op.getValue('question') !== mine.questionId)
      return { accepted: false, reason: 'invalid option' };
    var q = new GlideRecord(this.scope + '_question');
    q.get(mine.questionId);
    var totalSec = parseInt(g.getValue('seconds_per_question'), 10);
    var elapsed = this._now() - this._ms(g.getValue('question_started_at'));
    var ms = Math.max(0, Math.min(parseInt(clientMs, 10) || 0, elapsed)); // clamp to server clock
    if (elapsed > totalSec * 1000 + this.GRACE_MS) return { accepted: false, reason: 'too late' };
    var correct = op.getValue('correct') === '1' || op.getValue('correct') === 'true';
    var points = new TriviaScoring().score(correct, ms, totalSec, parseInt(q.getValue('difficulty'), 10));
    var r = new GlideRecord(this.scope + '_response');
    r.initialize();
    r.setValue('game', gameId); r.setValue('player', userId); r.setValue('round', round);
    r.setValue('question', mine.questionId); r.setValue('option', optionId);
    r.setValue('correct', correct); r.setValue('answer_time_ms', ms); r.setValue('points', points);
    r.insert();
    var p = new GlideRecord(this.scope + '_game_player');
    p.addQuery('game', gameId); p.addQuery('user', userId); p.query();
    if (p.next()) {
      p.setValue('score', (parseInt(p.getValue('score'), 10) || 0) + points);
      if (correct) p.setValue('correct_count', (parseInt(p.getValue('correct_count'), 10) || 0) + 1);
      p.setValue('answer_time_total_ms', (parseInt(p.getValue('answer_time_total_ms'), 10) || 0) + ms);
      p.update();
    }
    new TriviaSkill().recordAnswer(userId, q.getValue('category'), correct);
    // all answered? close early
    var players = this._players(gameId);
    var resp = new GlideAggregate(this.scope + '_response');
    resp.addQuery('game', gameId); resp.addQuery('round', round);
    resp.addAggregate('COUNT'); resp.query(); resp.next();
    if (parseInt(resp.getAggregate('COUNT'), 10) >= players.length) this._toReveal(g);
    return { accepted: true, correct: correct, points: points };
  },

  _toReveal: function(g) {
    if (g.getValue('state') !== 'in_question') return;
    g.setValue('state', 'reveal');
    g.setValue('reveal_started_at', new GlideDateTime());
    g.update();
  },

  tick: function(gameId) {
    var g = this._game(gameId);
    if (!g) return;
    var state = g.getValue('state');
    if (state === 'in_question') {
      var totalMs = parseInt(g.getValue('seconds_per_question'), 10) * 1000;
      if (this._now() - this._ms(g.getValue('question_started_at')) > totalMs + this.GRACE_MS)
        this._toReveal(g);
    } else if (state === 'reveal') {
      if (this._now() - this._ms(g.getValue('reveal_started_at')) > this.REVEAL_MS)
        this._advance(g);
    }
  },

  advance: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') !== 'reveal') return { error: 'not in reveal' };
    if (g.getValue('host') !== userId) return { error: 'host only' };
    this._advance(g);
    return { advanced: true };
  },

  _advance: function(g) {
    var round = parseInt(g.getValue('current_round'), 10);
    var total = parseInt(g.getValue('question_count'), 10);
    if (round >= total) { this.finish(g.getUniqueValue()); return; }
    g.setValue('current_round', round + 1);
    g.setValue('state', 'in_question');
    g.setValue('question_started_at', new GlideDateTime());
    g.update();
  },

  finish: function(gameId) {
    var g = this._game(gameId);
    if (!g || g.getValue('state') === 'finished') return;
    var players = this._players(gameId); // ordered score desc
    players.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.timeMs - b.timeMs;
    });
    for (var i = 0; i < players.length; i++) {
      var p = new GlideRecord(this.scope + '_game_player');
      p.get(players[i].id);
      p.setValue('place', i + 1);
      p.update();
    }
    g.setValue('state', 'finished');
    if (players.length) g.setValue('winner', players[0].userId);
    g.update();
    if (typeof TriviaStats !== 'undefined') new TriviaStats().rollupGame(gameId);
  },

  champion: function(groupId) {
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('state', 'finished');
    g.addNotNullQuery('winner');
    if (groupId) g.addQuery('group', groupId);
    g.orderByDesc('sys_updated_on');
    g.setLimit(1); g.query();
    return { userId: g.next() ? g.getValue('winner') : '' };
  },

  // resolves a lobby/game invite token to {gameId, state}; never returns
  // player data. Exact match, non-empty token only.
  resolveInvite: function(token) {
    if (!token) return { error: 'invalid' };
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('invite_token', token);
    g.query();
    if (!g.next()) return { error: 'invalid' };
    return { gameId: g.getUniqueValue(), state: g.getValue('state') };
  },

  getState: function(gameId, userId) {
    var g = this._game(gameId);
    if (!g) return { error: 'no such game' };
    var state = g.getValue('state');
    var groupId = g.getValue('group');
    var groupName = '';
    if (groupId) {
      var grp = new GlideRecord(this.scope + '_group');
      if (grp.get(groupId)) groupName = grp.getValue('name');
    }
    var out = {
      gameId: gameId, state: state, code: g.getValue('code'),
      mode: g.getValue('mode'), host: g.getValue('host'), isHost: g.getValue('host') === userId,
      round: parseInt(g.getValue('current_round'), 10) || 0,
      totalRounds: parseInt(g.getValue('question_count'), 10) || 0,
      secondsPerQuestion: parseInt(g.getValue('seconds_per_question'), 10) || 20,
      serverNow: this._now(),
      players: this._players(gameId),
      group: groupId,
      groupName: groupName,
      champion: this.champion(groupId).userId
    };
    if (state === 'lobby') {
      out.inviteToken = g.getValue('invite_token');
    }
    if (state === 'in_question') {
      out.endsAt = this._ms(g.getValue('question_started_at')) + out.secondsPerQuestion * 1000;
      var mine = this._gameQuestionFor(gameId, out.round, userId);
      if (mine) {
        var q = new GlideRecord(this.scope + '_question');
        q.get(mine.questionId);
        var cat = new GlideRecord(this.scope + '_category');
        cat.get(q.getValue('category'));
        var options = [];
        var op = new GlideRecord(this.scope + '_question_option');
        op.addQuery('question', mine.questionId); op.orderBy('order'); op.query();
        while (op.next()) options.push({ id: op.getUniqueValue(), text: op.getValue('text') });
        out.question = {
          gqId: mine.gqId, text: q.getValue('text'),
          category: cat.getValue('name'), icon: cat.getValue('icon'),
          difficulty: parseInt(q.getValue('difficulty'), 10), options: options
        };
        var r = new GlideRecord(this.scope + '_response');
        r.addQuery('game', gameId); r.addQuery('player', userId); r.addQuery('round', out.round);
        r.query();
        out.answered = r.next();
      }
    }
    if (state === 'reveal' || state === 'finished') {
      out.reveal = [];
      var rr = new GlideRecord(this.scope + '_response');
      rr.addQuery('game', gameId); rr.addQuery('round', out.round); rr.query();
      while (rr.next()) out.reveal.push({
        userId: rr.getValue('player'), correct: rr.getValue('correct') === '1',
        points: parseInt(rr.getValue('points'), 10) || 0
      });
      var mine2 = this._gameQuestionFor(gameId, out.round, userId);
      if (mine2) {
        var cop = new GlideRecord(this.scope + '_question_option');
        cop.addQuery('question', mine2.questionId); cop.addQuery('correct', true);
        cop.query();
        if (cop.next()) out.correctOption = { id: cop.getUniqueValue(), text: cop.getValue('text') };
      }
    }
    if (state === 'finished') {
      out.podium = [];
      var pl = this._players(gameId);
      pl.sort(function(a, b) { return (a.place || 99) - (b.place || 99); });
      for (var i = 0; i < pl.length; i++)
        out.podium.push({ userId: pl[i].userId, score: pl[i].score, correct: pl[i].correct, place: pl[i].place });
      out.winner = g.getValue('winner');
      // fun stats: fastest finger (lowest avg answer time) + best in-game correct run
      var best = { userId: '', avg: 0 };
      for (var f = 0; f < pl.length; f++) {
        var rc = new GlideAggregate(this.scope + '_response');
        rc.addQuery('game', gameId); rc.addQuery('player', pl[f].userId);
        rc.addAggregate('COUNT'); rc.query(); rc.next();
        var n = parseInt(rc.getAggregate('COUNT'), 10);
        if (!n) continue;
        var avg = pl[f].timeMs / n;
        if (!best.userId || avg < best.avg) best = { userId: pl[f].userId, avg: avg };
      }
      if (best.userId) out.fastestFinger = { userId: best.userId, avgSec: Math.round(best.avg / 100) / 10 };
      var runs = { userId: '', len: 0 };
      for (var s2 = 0; s2 < pl.length; s2++) {
        var rr2 = new GlideRecord(this.scope + '_response');
        rr2.addQuery('game', gameId); rr2.addQuery('player', pl[s2].userId);
        rr2.orderBy('round'); rr2.query();
        var cur = 0, mx = 0;
        while (rr2.next()) {
          if (rr2.getValue('correct') === '1' || rr2.getValue('correct') === 'true') { cur++; if (cur > mx) mx = cur; }
          else cur = 0;
        }
        if (mx > runs.len) runs = { userId: pl[s2].userId, len: mx };
      }
      if (runs.len > 1) out.bestRun = runs;
      // champion BEFORE this game, so the podium can announce a dethroning
      var prev = new GlideRecord(this.scope + '_game');
      prev.addQuery('state', 'finished');
      prev.addNotNullQuery('winner');
      prev.addQuery('sys_id', '!=', gameId);
      if (groupId) prev.addQuery('group', groupId);
      prev.orderByDesc('sys_updated_on');
      prev.setLimit(1); prev.query();
      out.previousChampion = prev.next() ? prev.getValue('winner') : '';
    }
    return out;
  },
  type: 'TriviaEngine'
};
