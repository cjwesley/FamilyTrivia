var TriviaPracticeTest = Class.create();
TriviaPracticeTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _seedPractice: function(tag, count) {
    var s = this._scope();
    var c = new GlideRecord(s + '_category');
    c.initialize(); c.setValue('name', 'ZZ Prac ' + tag); c.setValue('active', true);
    var catId = c.insert();
    for (var i = 0; i < count; i++) {
      var q = new GlideRecord(s + '_question');
      q.initialize(); q.setValue('text', 'PracQ' + tag + i); q.setValue('qtype', 'tf');
      q.setValue('category', catId); q.setValue('difficulty', 3);
      q.setValue('pool', 'practice'); q.setValue('active', true);
      var qId = q.insert();
      var vals = [['True', true], ['False', false]];
      for (var o = 0; o < 2; o++) {
        var op = new GlideRecord(s + '_question_option');
        op.initialize(); op.setValue('question', qId);
        op.setValue('text', vals[o][0]); op.setValue('correct', vals[o][1]); op.setValue('order', o);
        op.insert();
      }
    }
    return catId;
  },
  _cleanup: function(catId, userId) {
    var s = this._scope();
    var del = function(table, field, value) {
      var gr = new GlideRecord(s + '_' + table);
      gr.addQuery(field, value); gr.query();
      while (gr.next()) gr.deleteRecord();
    };
    del('response', 'question.category', catId);
    del('question_option', 'question.category', catId);
    del('question', 'category', catId);
    del('practice_session', 'user', userId);
    del('skill_rating', 'user', userId);
    del('category', 'sys_id', catId);
  },
  testPracticeFlow: function() {
    var u = this._ensureTestUser('prac1');
    var c = this._seedPractice('A', 3);
    try {
      var pr = new TriviaPractice();
      var made = pr.startSession(u, c);
      this.assert(!!made.sessionId, 'session created');
      var seen = {};
      for (var i = 0; i < 3; i++) {
        var nq = pr.nextQuestion(made.sessionId, u);
        this.assert(nq.question, 'question ' + i + ' served');
        this.assert(!seen[nq.question.id], 'no repeat within session');
        seen[nq.question.id] = true;
        // find the True option (correct) and answer with it
        var correctOpt = null;
        for (var o = 0; o < nq.question.options.length; o++)
          if (nq.question.options[o].text === 'True') correctOpt = nq.question.options[o].id;
        var res = pr.answerQuestion(made.sessionId, u, nq.question.id, correctOpt, 2000);
        this.assert(res.correct, 'answered correctly');
      }
      this.assert(pr.nextQuestion(made.sessionId, u).done, 'pool exhausted -> done');
      var prog = pr.progress(u);
      this.assertEqual(prog.sessions.length, 1, 'one session in progress');
      this.assertEqual(prog.sessions[0].correct, 3, 'session correct count');
      this.assert(prog.ratings.length >= 1, 'skill rating created by practice');
    } finally { this._cleanup(c, u); }
  },
  type: 'TriviaPracticeTest'
});
