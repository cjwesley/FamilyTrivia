(function() {
  var me = gs.getUserID();
  var eng = new TriviaEngine();
  var prof = new TriviaProfile();
  if (input) {
    if (input.action === 'create') {
      data.created = eng.createGame(me, input.opts);
      return;
    }
    if (input.action === 'join') {
      data.joined = eng.joinGame(me, input.code);
      return;
    }
  }
  data.firstVisit = prof.getOrCreate(me).created; // spec: first visit -> quick setup screen
  data.me = prof.card(me);
  var champId = eng.champion().userId;
  data.champion = champId ? prof.card(champId) : null;
  data.iAmChampion = champId === me;
  data.categories = [];
  var c = new GlideRecord(gs.getCurrentScopeName() + '_category');
  c.addQuery('active', true); c.orderBy('name'); c.query();
  while (c.next()) data.categories.push({ id: c.getUniqueValue(), name: c.getValue('name'), icon: c.getValue('icon') });
})();
