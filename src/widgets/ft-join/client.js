api.controller = function($scope, $window) {
  var c = this;
  c.data = $scope.data;
  c.token = c.data.token;
  // Login goes through the PROTECTED twin of this page (ft_join_go, same
  // widget, public=false): an unauthenticated hit there makes the platform
  // capture nav_to and return here after login. /login.do?sysparm_goto_url
  // is NOT used - this instance ignores it for post-login routing (verified
  // live 2026-07-20: new users landed on the ServiceNow app page).
  c.loginUrl = '/trivia?id=ft_join_go&t=' + encodeURIComponent(c.token);

  // Registration form state. Never prefilled from server data, never
  // interpolated back into the template -- ng-model only, cleared right
  // after every submit attempt (success or failure) so the password value
  // doesn't linger in scope longer than the single fetch call that needs it.
  c.form = { nickname: '', email: '', password: '' };
  c.busy = false;
  c.err = '';
  c.registered = false;

  // Authenticated + valid lobby token: server already called ensureJoined;
  // just send them straight to the game.
  if (c.data.redirect) $window.location.href = c.data.redirect;

  var REASONS = {
    invalid: "This invite link doesn't look right — ask your host for a fresh one.",
    not_lobby: 'This game has already started or finished.',
    duplicate_email: 'That email is already registered — log in instead.',
    rate_limited: 'Too many signups right now — try again in a few minutes.',
    missing_fields: 'Please fill in every field.',
    error: 'Something went wrong — ask your host for help.'
  };
  c.reasonMessage = function(reason) { return REASONS[reason] || REASONS.error; };

  c.register = function() {
    if (c.busy) return;
    c.err = '';
    c.busy = true;
    var body = {
      token: c.token,
      nickname: c.form.nickname,
      email: c.form.email,
      password: c.form.password
    };
    fetch(c.data.registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json();
    }).then(function(r) {
      if (r.ok) {
        // Auto-login: the visitor's own browser re-submits the credentials
        // they just typed to the instance's standard login endpoint (same
        // origin, one POST), then navigates to the protected join URL.
        // If the login stuck, they land straight in the game; if the
        // instance rejected it, the protected page shows the normal login
        // - identical to the old manual flow. Either way we navigate, so
        // no response parsing and no credential retention: both fields are
        // cleared the moment the POST is dispatched.
        var creds = new URLSearchParams();
        creds.append('user_name', body.email.trim().toLowerCase());
        creds.append('user_password', c.form.password || body.password);
        creds.append('sys_action', 'sysverb_login');
        creds.append('ni.nolog.user_password', 'true');
        body.password = '';
        c.form.password = '';
        $scope.$apply(function() { c.registered = true; c.busy = true; });
        fetch('/login.do', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: creds.toString(),
          credentials: 'same-origin'
        }).catch(function() { /* fallback below still routes via login page */ })
          .then(function() { $window.location.href = c.loginUrl; });
      } else {
        $scope.$apply(function() {
          c.busy = false;
          body.password = '';
          c.form.password = '';
          c.err = c.reasonMessage(r.reason);
        });
      }
    }).catch(function() {
      $scope.$apply(function() {
        c.busy = false;
        c.form.password = '';
        c.err = c.reasonMessage('error');
      });
    });
  };
};
