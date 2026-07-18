api.controller = function($scope, $sce) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  c.tab = 'wins'; // wins | points | correct | category | streak
  c.cat = c.data.categories.length ? c.data.categories[0].id : '';
  var SORT = { wins: 'wins', points: 'points', correct: 'correct', streak: 'longestStreak' };
  c.ranked = function() {
    var key = SORT[c.tab];
    if (!key) return [];
    return c.data.rows.slice().sort(function(a, b) { return b[key] - a[key]; });
  };
  c.catRows = function() { return c.data.byCategory[c.cat] || []; };
  c.value = function(row) { return row[SORT[c.tab]]; };
  c.medal = function(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1); };
};
