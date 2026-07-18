var TriviaSkillTest = Class.create();
TriviaSkillTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix);
    gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize();
    gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _makeCategory: function(name) {
    var gr = new GlideRecord(this._scope() + '_category');
    gr.initialize(); gr.setValue('name', name); gr.setValue('active', true);
    return gr.insert();
  },
  _deleteWhere: function(table, field, value) {
    var gr = new GlideRecord(this._scope() + '_' + table);
    gr.addQuery(field, value); gr.query();
    while (gr.next()) gr.deleteRecord();
  },
  testDefaultIsThree: function() {
    var u = this._ensureTestUser('skill1');
    var c = this._makeCategory('ZZ SkillTest A');
    try {
      this.assertEqual(new TriviaSkill().targetDifficulty(u, c), 3, 'no history -> 3');
    } finally {
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  testRecordAnswerMovesAccuracy: function() {
    var u = this._ensureTestUser('skill2');
    var c = this._makeCategory('ZZ SkillTest B');
    try {
      var skill = new TriviaSkill();
      for (var i = 0; i < 10; i++) skill.recordAnswer(u, c, true);
      // 0.5 * 0.9^10 + 0.1*sum(0.9^k) ~= 0.826 -> 1 + round(3.3) = 4
      this.assertEqual(skill.targetDifficulty(u, c), 4, 'hot streak raises difficulty');
      for (var j = 0; j < 20; j++) skill.recordAnswer(u, c, false);
      this.assertEqual(skill.targetDifficulty(u, c), 1, 'cold streak lowers difficulty');
    } finally {
      this._deleteWhere('skill_rating', 'user', u);
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  testManualOverrideWins: function() {
    var u = this._ensureTestUser('skill3');
    var c = this._makeCategory('ZZ SkillTest C');
    try {
      var p = new GlideRecord(this._scope() + '_profile');
      p.initialize(); p.setValue('user', u);
      var ov = {}; ov[c] = 5;
      p.setValue('skill_overrides', JSON.stringify(ov));
      p.insert();
      this.assertEqual(new TriviaSkill().targetDifficulty(u, c), 5, 'override wins');
    } finally {
      this._deleteWhere('profile', 'user', u);
      this._deleteWhere('category', 'sys_id', c);
    }
  },
  type: 'TriviaSkillTest'
});
