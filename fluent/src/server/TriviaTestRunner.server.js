var TriviaTestRunner = Class.create();
TriviaTestRunner.prototype = {
  initialize: function() {},
  suites: function() {
    return [
      new TriviaHarnessTest(),
      new TriviaScoringTest()
      // Task 6 adds: , new TriviaSkillTest()
      // Task 7 adds: , new TriviaSelectorTest()
      // Task 8 adds: , new TriviaEngineTest()
      // Task 9 adds: , new TriviaStatsTest()
      // Task 10 adds: , new TriviaPracticeTest()
      // Task 19 adds: , new TriviaE2ETest()
    ];
  },
  runAll: function() {
    var out = { passed: true, suites: [] };
    var all = this.suites();
    for (var i = 0; i < all.length; i++) {
      var r = all[i].run();
      if (!r.passed) out.passed = false;
      out.suites.push(r);
    }
    return out;
  },
  type: 'TriviaTestRunner'
};
