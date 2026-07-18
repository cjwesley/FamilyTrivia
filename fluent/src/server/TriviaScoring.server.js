var TriviaScoring = Class.create();
TriviaScoring.prototype = {
  initialize: function() {},
  // Spec: (500 + 500 * remaining/total) * (1 + 0.125 * (difficulty - 1)); wrong/absent = 0
  score: function(correct, answerMs, totalSec, difficulty) {
    if (!correct) return 0;
    var totalMs = totalSec * 1000;
    var t = Math.max(0, Math.min(Number(answerMs) || 0, totalMs));
    var remaining = (totalMs - t) / totalMs;
    var mult = 1 + 0.125 * (Number(difficulty) - 1);
    return Math.round((500 + 500 * remaining) * mult);
  },
  type: 'TriviaScoring'
};
