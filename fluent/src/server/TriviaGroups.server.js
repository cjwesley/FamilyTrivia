var TriviaGroups = Class.create();
TriviaGroups.prototype = {
  initialize: function() {},
  _scope: function() { return gs.getCurrentScopeName(); },
  _isActiveGroup: function(groupId) {
    if (!groupId) return false;
    var g = new GlideRecord(this._scope() + '_group');
    if (!g.get(groupId)) return false;
    return g.getValue('active') == 'true' || g.getValue('active') === true || g.getValue('active') === '1';
  },
  userGroups: function(userId) {
    var s = this._scope();
    var m = new GlideRecord(s + '_group_member');
    m.addQuery('user', userId);
    m.addQuery('group.active', true);
    m.orderBy('group.name');
    m.query();
    var out = [];
    while (m.next()) {
      out.push({ id: m.getValue('group'), name: m.group.name.toString() });
    }
    return out;
  },
  isMember: function(userId, groupId) {
    if (!this._isActiveGroup(groupId)) return false;
    var m = new GlideRecord(this._scope() + '_group_member');
    m.addQuery('user', userId);
    m.addQuery('group', groupId);
    m.query();
    return m.next();
  },
  ensureMember: function(userId, groupId) {
    if (!this._isActiveGroup(groupId)) return '';
    var m = new GlideRecord(this._scope() + '_group_member');
    m.addQuery('user', userId);
    m.addQuery('group', groupId);
    m.query();
    if (m.next()) return m.getUniqueValue();
    m.initialize();
    m.setValue('user', userId);
    m.setValue('group', groupId);
    m.setValue('joined_on', new GlideDateTime());
    return m.insert();
  },
  newToken: function() {
    return (gs.generateGUID() + gs.generateGUID()).substring(0, 40);
  },
  type: 'TriviaGroups'
};
