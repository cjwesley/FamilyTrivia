(function() {
  var t = $sp.getParameter('t');
  data.token = t;

  // Registration endpoint URL: read the live operation_uri off
  // sys_ws_operation rather than hardcoding a path, because
  // sys_ws_definition.namespace is server-calculated from the app's vendor
  // prefix and can differ from the scope name (same reasoning as
  // tools/create-register-api.mjs / tools/run-tests.mjs).
  //
  // service_id='ftreg' alone is enough to pin the right definition (it's
  // unique instance-wide -- tools/create-register-api.mjs creates exactly
  // one). An earlier version also filtered on
  // sys_scope=gs.getCurrentApplicationId(), which empirically returned no
  // match here (verified via the unauthenticated GET in Step 3a: registerUrl
  // came back '' even though the sys_ws_definition row's sys_scope does
  // equal this app's scope sys_id when checked via the Table API) -- widget
  // server scripts evidently don't see gs.getCurrentApplicationId() resolve
  // to the owning scoped app in this execution context. Dropped rather than
  // debugged further since service_id alone is sufficient and simpler.
  data.registerUrl = '';
  var wsdef = new GlideRecord('sys_ws_definition');
  wsdef.addQuery('service_id', 'ftreg');
  wsdef.query();
  if (wsdef.next()) {
    var op = new GlideRecord('sys_ws_operation');
    op.addQuery('web_service_definition', wsdef.getUniqueValue());
    op.addQuery('name', 'register');
    op.query();
    if (op.next()) data.registerUrl = op.getValue('operation_uri');
  }

  data.authenticated = gs.isLoggedIn();

  if (data.authenticated) {
    // Authenticated caller: resolve the token ourselves (TriviaEngine, not
    // TriviaRegistration.validate -- that method is the guest-facing,
    // existence-only surface). Only a token whose game is still in lobby
    // auto-joins; anything else (invalid token, or a game that has already
    // moved past lobby) renders the same dead-link card a guest would see,
    // and gameId is never put into `data` for that branch.
    var eng = new TriviaEngine();
    var resolved = eng.resolveInvite(t);
    if (resolved && !resolved.error && resolved.state === 'lobby') {
      eng.ensureJoined(resolved.gameId, gs.getUserID());
      data.invite = { ok: true };
      data.redirect = '?id=ft_game&g=' + resolved.gameId;
    } else if (resolved && !resolved.error) {
      data.invite = { ok: false, reason: 'not_lobby' };
    } else {
      data.invite = { ok: false, reason: 'invalid' };
    }
  } else {
    // Guest: existence only. TriviaRegistration.validate() also returns a
    // gameId on success -- deliberately not copied into `data` here, so an
    // unauthenticated caller never learns any game detail beyond ok/reason.
    var v = new TriviaRegistration().validate(t);
    data.invite = v.ok ? { ok: true } : { ok: false, reason: v.reason };
  }
})();
