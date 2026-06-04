const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    email: '',
    password: '',
    displayName: '',
    loading: false,
    error: '',
  },

  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/monitors/index' });
    }
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value.trim() });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onDisplayNameInput(e) {
    this.setData({ displayName: e.detail.value.trim() });
  },

  onSubmit() {
    const { email, password, displayName } = this.data;
    if (!email || !password) {
      this.setData({ error: '请填写邮箱和密码' });
      return;
    }
    if (password.length < 8) {
      this.setData({ error: '密码至少 8 位' });
      return;
    }

    this.setData({ loading: true, error: '' });

    api
      .register(email, password, displayName)
      .then(function (data) {
        const app = getApp();
        app.setSession(data);
        wx.switchTab({ url: '/pages/monitors/index' });
      })
      .catch(function (err) {
        this.setData({
          error: err.message || '注册失败',
          loading: false,
        });
      }.bind(this));
  },
});
