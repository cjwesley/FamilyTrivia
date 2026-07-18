var TriviaTestBase = Class.create();
TriviaTestBase.prototype = {
  initialize: function() { this.failures = []; },
  assert: function(cond, msg) { if (!cond) this.failures.push(msg || 'assert failed'); },
  assertEqual: function(actual, expected, msg) {
    if (actual != expected)
      this.failures.push((msg || 'assertEqual') + ': expected [' + expected + '] got [' + actual + ']');
  },
  run: function() {
    var total = 0;
    for (var key in this) {
      if (key.indexOf('test') === 0 && typeof this[key] === 'function') {
        total++;
        try { this[key](); }
        catch (e) { this.failures.push(key + ' threw: ' + e); }
      }
    }
    return { name: this.type, total: total, failures: this.failures, passed: this.failures.length === 0 };
  },
  type: 'TriviaTestBase'
};
