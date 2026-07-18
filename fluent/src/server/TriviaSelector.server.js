var TriviaSelector = Class.create();
TriviaSelector.prototype = {
  initialize: function() { this.scope = gs.getCurrentScopeName(); },

  _shuffle: function(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  },

  // question sys_ids answered by any of userIds within `days` (0 disables)
  _recentIds: function(userIds, days) {
    if (!days) return [];
    var ids = [];
    var r = new GlideRecord(this.scope + '_response');
    r.addQuery('player', 'IN', userIds.join(','));
    r.addQuery('sys_created_on', '>=', gs.daysAgoStart(days));
    r.query();
    while (r.next()) ids.push(r.getValue('question'));
    return ids;
  },

  _candidates: function(categoryIds, pool, excludeIds, difficulty) {
    var q = new GlideRecord(this.scope + '_question');
    q.addQuery('active', true);
    q.addQuery('pool', pool);
    q.addQuery('category', 'IN', categoryIds.join(','));
    if (difficulty) q.addQuery('difficulty', difficulty);
    if (excludeIds.length) q.addQuery('sys_id', 'NOT IN', excludeIds.join(','));
    q.query();
    var out = [];
    while (q.next()) out.push(q.getUniqueValue());
    return out;
  },

  roundCategories: function(categoryIds, n) {
    var order = this._shuffle(categoryIds.slice());
    var out = [];
    for (var i = 0; i < n; i++) out.push(order[i % order.length]);
    return out;
  },

  pickUniform: function(categoryIds, n, userIds) {
    var days = 90;
    var cands = [];
    while (true) {
      cands = this._candidates(categoryIds, 'game', this._recentIds(userIds, days), 0);
      if (cands.length >= n || days === 0) break;
      days = Math.floor(days / 2);
      if (days < 3) days = 0;
    }
    return this._shuffle(cands).slice(0, n);
  },

  pickForUser: function(categoryId, userId, excludeIds, pool) {
    var target = new TriviaSkill().targetDifficulty(userId, categoryId);
    var days = 90;
    while (true) {
      var recent = this._recentIds([userId], days).concat(excludeIds);
      var tries = [target, target - 1, target + 1, 0]; // 0 = any difficulty
      for (var i = 0; i < tries.length; i++) {
        if (tries[i] < 0 || tries[i] > 5) continue;
        var cands = this._candidates([categoryId], pool, recent, tries[i]);
        if (cands.length) return this._shuffle(cands)[0];
      }
      if (days === 0) return '';
      days = Math.floor(days / 2);
      if (days < 3) days = 0;
    }
  },
  type: 'TriviaSelector'
};
