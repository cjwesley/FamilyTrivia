(function() {
  var me = gs.getUserID();
  var groups = new TriviaGroups();
  data.groups = groups.userGroups(me);
  var groupId = input && input.groupId;
  if (!groupId || !groups.isMember(me, groupId))
    groupId = data.groups.length ? data.groups[0].id : '';
  data.groupId = groupId;

  var stats = new TriviaStats().leaderboard(groupId);
  data.rows = stats.rows;
  data.byCategory = stats.byCategory;
  var ids = [];
  for (var i = 0; i < stats.rows.length; i++) ids.push(stats.rows[i].userId);
  for (var cat in stats.byCategory)
    for (var j = 0; j < stats.byCategory[cat].length; j++)
      if (ids.indexOf(stats.byCategory[cat][j].userId) === -1) ids.push(stats.byCategory[cat][j].userId);
  var prof = new TriviaProfile();
  data.cards = prof.cards(ids);
  var champId = groupId ? new TriviaEngine().champion(groupId).userId : '';
  data.champion = champId ? prof.card(champId) : null;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
