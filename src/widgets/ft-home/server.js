(function() {
  var me = gs.getUserID();
  var eng = new TriviaEngine();
  var prof = new TriviaProfile();
  var groups = new TriviaGroups();
  data.groups = groups.userGroups(me);

  function firstGroupId() { return data.groups.length ? data.groups[0].id : ''; }

  if (input) {
    if (input.action === 'create') {
      data.created = eng.createGame(me, input.opts);
      return;
    }
    if (input.action === 'join') {
      data.joined = eng.joinGame(me, input.code);
      return;
    }
    if (input.action === 'context') {
      var groupId = input.groupId;
      if (!groupId || !groups.isMember(me, groupId)) groupId = firstGroupId();
      data.groupId = groupId;
      var champId = groupId ? eng.champion(groupId).userId : '';
      data.champion = champId ? prof.card(champId) : null;
      data.iAmChampion = !!champId && champId === me;
      return;
    }
  }
  data.firstVisit = prof.getOrCreate(me).created; // spec: first visit -> quick setup screen
  data.me = prof.card(me);
  var groupId = firstGroupId(); // client re-requests context after restoring its saved selection
  data.groupId = groupId;
  var champId = groupId ? eng.champion(groupId).userId : '';
  data.champion = champId ? prof.card(champId) : null;
  data.iAmChampion = !!champId && champId === me;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
