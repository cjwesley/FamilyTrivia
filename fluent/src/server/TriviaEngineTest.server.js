var TriviaEngineTest = Class.create();
TriviaEngineTest.prototype = Object.extendsObject(TriviaTestBase, {
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
    // one category + 4 MC questions (difficulty 3) with 2 options each, first option correct
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
    return { catId: catId, correctIds: correctIds };
  },
  _cleanup: function(catId) {
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
    // games created by tests: host is a famtriv.test user
    var g = new GlideRecord(s + '_game');
    g.addQuery('host.user_name', 'STARTSWITH', 'famtriv.test'); g.query();
    while (g.next()) {
      del('game_player', 'game', g.getUniqueValue());
      g.deleteRecord();
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
    var a = this._ensureTestUser('engA'), b = this._ensureTestUser('engB');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20 });
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
      this.assertEqual(eng.champion().userId, a, 'champion is A');
    } finally { this._cleanup(seed.catId); }
  },
  testTickClosesExpiredQuestion: function() {
    var seed = this._seed('T');
    var a = this._ensureTestUser('engC');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'uniform', categories: [seed.catId], questionCount: 1, secondsPerQuestion: 20 });
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
    } finally { this._cleanup(seed.catId); }
  },
  testAdaptiveServesPerPlayer: function() {
    var seed = this._seed('A');
    var a = this._ensureTestUser('engD'), b = this._ensureTestUser('engE');
    try {
      var eng = new TriviaEngine();
      var made = eng.createGame(a, { mode: 'adaptive', categories: [seed.catId], questionCount: 2, secondsPerQuestion: 20 });
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
    } finally { this._cleanup(seed.catId); }
  },
  type: 'TriviaEngineTest'
});
