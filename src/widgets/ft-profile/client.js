api.controller = function($scope, $sce) {
  var c = this;
  c.data = $scope.data;
  c.nickname = c.data.profile.nickname;
  c.trust = function(html) { return $sce.trustAsHtml(html); };
  c.save = function(source, avatarId) {
    c.server.get({ action: 'save', payload: { nickname: c.nickname, avatarSource: source, avatarId: avatarId || '' } })
      .then(function(r) { c.data = r.data; });
  };
  // upload: file input -> canvas circle-crop to 256x256 jpeg -> attachment API
  c.upload = function(files) {
    if (!files || !files.length) return;
    c.uploadError = '';
    var img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(img.src);
      var canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      var ctx = canvas.getContext('2d');
      var side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      canvas.toBlob(function(blob) {
        var fd = new FormData();
        fd.append('table_name', c.data.profileTable);
        fd.append('table_sys_id', c.data.profile.profileId);
        fd.append('uploadFile', blob, 'avatar.jpg');
        fetch('/api/now/attachment/upload', {
          method: 'POST',
          headers: { 'X-UserToken': window.g_ck },
          body: fd
        }).then(function(res) {
          if (res.ok) { c.save('upload'); }
          else { $scope.$applyAsync(function() { c.uploadError = 'Upload failed (' + res.status + '). Please try again.'; }); }
        });
      }, 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(files[0]);
  };
};
