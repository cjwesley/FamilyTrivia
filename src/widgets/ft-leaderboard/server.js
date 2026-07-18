(function() {
  var stats = new TriviaStats().leaderboard();
  data.rows = stats.rows;
  data.byCategory = stats.byCategory;
  var ids = [];
  for (var i = 0; i < stats.rows.length; i++) ids.push(stats.rows[i].userId);
  for (var cat in stats.byCategory)
    for (var j = 0; j < stats.byCategory[cat].length; j++)
      if (ids.indexOf(stats.byCategory[cat][j].userId) === -1) ids.push(stats.byCategory[cat][j].userId);
  var prof = new TriviaProfile();
  data.cards = prof.cards(ids);
  var champId = new TriviaEngine().champion().userId;
  data.champion = champId ? prof.card(champId) : null;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
