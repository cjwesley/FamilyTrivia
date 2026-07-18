api.controller = function($scope, $window, $sce) {
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
  function refresh() {
    c.server.get({ groupId: c.activeGroup }).then(function(r) {
      c.data.rows = r.data.rows;
      c.data.byCategory = r.data.byCategory;
      c.data.cards = r.data.cards;
      c.data.champion = r.data.champion;
      c.data.groupId = r.data.groupId;
      c.cat = c.data.categories.length ? c.data.categories[0].id : '';
    });
  }
  c.switchGroup = function(id) {
    c.activeGroup = id;
    try { $window.localStorage.setItem('ft_active_group', id); } catch (e) {}
    refresh();
  };
  if (c.activeGroup) {
    try { $window.localStorage.setItem('ft_active_group', c.activeGroup); } catch (e) {}
    // server's initial render always used the first group; re-fetch if the
    // restored selection points at a different one
    if (c.activeGroup !== c.data.groupId) refresh();
  }
};
