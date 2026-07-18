api.controller = function($scope) {
  var c = this;
  c.data = $scope.data;
  c.pct = function(x) { return Math.round(x * 100) + '%'; };
  c.stars = function(acc) {
    var level = Math.min(5, Math.max(1, 1 + Math.round(acc * 4)));
    return '★★★★★'.substring(0, level) + '☆☆☆☆☆'.substring(0, 5 - level);
  };
};
