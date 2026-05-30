const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    email: '',
    password: '',
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
