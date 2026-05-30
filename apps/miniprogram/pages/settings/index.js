const auth = require('../../utils/auth.js');
const env = require('../../config/env.js');

Page({
  data: {
    user: null,
    organization: null,
    apiBase: '',
    version: '1.0.0',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const stored = auth.getAuth();
    this.setData({
      user: stored.user,
      organization: stored.organization,
      apiBase: env.baseUrl,
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#34d399',
      success: function (res) {
        if (res.confirm) {
          const app = getApp();
          app.clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },

  copyApiBase() {
    wx.setClipboardData({
      data: this.data.apiBase,
      success: function () {
        wx.showToast({ title: '已复制 API 地址', icon: 'none' });
      },
    });
  },
});
