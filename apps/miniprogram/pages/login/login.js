const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    loading: false,
    wechatLoading: false,
    phoneLoading: false,
    wechatEnabled: false,
    showEmailForm: false,
    error: '',
    userInfo: null,
  },

  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/monitors/index' });
      return;
    }
    const self = this;
    api.getWechatStatus().then(function (res) {
      self.setData({ wechatEnabled: !!(res && res.enabled) });
    }).catch(function () {
      self.setData({ wechatEnabled: false });
    });
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value.trim() });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  toggleEmailForm() {
    this.setData({ showEmailForm: !this.data.showEmailForm, error: '' });
  },

  getUserProfile() {
    // wx.getUserProfile deprecated in newer WeChat — use wx.login directly
    this.doWechatLogin('', '');
  },

  doWechatLogin(displayName, avatarUrl) {
    const self = this;
    if (self.data.wechatLoading || self.data.loading) return;

    self.setData({ wechatLoading: true, error: '' });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          self.setData({ wechatLoading: false, error: '微信登录失败，请重试' });
          return;
        }
        api
          .wechatLogin(loginRes.code, { displayName: displayName, avatarUrl: avatarUrl })
          .then(function (data) {
            const app = getApp();
            app.setSession(data);
            wx.switchTab({ url: '/pages/monitors/index' });
          })
          .catch(function (err) {
            self.setData({
              wechatLoading: false,
              error: err.message || '微信登录失败',
            });
          });
      },
      fail: function () {
        self.setData({ wechatLoading: false, error: '无法连接微信，请稍后重试' });
      },
    });
  },

  onGetPhoneNumber(e) {
    const self = this;
    if (self.data.phoneLoading || self.data.wechatLoading || self.data.loading) return;

    // User denied the authorization
    if (e.detail.errMsg && e.detail.errMsg.indexOf('fail') >= 0) {
      self.setData({ error: '需要授权手机号才能登录，请使用微信快捷登录' });
      return;
    }

    const phoneCode = e.detail.code;

    // No code returned — phone auth may not be available on this device
    if (!phoneCode) {
      self.setData({ error: '手机号登录暂不可用，请使用微信快捷登录' });
      return;
    }

    self.setData({ phoneLoading: true, error: '' });

    // Get wx.login code for openID
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          self.setData({ phoneLoading: false, error: '微信登录失败，请重试' });
          return;
        }
        api
          .wechatPhoneLogin(phoneCode, loginRes.code, '')
          .then(function (data) {
            const app = getApp();
            app.setSession(data);
            wx.switchTab({ url: '/pages/monitors/index' });
          })
          .catch(function (err) {
            self.setData({
              phoneLoading: false,
              error: err.message || '手机号登录失败',
            });
          });
      },
      fail: function () {
        self.setData({ phoneLoading: false, error: '无法连接微信，请稍后重试' });
      },
    });
  },

  onSubmit() {
    const { email, password } = this.data;
    if (!email || !password) {
      this.setData({ error: '请输入邮箱和密码' });
      return;
    }

    this.setData({ loading: true, error: '' });

    api
      .login(email, password)
      .then(function (data) {
        const app = getApp();
        app.setSession(data);
        wx.switchTab({ url: '/pages/monitors/index' });
      })
      .catch(function (err) {
        this.setData({
          error: err.message || '登录失败，请检查账号密码',
          loading: false,
        });
      }.bind(this));
  },
});
