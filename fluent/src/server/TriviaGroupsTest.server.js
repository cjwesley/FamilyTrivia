var TriviaGroupsTest = Class.create();
TriviaGroupsTest.prototype = Object.extendsObject(TriviaTestBase, {
  _scope: function() { return gs.getCurrentScopeName(); },
  _ensureTestUser: function(suffix) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('user_name', 'famtriv.test.' + suffix); gr.query();
    if (gr.next()) return gr.getUniqueValue();
    gr.initialize(); gr.setValue('user_name', 'famtriv.test.' + suffix);
    gr.setValue('first_name', 'Test'); gr.setValue('last_name', suffix);
    return gr.insert();
  },
  _makeGroup: function(name, ownerId, active) {
    var gr = new GlideRecord(this._scope() + '_group');
    gr.initialize();
    gr.setValue('name', name);
    gr.setValue('owner', ownerId);
    gr.setValue('active', active !== false);
    return gr.insert();
  },
  _memberCount: function(groupId) {
    var gr = new GlideRecord(this._scope() + '_group_member');
    gr.addQuery('group', groupId);
    gr.query();
    var n = 0;
    while (gr.next()) n++;
    return n;
  },
  _cleanupGroup: function(groupId) {
    var s = this._scope();
    var m = new GlideRecord(s + '_group_member');
    m.addQuery('group', groupId); m.query();
    while (m.next()) m.deleteRecord();
    var g = new GlideRecord(s + '_group');
    if (g.get(groupId)) g.deleteRecord();
  },
  testEnsureMemberIdempotent: function() {
    var u = this._ensureTestUser('grpEnsure');
    var gid = this._makeGroup('ZZ Grp A', u, true);
    try {
      var groups = new TriviaGroups();
      var id1 = groups.ensureMember(u, gid);
      this.assert(!!id1, 'first ensureMember returns an id');
      this.assertEqual(this._memberCount(gid), 1, 'exactly one group_member row after first call');
      var id2 = groups.ensureMember(u, gid);
      this.assertEqual(id2, id1, 'second ensureMember returns the same id');
      this.assertEqual(this._memberCount(gid), 1, 'still exactly one group_member row after second call');
    } finally {
      this._cleanupGroup(gid);
    }
  },
  testUserGroupsAndIsMember: function() {
    var u = this._ensureTestUser('grpUG');
    var gidMember = this._makeGroup('ZZ Grp B Member', u, true);
    var gidOther = this._makeGroup('ZZ Grp B Other', u, true);
    try {
      var groups = new TriviaGroups();
      groups.ensureMember(u, gidMember);
      var list = groups.userGroups(u);
      this.assertEqual(list.length, 1, 'userGroups returns exactly one group');
      this.assertEqual(list[0].id, gidMember, 'userGroups returns the joined group id');
      this.assertEqual(list[0].name, 'ZZ Grp B Member', 'userGroups returns the group name');
      this.assert(groups.isMember(u, gidMember), 'isMember true for joined group');
      this.assert(!groups.isMember(u, gidOther), 'isMember false for un-joined group');
    } finally {
      this._cleanupGroup(gidMember);
      this._cleanupGroup(gidOther);
    }
  },
  testInactiveGroupRefused: function() {
    var u = this._ensureTestUser('grpInactive');
    var gid = this._makeGroup('ZZ Grp C Inactive', u, false);
    try {
      var groups = new TriviaGroups();
      var id = groups.ensureMember(u, gid);
      this.assertEqual(id, '', 'ensureMember refuses inactive group');
      this.assertEqual(this._memberCount(gid), 0, 'no group_member row created for inactive group');
      this.assert(!groups.isMember(u, gid), 'isMember false for inactive group');
      var list = groups.userGroups(u);
      var found = false;
      for (var i = 0; i < list.length; i++) if (list[i].id === gid) found = true;
      this.assert(!found, 'userGroups omits inactive group');
    } finally {
      this._cleanupGroup(gid);
    }
  },
  testNewTokenShape: function() {
    var groups = new TriviaGroups();
    var t1 = groups.newToken();
    var t2 = groups.newToken();
    this.assertEqual(t1.length, 40, 'token is 40 chars');
    this.assertEqual(t2.length, 40, 'second token is 40 chars');
    this.assert(t1 !== t2, 'two calls produce different tokens');
  },
  type: 'TriviaGroupsTest'
});
