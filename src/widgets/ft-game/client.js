api.controller = function($scope, $interval, $timeout, $sce, spUtil) {
  var c = this;
  c.data = $scope.data;
  c.trust = function(h) { return $sce.trustAsHtml(h); };
  c.st = c.data.state;
  c.cards = c.data.cards;
  c.selected = '';
  c.answeredAt = 0;
  c.remaining = 0;
  c.pct = 100;
  var clockSkew = Date.now() - c.st.serverNow; // client clock - server clock
  var tickSent = false;
  var busy = false;

  function apply(result) {
    c.st = result.data.state;
    c.cards = result.data.cards || c.cards;
    clockSkew = Date.now() - c.st.serverNow;
    if (c.st.state !== 'in_question') { c.selected = ''; tickSent = false; }
  }
  c.refresh = function() {
    if (busy) return;
    busy = true;
    c.server.get({ action: 'state', gameId: c.data.gameId })
      .then(function(r) { apply(r); busy = false; }, function() { busy = false; });
  };

  // trigger 1: record watch on this game record
  spUtil.recordWatch($scope, c.data.gameTable, 'sys_id=' + c.data.gameId, function() { c.refresh(); });
  // trigger 2: 3s poll fallback
  var poll = $interval(c.refresh, 3000);
  // trigger 3: 1s local countdown + one-shot tick when expired
  var clock = $interval(function() {
    if (c.st.state !== 'in_question' || !c.st.endsAt) return;
    var msLeft = c.st.endsAt - (Date.now() - clockSkew);
    c.remaining = Math.max(0, Math.ceil(msLeft / 1000));
    c.pct = Math.max(0, Math.min(100, msLeft / (c.st.secondsPerQuestion * 10)));
    if (msLeft <= -500 && !tickSent) {
      tickSent = true;
      c.server.get({ action: 'tick', gameId: c.data.gameId }).then(apply);
    }
  }, 250);
  // reveal auto-advance safety: ANY client nudges tick during reveal (server is
  // idempotent) so the game advances even if the host closed their phone
  var revealNudge = $interval(function() {
    if (c.st.state === 'reveal')
      c.server.get({ action: 'tick', gameId: c.data.gameId }).then(apply);
  }, 9000);
  $scope.$on('$destroy', function() {
    $interval.cancel(poll); $interval.cancel(clock); $interval.cancel(revealNudge);
  });

  c.start = function() {
    c.server.get({ action: 'start', gameId: c.data.gameId }).then(apply);
  };
  c.answer = function(optionId) {
    if (c.selected || c.st.answered) return;
    c.selected = optionId;
    var clientMs = c.st.secondsPerQuestion * 1000 - (c.st.endsAt - (Date.now() - clockSkew));
    c.server.get({ action: 'answer', gameId: c.data.gameId, optionId: optionId, clientMs: Math.round(clientMs) })
      .then(apply);
  };
  c.next = function() {
    c.server.get({ action: 'advance', gameId: c.data.gameId }).then(apply);
  };
  c.myReveal = function() {
    if (!c.st.reveal) return null;
    for (var i = 0; i < c.st.reveal.length; i++)
      if (c.st.reveal[i].userId === c.data.me) return c.st.reveal[i];
    return null;
  };
  c.inviteLink = function() {
    return location.origin + '/trivia?id=ft_join&t=' + c.st.inviteToken;
  };
  c.qrUrl = function() {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(c.inviteLink());
  };
  c.copied = false;
  c.showCopyFallback = false;
  c.copyInvite = function() {
    var link = c.inviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function() {
        $scope.$applyAsync(function() { c.copied = true; c.showCopyFallback = false; });
      }, function() {
        $scope.$applyAsync(function() { c.showCopyFallback = true; });
      });
    } else {
      c.showCopyFallback = true;
    }
  };
};
