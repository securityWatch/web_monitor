const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const env = require('../../config/env.js');

function formatAccountLabel(email) {
  if (email && email.indexOf('@users.wechat.pulsewatch') > 0) {
    return '微信快捷账号';
  }
  return email || '';
}

Page({
  data: {
    user: null,
    organization: null,
    accountLabel: '',
    apiBase: '',
    wechatEnabled: false,
    bindingWechat: false,
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
    const self = this;
    const user = stored.user;
    const isWeChat = user && user.email && user.email.indexOf('@users.wechat.pulsewatch') > 0;
    this.setData({
      user: user,
      organization: stored.organization,
      accountLabel: formatAccountLabel(user && user.email),
      isWeChatAccount: isWeChat,
      apiBase: env.baseUrl,
    });
    api
      .getWechatStatus()
      .then(function (res) {
        self.setData({ wechatEnabled: !!(res && res.enabled) });
      })
      .catch(function () {});
  },

  bindWechat() {
    const self = this;
    if (self.data.bindingWechat) return;
    self.setData({ bindingWechat: true });
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          self.setData({ bindingWechat: false });
          wx.showToast({ title: '获取微信凭证失败', icon: 'none' });
          return;
        }
        api
          .bindWechat(loginRes.code)
          .then(function () {
            wx.showToast({ title: '微信已绑定', icon: 'success' });
          })
          .catch(function (err) {
            wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
          })
          .finally(function () {
            self.setData({ bindingWechat: false });
          });
      },
      fail: function () {
        self.setData({ bindingWechat: false });
        wx.showToast({ title: '无法连接微信', icon: 'none' });
      },
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
