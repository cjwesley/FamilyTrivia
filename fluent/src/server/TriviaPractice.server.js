var TriviaPractice = Class.create();
TriviaPractice.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },
  _int: function(gr, f) { return parseInt(gr.getValue(f), 10) || 0; },

  startSession: function(userId, categoryId) {
    var s = new GlideRecord(this.scope + '_practice_session');
    s.initialize(); s.setValue('user', userId);
    if (categoryId) s.setValue('category', categoryId);
    s.setValue('question_count', 0); s.setValue('correct_count', 0); s.setValue('accuracy', 0);
    return { sessionId: s.insert() };
  },

  _sessionCategoryIds: function(sess) {
    var cat = sess.getValue('category');
    if (cat) return [cat];
    var out = [];
    var c = new GlideRecord(this.scope + '_category');
    c.addQuery('active', true); c.query();
    while (c.next()) out.push(c.getUniqueValue());
    return out;
  },

  _answeredInSession: function(sessionId, userId) {
    // within-session repeats tracked via responses created after the session record
    var sess = new GlideRecord(this.scope + '_practice_session');
    sess.get(sessionId);
    var out = [];
    var r = new GlideRecord(this.scope + '_response');
    r.addQuery('player', userId); r.addQuery('practice', true);
    r.addQuery('sys_created_on', '>=', sess.getValue('sys_created_on'));
    r.query();
    while (r.next()) out.push(r.getValue('question'));
    return out;
  },

  nextQuestion: function(sessionId, userId) {
    var sess = new GlideRecord(this.scope + '_practice_session');
    if (!sess.get(sessionId) || sess.getValue('user') !== userId) return { error: 'no session' };
    var cats = this._sessionCategoryIds(sess);
    var exclude = this._answeredInSession(sessionId, userId);
    var sel = new TriviaSelector();
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[(i + this._int(sess, 'question_count')) % cats.length]; // rotate categories
      var qId = sel.pickForUser(cat, userId, exclude, 'practice');
      if (qId) return { question: this._payload(qId) };
    }
    return { done: true };
  },

  _payload: function(qId) {
    var q = new GlideRecord(this.scope + '_question');
    q.get(qId);
    var cat = new GlideRecord(this.scope + '_category');
    cat.get(q.getValue('category'));
    var options = [];
    var op = new GlideRecord(this.scope + '_question_option');
    op.addQuery('question', qId); op.orderBy('order'); op.query();
    while (op.next()) options.push({ id: op.getUniqueValue(), text: op.getValue('text') });
    return {
      id: qId, text: q.getValue('text'), category: cat.getValue('name'),
      icon: cat.getValue('icon'), difficulty: this._int(q, 'difficulty'), options: options
    };
  },

  answerQuestion: function(sessionId, userId, questionId, optionId, answerMs) {
    var sess = new GlideRecord(this.scope + '_practice_session');
    if (!sess.get(sessionId) || sess.getValue('user') !== userId) return { error: 'no session' };
    var op = new GlideRecord(this.scope + '_question_option');
    if (!op.get(optionId) || op.getValue('question') !== questionId) return { error: 'invalid option' };
    var q = new GlideRecord(this.scope + '_question');
    q.get(questionId);
    var correct = op.getValue('correct') === '1' || op.getValue('correct') === 'true';
    var points = new TriviaScoring().score(correct, answerMs, 20, this._int(q, 'difficulty'));
    var r = new GlideRecord(this.scope + '_response');
    r.initialize();
    r.setValue('player', userId); r.setValue('question', questionId); r.setValue('option', optionId);
    r.setValue('correct', correct); r.setValue('answer_time_ms', answerMs);
    r.setValue('points', points); r.setValue('practice', true);
    r.insert();
    new TriviaSkill().recordAnswer(userId, q.getValue('category'), correct);
    var count = this._int(sess, 'question_count') + 1;
    var correctCount = this._int(sess, 'correct_count') + (correct ? 1 : 0);
    sess.setValue('question_count', count);
    sess.setValue('correct_count', correctCount);
    sess.setValue('accuracy', correctCount / count);
    sess.update();
    var cop = new GlideRecord(this.scope + '_question_option');
    cop.addQuery('question', questionId); cop.addQuery('correct', true); cop.query(); cop.next();
    return { correct: correct, points: points, correctOption: { id: cop.getUniqueValue(), text: cop.getValue('text') } };
  },

  progress: function(userId) {
    var sessions = [];
    var s = new GlideRecord(this.scope + '_practice_session');
    s.addQuery('user', userId); s.orderByDesc('sys_created_on'); s.setLimit(50); s.query();
    while (s.next()) {
      var catName = '';
      var cat = new GlideRecord(this.scope + '_category');
      if (s.getValue('category') && cat.get(s.getValue('category'))) catName = cat.getValue('name');
      sessions.push({
        date: s.getValue('sys_created_on'), category: catName || 'All',
        count: this._int(s, 'question_count'), correct: this._int(s, 'correct_count'),
        accuracy: parseFloat(s.getValue('accuracy')) || 0
      });
    }
    var ratings = [];
    var r = new GlideRecord(this.scope + '_skill_rating');
    r.addQuery('user', userId); r.query();
    while (r.next()) {
      var c2 = new GlideRecord(this.scope + '_category');
      c2.get(r.getValue('category'));
      ratings.push({
        categoryId: r.getValue('category'), categoryName: c2.getValue('name'),
        accuracy: parseFloat(r.getValue('accuracy')) || 0, samples: this._int(r, 'sample_count')
      });
    }
    return { sessions: sessions, ratings: ratings };
  },
  type: 'TriviaPractice'
};
