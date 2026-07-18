api.controller = function($scope) {
  var c = this;
  c.data = $scope.data;
  c.view = 'setup'; // setup | question | feedback | done
  c.categoryId = '';
  c.sessionId = '';
  c.q = null;
  c.result = null;
  c.count = 0; c.correct = 0;
  var startedAt = 0;
  c.start = function() {
    c.server.get({ action: 'start', categoryId: c.categoryId }).then(function(r) {
      c.sessionId = r.data.session.sessionId;
      c.count = 0; c.correct = 0;
      c.next();
    });
  };
  c.next = function() {
    c.server.get({ action: 'next', sessionId: c.sessionId }).then(function(r) {
      if (r.data.next.done) { c.view = 'done'; return; }
      c.q = r.data.next.question;
      c.result = null;
      startedAt = Date.now();
      c.view = 'question';
    });
  };
  c.answer = function(optionId) {
    c.server.get({
      action: 'answer', sessionId: c.sessionId, questionId: c.q.id,
      optionId: optionId, answerMs: Date.now() - startedAt
    }).then(function(r) {
      c.result = r.data.answered;
      c.count++;
      if (c.result.correct) c.correct++;
      c.view = 'feedback';
    });
  };
  c.stop = function() { c.view = 'done'; };
  // Math is unavailable in Angular expressions - compute here
  c.pct = function() { return c.count ? Math.round(c.correct / c.count * 100) + '%' : '—'; };
};
