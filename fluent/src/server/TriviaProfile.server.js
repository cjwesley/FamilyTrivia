var TriviaProfile = Class.create();
TriviaProfile.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  getOrCreate: function(userId) {
    var created = false;
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (!p.next()) {
      var u = new GlideRecord('sys_user');
      u.get(userId);
      p.initialize();
      p.setValue('user', userId);
      p.setValue('nickname', u.getValue('first_name') || u.getValue('user_name'));
      p.setValue('avatar_source', 'gallery');
      p.insert(); p.get(p.getUniqueValue());
      created = true;
    }
    return { profileId: p.getUniqueValue(), nickname: p.getValue('nickname'),
             avatarSource: p.getValue('avatar_source'), avatarId: p.getValue('avatar'),
             created: created };
  },

  _initialSvg: function(nickname) {
    var letter = (nickname || '?').charAt(0).toUpperCase();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" fill="#9b5de5"/>' +
      '<text x="50" y="66" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">' +
      letter + '</text></svg>';
  },

  card: function(userId) {
    var info = this.getOrCreate(userId);
    var html = '';
    if (info.avatarSource === 'gallery' && info.avatarId) {
      var a = new GlideRecord(this.scope + '_avatar');
      if (a.get(info.avatarId)) html = a.getValue('svg');
    } else if (info.avatarSource === 'upload') {
      var att = new GlideRecord('sys_attachment');
      att.addQuery('table_name', this.scope + '_profile');
      att.addQuery('table_sys_id', info.profileId);
      att.orderByDesc('sys_created_on'); att.setLimit(1); att.query();
      if (att.next()) html = '<img src="/sys_attachment.do?sys_id=' + att.getUniqueValue() + '"/>';
    } else if (info.avatarSource === 'sn_photo') {
      var u = new GlideRecord('sys_user');
      if (u.get(userId) && u.getValue('photo'))
        html = '<img src="/' + u.getValue('photo') + '.iix"/>';
    }
    if (!html) html = this._initialSvg(info.nickname);
    return { userId: userId, nickname: info.nickname, avatarHtml: html };
  },

  cards: function(userIds) {
    var out = {};
    for (var i = 0; i < userIds.length; i++) out[userIds[i]] = this.card(userIds[i]);
    return out;
  },

  save: function(userId, data) {
    var p = new GlideRecord(this.scope + '_profile');
    p.addQuery('user', userId); p.query();
    if (!p.next()) return { error: 'no profile' };
    if (data.nickname) p.setValue('nickname', String(data.nickname).substring(0, 40));
    if (data.avatarSource) p.setValue('avatar_source', data.avatarSource);
    if (data.avatarId !== undefined) p.setValue('avatar', data.avatarId);
    p.update();
    return this.getOrCreate(userId);
  },
  type: 'TriviaProfile'
};
