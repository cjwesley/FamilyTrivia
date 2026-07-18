(function() {
  var me = gs.getUserID();
  var pr = new TriviaPractice();
  if (input) {
    if (input.action === 'start') data.session = pr.startSession(me, input.categoryId || '');
    else if (input.action === 'next') data.next = pr.nextQuestion(input.sessionId, me);
    else if (input.action === 'answer')
      data.answered = pr.answerQuestion(input.sessionId, me, input.questionId, input.optionId, input.answerMs);
  }
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
