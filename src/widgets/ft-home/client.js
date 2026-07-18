api.controller = function($scope, $window, $sce) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  // first ever visit: send them to profile setup (nickname + avatar) once
  if (c.data.firstVisit) { $window.location.href = '?id=ft_profile'; return; }
  c.view = 'home'; // home | new | join
  c.opts = { mode: 'uniform', categories: [], questionCount: 10, secondsPerQuestion: 20 };
  c.joinCode = '';
  c.err = '';
  c.toggleCat = function(id) {
    var i = c.opts.categories.indexOf(id);
    if (i >= 0) c.opts.categories.splice(i, 1); else c.opts.categories.push(id);
  };
  c.create = function() {
    if (!c.opts.categories.length) { c.err = 'Pick at least one category'; return; }
    c.server.get({ action: 'create', opts: c.opts }).then(function(r) {
      if (r.data.created && r.data.created.gameId)
        $window.location.href = '?id=ft_game&g=' + r.data.created.gameId;
    });
  };
  c.join = function() {
    c.server.get({ action: 'join', code: c.joinCode }).then(function(r) {
      if (r.data.joined && r.data.joined.gameId)
        $window.location.href = '?id=ft_game&g=' + r.data.joined.gameId;
      else c.err = (r.data.joined && r.data.joined.error) || 'Could not join';
    });
  };
};
