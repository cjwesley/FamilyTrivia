(function() {
  var me = gs.getUserID();
  var eng = new TriviaEngine();
  var gameId = (input && input.gameId) || $sp.getParameter('g');
  data.gameId = gameId;
  data.me = me;
  if (input) {
    if (input.action === 'start') data.result = eng.startGame(gameId, me);
    else if (input.action === 'answer') data.result = eng.answer(gameId, me, input.optionId, input.clientMs);
    else if (input.action === 'advance') data.result = eng.advance(gameId, me);
    else if (input.action === 'tick') eng.tick(gameId);
  }
  data.state = eng.getState(gameId, me);
  if (!data.state.error) {
    var ids = [];
    for (var i = 0; i < data.state.players.length; i++) ids.push(data.state.players[i].userId);
    data.cards = new TriviaProfile().cards(ids);
  }
  data.gameTable = gs.getCurrentScopeName() + '_game';
})();
