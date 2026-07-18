// Invite-gated account-creation service. Public/unauthenticated callers only
// ever reach this through the (future) join REST endpoint; that endpoint is
// the sole boundary enforcing "public surface leaks nothing beyond the
// game's existence pre-auth" -- this class itself trusts its callers.
//
// Password handling: the `password` parameter appears in exactly two places
// in this file -- the blank-check inside the missing_fields guard in
// register(), and the single `u.user_password.setDisplayValue(password)`
// call. It is never copied into another variable, never passed to gs.info/
// gs.warn/gs.error, and never placed into any returned object.
//
// DEVIATION FROM BRIEF (platform constraint, not a design choice): the
// brief's literal form is `gr.setDisplayValue('user_password', password)`.
// In this scoped app that throws
// `com.glide.script.fencing.MethodNotAllowedException: Function
// setDisplayValue is not allowed in scope x_tekvo_famtriv` --
// GlideRecord.setDisplayValue(field, value) is fenced for scoped
// applications. The documented scoped-safe equivalent (ServiceNow
// Community, multiple threads) is to call setDisplayValue on the
// GlideElement itself via dot-walk: `gr.user_password.setDisplayValue(value)`.
// This still routes through the platform's own password-hashing pipeline
// (the same mechanism the brief specifies) -- only the call surface
// differs; no custom hashing/encoding was introduced.
var TriviaRegistration = Class.create();
TriviaRegistration.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  // {ok:true, gameId} for a token matching a lobby-state game;
  // {ok:false, reason:'invalid'} for no match; {ok:false, reason:'not_lobby'}
  // for a real token whose game has moved past lobby.
  validate: function(token) {
    var t = (token || '').toString().trim();
    if (!t) return { ok: false, reason: 'invalid' };
    var g = new GlideRecord(this.scope + '_game');
    g.addQuery('invite_token', t);
    g.query();
    if (!g.next()) return { ok: false, reason: 'invalid' };
    if (g.getValue('state') !== 'lobby') return { ok: false, reason: 'not_lobby' };
    return { ok: true, gameId: g.getUniqueValue() };
  },

  // Registration caps enforced via registration_log counts, checked before
  // any insert: global >=30 in the last hour, per-game >=15 ever, per-IP
  // >=10 in the last hour.
  _capsExceeded: function(gameId, ip) {
    var s = this.scope;

    var global = new GlideAggregate(s + '_registration_log');
    global.addQuery('sys_created_on', '>=', gs.hoursAgoStart(1));
    global.addAggregate('COUNT');
    global.query();
    global.next();
    if ((parseInt(global.getAggregate('COUNT'), 10) || 0) >= 30) return true;

    var perGame = new GlideAggregate(s + '_registration_log');
    perGame.addQuery('game', gameId);
    perGame.addAggregate('COUNT');
    perGame.query();
    perGame.next();
    if ((parseInt(perGame.getAggregate('COUNT'), 10) || 0) >= 15) return true;

    var perIp = new GlideAggregate(s + '_registration_log');
    perIp.addQuery('ip', ip || '');
    perIp.addQuery('sys_created_on', '>=', gs.hoursAgoStart(1));
    perIp.addAggregate('COUNT');
    perIp.query();
    perIp.next();
    if ((parseInt(perIp.getAggregate('COUNT'), 10) || 0) >= 10) return true;

    return false;
  },

  // Creates sys_user + exactly the x_tekvo_famtriv.player role + Profile +
  // registration_log row. Does NOT join the game -- the join page does that
  // via ensureJoined after the new account logs in.
  //
  // Operation order (reads before any write; role looked up before the user
  // is created so a missing role can never leave a half-created account):
  //   1. missing_fields guard (blank after trim, before any query)
  //   2. validate(token) -> invalid / not_lobby
  //   3. cap check (registration_log counts) -> rate_limited
  //   4. duplicate check (sys_user user_name/email) -> duplicate_email
  //   5. role lookup by name -- throws if missing, before any insert
  //   6. insert sys_user (setDisplayValue for the password, exactly once)
  //   7. insert sys_user_has_role (exactly one row)
  //   8. create Profile (nickname)
  //   9. insert registration_log row
  register: function(token, nickname, email, password, ip) {
    if (!token || !String(token).trim() ||
        !nickname || !String(nickname).trim() ||
        !email || !String(email).trim() ||
        !password || !String(password).trim()) {
      return { ok: false, reason: 'missing_fields' };
    }

    var v = this.validate(token);
    if (!v.ok) return v;
    var gameId = v.gameId;

    if (this._capsExceeded(gameId, ip)) return { ok: false, reason: 'rate_limited' };

    var normEmail = String(email).trim().toLowerCase();
    var nick = String(nickname).trim().substring(0, 40);

    var dup = new GlideRecord('sys_user');
    dup.addQuery('user_name', normEmail).addOrCondition('email', normEmail);
    dup.query();
    if (dup.next()) return { ok: false, reason: 'duplicate_email' };

    var roleRec = new GlideRecord('sys_user_role');
    roleRec.addQuery('name', 'x_tekvo_famtriv.player');
    roleRec.query();
    if (!roleRec.next()) {
      // Config invariant, not a user-input case covered by the reason enum:
      // fail loudly, and only after zero inserts have happened.
      throw new Error('TriviaRegistration.register: role x_tekvo_famtriv.player not found; aborting before any user was created');
    }
    var roleId = roleRec.getUniqueValue();

    var u = new GlideRecord('sys_user');
    u.initialize();
    u.setValue('user_name', normEmail);
    u.setValue('email', normEmail);
    u.setValue('first_name', nick);
    u.setValue('active', true);
    u.user_password.setDisplayValue(password);
    var userId = u.insert();

    var hasRole = new GlideRecord('sys_user_has_role');
    hasRole.initialize();
    hasRole.setValue('user', userId);
    hasRole.setValue('role', roleId);
    hasRole.insert();

    new TriviaProfile().getOrCreate(userId);

    var log = new GlideRecord(this.scope + '_registration_log');
    log.initialize();
    log.setValue('user', userId);
    log.setValue('game', gameId);
    log.setValue('ip', ip || '');
    log.insert();

    return { ok: true, userName: normEmail };
  },

  type: 'TriviaRegistration'
};
