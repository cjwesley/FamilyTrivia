var TriviaSkill = Class.create();
TriviaSkill.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  targetDifficulty: function(userId, categoryId) {
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (p.next()) {
      var raw = p.getValue('skill_overrides');
      if (raw) {
        try {
          var ov = JSON.parse(raw);
          if (ov[categoryId]) return Math.min(5, Math.max(1, parseInt(ov[categoryId], 10)));
        } catch (e) { /* bad JSON -> ignore override */ }
      }
    }
    var acc = 0.5;
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.addQuery('category', categoryId); r.query();
    if (r.next()) acc = parseFloat(r.getValue('accuracy'));
    return Math.min(5, Math.max(1, 1 + Math.round(acc * 4)));
  },

  recordAnswer: function(userId, categoryId, correct) {
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.addQuery('category', categoryId); r.query();
    if (!r.next()) {
      r.initialize();
      r.setValue('user', userId); r.setValue('category', categoryId);
      r.setValue('accuracy', 0.5); r.setValue('sample_count', 0);
      r.insert();
      r.get(r.getUniqueValue());
    }
    var acc = parseFloat(r.getValue('accuracy'));
    r.setValue('accuracy', acc * 0.9 + (correct ? 1 : 0) * 0.1);
    r.setValue('sample_count', parseInt(r.getValue('sample_count'), 10) + 1);
    r.update();
  },
  type: 'TriviaSkill'
};
