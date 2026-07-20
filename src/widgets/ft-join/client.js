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
      $scope.$apply(function() {
        c.busy = false;
        c.form.password = '';
        if (r.ok) c.registered = true;
        else c.err = c.reasonMessage(r.reason);
      });
    }).catch(function() {
      $scope.$apply(function() {
        c.busy = false;
        c.form.password = '';
        c.err = c.reasonMessage('error');
      });
    });
  };
};
