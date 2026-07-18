api.controller = function($scope, $window, $sce) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  // first ever visit: send them to profile setup (nickname + avatar) once
  if (c.data.firstVisit) { $window.location.href = '?id=ft_profile'; return; }

  // active group: restore from localStorage, validated against data.groups
  // (fallback: first group). Zero groups -> '' (empty-state card).
  function pickActiveGroup() {
    var saved = '';
    try { saved = $window.localStorage.getItem('ft_active_group') || ''; } catch (e) {}
    var groups = c.data.groups || [];
    for (var i = 0; i < groups.length; i++) if (groups[i].id === saved) return saved;
    return groups.length ? groups[0].id : '';
  }
  c.activeGroup = pickActiveGroup();
  c.activeGroupName = function() {
    var groups = c.data.groups || [];
    for (var i = 0; i < groups.length; i++) if (groups[i].id === c.activeGroup) return groups[i].name;
    return '';
  };
  function refreshContext() {
    if (!c.activeGroup) { c.data.champion = null; c.data.iAmChampion = false; return; }
    c.server.get({ action: 'context', groupId: c.activeGroup }).then(function(r) {
      c.data.champion = r.data.champion;
      c.data.iAmChampion = r.data.iAmChampion;
      c.data.groupId = r.data.groupId;
    });
  }
  c.switchGroup = function(id) {
    c.activeGroup = id;
    try { $window.localStorage.setItem('ft_active_group', id); } catch (e) {}
    refreshContext();
  };
  if (c.activeGroup) {
    try { $window.localStorage.setItem('ft_active_group', c.activeGroup); } catch (e) {}
  }
  // server's initial render always used the first group; re-fetch if the
  // restored selection points at a different one
  if (c.activeGroup && c.activeGroup !== c.data.groupId) refreshContext();

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
    c.opts.groupId = c.activeGroup;
    c.server.get({ action: 'create', opts: c.opts }).then(function(r) {
      if (r.data.created && r.data.created.gameId)
        $window.location.href = '?id=ft_game&g=' + r.data.created.gameId;
      else c.err = (r.data.created && r.data.created.error) || 'Could not create game';
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
