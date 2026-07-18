var TriviaHarnessTest = Class.create();
TriviaHarnessTest.prototype = Object.extendsObject(TriviaTestBase, {
  testTruth: function() { this.assert(true, 'truth is true'); },
  testMath: function() { this.assertEqual(2 + 2, 4, 'arithmetic'); },
  type: 'TriviaHarnessTest'
});
