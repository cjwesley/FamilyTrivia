var TriviaScoringTest = Class.create();
TriviaScoringTest.prototype = Object.extendsObject(TriviaTestBase, {
  testCorrectInstantDiff1: function() {
    this.assertEqual(new TriviaScoring().score(true, 0, 20, 1), 1000, 'instant d1');
  },
  testCorrectAtTimeoutDiff1: function() {
    this.assertEqual(new TriviaScoring().score(true, 20000, 20, 1), 500, 'timeout d1');
  },
  testCorrectInstantDiff5: function() {
    this.assertEqual(new TriviaScoring().score(true, 0, 20, 5), 1500, 'instant d5');
  },
  testHalfwayDiff3: function() {
    // remaining 0.5 -> (500+250) * 1.25 = 937.5 -> 938
    this.assertEqual(new TriviaScoring().score(true, 10000, 20, 3), 938, 'halfway d3');
  },
  testWrong: function() {
    this.assertEqual(new TriviaScoring().score(false, 100, 20, 5), 0, 'wrong=0');
  },
  testClampOverTime: function() {
    this.assertEqual(new TriviaScoring().score(true, 99999, 20, 1), 500, 'clamped to timeout');
  },
  testClampNegative: function() {
    this.assertEqual(new TriviaScoring().score(true, -5, 20, 1), 1000, 'clamped to 0');
  },
  type: 'TriviaScoringTest'
});
