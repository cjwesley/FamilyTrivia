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
  var lastTickAt = 0;
  var busy = false;

  function apply(result) {
    c.st = result.data.state;
    c.cards = result.data.cards || c.cards;
    clockSkew = Date.now() - c.st.serverNow;
    if (c.st.state !== 'in_question') { c.selected = ''; c.answerNote = ''; lastTickAt = 0; }
  }
  c.refresh = function() {
    if (busy) return;
    busy = true;
    c.server.get({ action: 'state', gameId: c.data.gameId })
      .then(function(r) { apply(r); busy = false; }, function() { busy = false; });
  };

  // trigger 1: record watch on this game record. recordWatch availability varies
  // by instance (AMB/plugin config) and a synchronous throw here would abort the
  // whole controller and blank the widget - the 3s poll below must always carry
  // the game on its own, so failures are logged and swallowed.
  try {
    spUtil.recordWatch($scope, c.data.gameTable, 'sys_id=' + c.data.gameId, function() { c.refresh(); });
  } catch (e) {
    console.error('ft-game: recordWatch unavailable, relying on 3s poll', e);
  }
  // trigger 2: 3s poll fallback
  var poll = $interval(c.refresh, 3000);
  // trigger 3: 1s local countdown + one-shot tick when expired
  var clock = $interval(function() {
    if (c.st.state !== 'in_question' || !c.st.endsAt) return;
    var msLeft = c.st.endsAt - (Date.now() - clockSkew);
    c.remaining = Math.max(0, Math.ceil(msLeft / 1000));
    c.pct = Math.max(0, Math.min(100, msLeft / (c.st.secondsPerQuestion * 10)));
    // Nudge the server clock only after its 2s grace window has certainly
    // passed, and RE-ARM every 3s rather than firing once: a single lost or
    // too-early tick must never strand the round (tick is idempotent, and
    // getState also lazily ticks server-side - this is defense in depth).
    if (msLeft <= -2500 && Date.now() - lastTickAt >= 3000) {
      lastTickAt = Date.now();
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
    c.answerNote = '';
    var clientMs = c.st.secondsPerQuestion * 1000 - (c.st.endsAt - (Date.now() - clockSkew));
    c.server.get({ action: 'answer', gameId: c.data.gameId, optionId: optionId, clientMs: Math.round(clientMs) })
      .then(function(r) {
        // A rejected answer must not masquerade as "locked in" - unlock and say why.
        var res = r.data && r.data.result;
        if (res && res.accepted === false && res.reason !== 'already answered') {
          c.selected = '';
          c.answerNote = "That answer didn't count (" + (res.reason || 'error') + ')';
        }
        apply(r);
      });
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
    return location.origin + '/trivia?id=ft_join&t=' + encodeURIComponent(c.st.inviteToken);
  };
  // QR renders locally via the vendored qrcode lib (lib.js, MIT) - the invite
  // token never leaves the device. Re-render only when the link changes.
  var qrRenderedFor = '';
  function renderQr() {
    if (c.st.state !== 'lobby' || !c.st.inviteToken || typeof QRCodeLib === 'undefined') return;
    var link = c.inviteLink();
    if (link === qrRenderedFor) return;
    $timeout(function() {
      var canvas = document.getElementById('ft-qr-canvas');
      if (!canvas) return;
      QRCodeLib.toCanvas(canvas, link, { width: 180, margin: 1 }, function(err) {
        if (!err) qrRenderedFor = link;
      });
    }, 0);
  }
  $scope.$watchGroup([function() { return c.st.state; }, function() { return c.st.inviteToken; }], renderQr);
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
