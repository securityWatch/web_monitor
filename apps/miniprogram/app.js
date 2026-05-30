const auth = require('./utils/auth.js');

App({
  globalData: {
    user: null,
    organization: null,
  },

  onLaunch() {
    const stored = auth.getAuth();
    if (stored && stored.user) {
      this.globalData.user = stored.user;
      this.globalData.organization = stored.organization;
    }

    // 登录页为首页；已登录用户在 login 页 onLoad 中跳转至监控 Tab
  },

  setSession(authData) {
    this.globalData.user = authData.user;
    this.globalData.organization = authData.organization;
  },

  clearSession() {
    this.globalData.user = null;
    this.globalData.organization = null;
    auth.clearAuth();
  },
});
