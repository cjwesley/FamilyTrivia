(function() {
  var me = gs.getUserID();
  var prof = new TriviaProfile();
  if (input && input.action === 'save') {
    data.saved = prof.save(me, input.payload);
  }
  data.profile = prof.getOrCreate(me);
  data.card = prof.card(me);

  // group-aware champion check: show the crown if the user is the reigning
  // champion in ANY of their groups (champion is per-group, not global).
  var eng = new TriviaEngine();
  var myGroups = new TriviaGroups().userGroups(me);
  data.champion = false;
  for (var i = 0; i < myGroups.length; i++) {
    if (eng.champion(myGroups[i].id).userId === me) { data.champion = true; break; }
  }

  data.avatars = [];
  var a = new GlideRecord(gs.getCurrentScopeName() + '_avatar');
  a.addQuery('active', true); a.orderBy('order'); a.query();
  while (a.next()) data.avatars.push({ id: a.getUniqueValue(), name: a.getValue('name'), svg: a.getValue('svg') });
  var u = new GlideRecord('sys_user');
  u.get(me);
  data.hasSnPhoto = !!u.getValue('photo');
  data.profileTable = gs.getCurrentScopeName() + '_profile';
})();
