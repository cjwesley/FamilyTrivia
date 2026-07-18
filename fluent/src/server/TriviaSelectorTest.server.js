var TriviaSelectorTest = Class.create();
TriviaSelectorTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _makeCategory: function(name) {
    var gr = new GlideRecord(this._scope() + '_category');
    gr.initialize(); gr.setValue('name', name); gr.setValue('active', true);
    return gr.insert();
  },
  _makeQuestion: function(catId, difficulty, pool, text) {
    var q = new GlideRecord(this._scope() + '_question');
    q.initialize();
    q.setValue('text', text); q.setValue('qtype', 'mc');
    q.setValue('category', catId); q.setValue('difficulty', difficulty);
    q.setValue('pool', pool); q.setValue('active', true);
    return q.insert();
  },
  _cleanupCategory: function(catId) {
    var tables = ['response', 'question', 'category'];
    for (var i = 0; i < tables.length; i++) {
      var gr = new GlideRecord(this._scope() + '_' + tables[i]);
      if (tables[i] === 'category') gr.addQuery('sys_id', catId);
      else if (tables[i] === 'question') gr.addQuery('category', catId);
      else gr.addQuery('question.category', catId);
      gr.query();
      while (gr.next()) gr.deleteRecord();
    }
  },
  testPickUniformCountAndPool: function() {
    var c = this._makeCategory('ZZ Sel A');
    var u = this._ensureTestUser('sel1');
    try {
      for (var i = 0; i < 6; i++) this._makeQuestion(c, (i % 5) + 1, 'game', 'GameQ' + i);
      this._makeQuestion(c, 3, 'practice', 'PracticeQ');
      var picked = new TriviaSelector().pickUniform([c], 5, [u]);
      this.assertEqual(picked.length, 5, 'picked 5');
      // none of the picked may be the practice question
      var q = new GlideRecord(this._scope() + '_question');
      q.addQuery('sys_id', 'IN', picked.join(','));
      q.addQuery('pool', 'practice'); q.query();
      this.assert(!q.next(), 'no practice questions in game pick');
    } finally { this._cleanupCategory(c); }
  },
  testUniformExcludesRecentlyAnswered: function() {
    var c = this._makeCategory('ZZ Sel B');
    var u = this._ensureTestUser('sel2');
    try {
      var seen = this._makeQuestion(c, 3, 'game', 'SeenQ');
      for (var i = 0; i < 3; i++) this._makeQuestion(c, 3, 'game', 'FreshQ' + i);
      var r = new GlideRecord(this._scope() + '_response');
      r.initialize(); r.setValue('player', u); r.setValue('question', seen);
      r.setValue('correct', true); r.insert();
      var picked = new TriviaSelector().pickUniform([c], 3, [u]);
      this.assertEqual(picked.length, 3, 'still fills 3');
      this.assert(picked.join(',').indexOf(seen) === -1, 'recently answered excluded');
    } finally { this._cleanupCategory(c); }
  },
  testExclusionShrinksWhenPoolExhausted: function() {
    var c = this._makeCategory('ZZ Sel C');
    var u = this._ensureTestUser('sel3');
    try {
      // only 2 questions, both answered recently -> window must shrink to 0 and reuse them
      var q1 = this._makeQuestion(c, 3, 'game', 'OnlyQ1');
      var q2 = this._makeQuestion(c, 3, 'game', 'OnlyQ2');
      var r = new GlideRecord(this._scope() + '_response');
      r.initialize(); r.setValue('player', u); r.setValue('question', q1); r.insert();
      r.initialize(); r.setValue('player', u); r.setValue('question', q2); r.insert();
      var picked = new TriviaSelector().pickUniform([c], 2, [u]);
      this.assertEqual(picked.length, 2, 'reuses when nothing else exists');
    } finally { this._cleanupCategory(c); }
  },
  testPickForUserMatchesDifficulty: function() {
    var c = this._makeCategory('ZZ Sel D');
    var u = this._ensureTestUser('sel4');
    try {
      this._makeQuestion(c, 1, 'game', 'D1');
      var d3 = this._makeQuestion(c, 3, 'game', 'D3');
      this._makeQuestion(c, 5, 'game', 'D5');
      // no history -> target difficulty 3
      this.assertEqual(new TriviaSelector().pickForUser(c, u, [], 'game'), d3, 'picks difficulty 3');
    } finally { this._cleanupCategory(c); }
  },
  type: 'TriviaSelectorTest'
});
