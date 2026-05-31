const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    email: '',
    password: '',
    loading: false,
    wechatLoading: false,
    wechatEnabled: false,
    showEmailForm: false,
    error: '',
  },

  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/monitors/index' });
      return;
    }
    this.initWechat();
  },

  initWechat() {
    const self = this;
    api
      .getWechatStatus()
      .then(function (res) {
        const enabled = !!(res && res.enabled);
        self.setData({ wechatEnabled: enabled });
        if (enabled) {
          self.onWechatLogin(true);
        }
      })
      .catch(function () {
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

  onWechatLogin(silentArg) {
    const silent = silentArg === true;
    const self = this;
    if (self.data.wechatLoading || self.data.loading) {
      return;
    }
    if (!silent) {
      self.setData({ wechatLoading: true, error: '' });
    } else {
      self.setData({ wechatLoading: true });
    }

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          self.finishWechat(silent, '微信登录失败，请重试');
          return;
        }
        api
          .wechatLogin(loginRes.code)
          .then(function (data) {
            const app = getApp();
            app.setSession(data);
            wx.switchTab({ url: '/pages/monitors/index' });
          })
          .catch(function (err) {
            self.finishWechat(silent, err.message || '微信登录失败');
          });
      },
      fail: function () {
        self.finishWechat(silent, '无法连接微信，请稍后重试');
      },
    });
  },

  finishWechat(silent, message) {
    this.setData({ wechatLoading: false });
    if (!silent && message) {
      this.setData({ error: message });
    }
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
