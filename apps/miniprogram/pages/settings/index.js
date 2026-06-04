const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const env = require('../../config/env.js');

function formatAccountLabel(email) {
  if (email && email.indexOf('@users.wechat.pulsewatch') > 0) {
    return '微信快捷账号';
  }
  return email || '';
}

function formatTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0') + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

Page({
  data: {
    user: null,
    organization: null,
    accountLabel: '',
    isWeChatAccount: false,
    apiBase: '',
    version: '1.0.0',

    // Tabs
    activeTab: 'profile',

    // Profile
    displayName: '',
    profileMsg: '',

    // Password
    currentPassword: '',
    newPassword: '',
    passwordMsg: '',

    // Notifications
    notifyIncidents: true,
    notifyDaily: false,
    notifyWeekly: true,
    notifyProduct: false,
    notifySsl: true,
    notifyMsg: '',

    // Sessions
    sessions: [],
    sessionsLoading: false,

    // Members
    members: [],
    invitations: [],
    teamLoading: false,
    inviteEmail: '',
    inviteRole: 'member',

    // API Keys
    apiKeys: [],
    apiKeysLoading: false,
    newKeyName: '',
    newKeyResult: null,

    // Audit logs
    auditLogs: [],
    auditLoading: false,

    // Billing
    planTier: 'free',
    foundingMember: false,
    reportPeriod: 'weekly',
    systemReport: '',
    reportLoading: false,

    // WeChat
    wechatEnabled: false,
    bindingWechat: false,
    totalMonitors: 0,
    upCount: 0,
    downCount: 0,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadData();
  },

  loadData() {
    var self = this;
    var stored = auth.getAuth();
    var user = stored && stored.user;
    var org = stored && stored.organization;

    self.setData({
      user: user,
      organization: org,
      accountLabel: formatAccountLabel(user && user.email),
      isWeChatAccount: !!(user && user.email && user.email.indexOf('@users.wechat.pulsewatch') > 0),
      apiBase: env.baseUrl,
      displayName: (user && user.displayName) || '',
      planTier: (org && org.planTier) || 'free',
      foundingMember: !!(org && org.foundingMember),
    });

    // Load additional data
    self.loadSessions();
    self.loadTeam();
    self.loadApiKeys();
    self.loadAuditLogs();
    self.loadDashboard();

    api.getWechatStatus().then(function (res) {
      self.setData({ wechatEnabled: !!(res && res.enabled) });
    }).catch(function () {});
  },

  // ===== Tab switching =====
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, profileMsg: '', passwordMsg: '', notifyMsg: '' });
  },

  // ===== Profile =====
  onDisplayNameInput: function (e) {
    this.setData({ displayName: e.detail.value });
  },

  saveProfile: function () {
    var self = this;
    api.updateProfile({ displayName: self.data.displayName }).then(function () {
      var stored = auth.getAuth();
      stored.user.displayName = self.data.displayName;
      auth.setAuth(stored);
      self.setData({ profileMsg: '已保存' });
      setTimeout(function () { self.setData({ profileMsg: '' }); }, 2000);
    }).catch(function (err) {
      self.setData({ profileMsg: err.message || '保存失败' });
    });
  },

  // ===== Password =====
  onCurrentPasswordInput: function (e) {
    this.setData({ currentPassword: e.detail.value });
  },

  onNewPasswordInput: function (e) {
    this.setData({ newPassword: e.detail.value });
  },

  changePassword: function () {
    var self = this;
    var cp = self.data.currentPassword;
    var np = self.data.newPassword;
    if (!cp || !np) {
      self.setData({ passwordMsg: '请填写当前密码和新密码' });
      return;
    }
    if (np.length < 8) {
      self.setData({ passwordMsg: '新密码至少 8 位' });
      return;
    }
    self.setData({ passwordMsg: '' });
    api.changePassword(cp, np).then(function () {
      self.setData({ currentPassword: '', newPassword: '', passwordMsg: '密码已更新' });
      setTimeout(function () { self.setData({ passwordMsg: '' }); }, 2000);
    }).catch(function (err) {
      self.setData({ passwordMsg: err.message || '修改失败' });
    });
  },

  // ===== Notifications =====
  toggleNotify: function (e) {
    var key = e.currentTarget.dataset.key;
    var val = !this.data[key];
    this.setData({ notifyMsg: '' });
    var update = {};
    update[key] = val;
    this.setData(update);
  },

  saveNotify: function () {
    var self = this;
    api.updateNotifications({
      notifyIncidents: self.data.notifyIncidents,
      notifyDaily: self.data.notifyDaily,
      notifyWeekly: self.data.notifyWeekly,
      notifyProduct: self.data.notifyProduct,
      notifySsl: self.data.notifySsl,
    }).then(function () {
      self.setData({ notifyMsg: '已保存' });
      setTimeout(function () { self.setData({ notifyMsg: '' }); }, 2000);
    }).catch(function (err) {
      self.setData({ notifyMsg: err.message || '保存失败' });
    });
  },

  // ===== Sessions =====
  loadSessions: function () {
    var self = this;
    self.setData({ sessionsLoading: true });
    api.getSessions().then(function (data) {
      var list = data.sessions || data || [];
      self.setData({ sessions: list, sessionsLoading: false });
    }).catch(function () {
      self.setData({ sessionsLoading: false });
    });
  },

  revokeSession: function (e) {
    var self = this;
    var sessionId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定要撤销此会话吗？',
      success: function (res) {
        if (res.confirm) {
          api.revokeSession(sessionId).then(function () {
            self.loadSessions();
          }).catch(function (err) {
            wx.showToast({ title: err.message || '撤销失败', icon: 'none' });
          });
        }
      },
    });
  },

  // ===== Team =====
  loadTeam: function () {
    var self = this;
    self.setData({ teamLoading: true });
    Promise.all([
      api.getMembers().catch(function () { return []; }),
      api.getInvitations().catch(function () { return []; }),
    ]).then(function (results) {
      var members = results[0].members || results[0] || [];
      var invs = results[1].invitations || results[1] || [];
      self.setData({ members: members, invitations: invs, teamLoading: false });
    }).catch(function () {
      self.setData({ teamLoading: false });
    });
  },

  onInviteEmailInput: function (e) {
    this.setData({ inviteEmail: e.detail.value.trim() });
  },

  onInviteRoleChange: function (e) {
    this.setData({ inviteRole: e.detail.value });
  },

  inviteMember: function () {
    var self = this;
    var email = self.data.inviteEmail;
    if (!email) {
      wx.showToast({ title: '请输入邮箱', icon: 'none' });
      return;
    }
    api.createInvitation(email, self.data.inviteRole).then(function () {
      self.setData({ inviteEmail: '' });
      wx.showToast({ title: '邀请已发送', icon: 'success' });
      self.loadTeam();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '邀请失败', icon: 'none' });
    });
  },

  // ===== API Keys =====
  loadApiKeys: function () {
    var self = this;
    self.setData({ apiKeysLoading: true });
    api.getApiKeys().then(function (data) {
      var keys = data.apiKeys || data || [];
      self.setData({ apiKeys: keys, apiKeysLoading: false });
    }).catch(function () {
      self.setData({ apiKeysLoading: false });
    });
  },

  onNewKeyNameInput: function (e) {
    this.setData({ newKeyName: e.detail.value.trim(), newKeyResult: null });
  },

  createApiKey: function () {
    var self = this;
    var name = self.data.newKeyName;
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    api.createApiKey(name).then(function (data) {
      self.setData({ newKeyName: '', newKeyResult: data });
      self.loadApiKeys();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  },

  deleteApiKey: function (e) {
    var self = this;
    var keyId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定要删除此 API Key 吗？此操作不可撤销。',
      success: function (res) {
        if (res.confirm) {
          api.deleteApiKey(keyId).then(function () {
            self.loadApiKeys();
            self.setData({ newKeyResult: null });
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },

  copyApiKey: function (e) {
    var key = e.currentTarget.dataset.key;
    wx.setClipboardData({
      data: key,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },

  // ===== Audit Logs =====
  loadAuditLogs: function () {
    var self = this;
    self.setData({ auditLoading: true });
    api.getAuditLogs().then(function (data) {
      var logs = data.auditLogs || data.logs || data || [];
      if (Array.isArray(logs)) {
        logs = logs.map(function (l) {
          return Object.assign({}, l, { timeText: formatTime(l.createdAt || l.timestamp) });
        });
      }
      self.setData({ auditLogs: logs, auditLoading: false });
    }).catch(function () {
      self.setData({ auditLoading: false });
    });
  },

  // ===== Dashboard summary =====
  loadDashboard: function () {
    var self = this;
    api.getDashboard().then(function (data) {
      self.setData({
        totalMonitors: data.totalMonitors || 0,
        upCount: data.upCount || 0,
        downCount: data.downCount || 0,
      });
    }).catch(function () {});
  },

  // ===== Billing =====
  onReportPeriodChange: function (e) {
    this.setData({ reportPeriod: e.detail.value });
  },

  generateReport: function () {
    var self = this;
    self.setData({ reportLoading: true, systemReport: '' });
    api.getSystemReport(self.data.reportPeriod, false).then(function (data) {
      var report = data.report || data;
      var text = typeof report === 'string' ? report : JSON.stringify(report, null, 2);
      self.setData({ systemReport: text, reportLoading: false });
    }).catch(function (err) {
      self.setData({ reportLoading: false });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    });
  },

  // ===== WeChat bind =====
  bindWechat: function () {
    var self = this;
    if (self.data.bindingWechat) return;
    self.setData({ bindingWechat: true });
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          self.setData({ bindingWechat: false });
          wx.showToast({ title: '获取微信凭证失败', icon: 'none' });
          return;
        }
        api.bindWechat(loginRes.code).then(function () {
          wx.showToast({ title: '微信已绑定', icon: 'success' });
        }).catch(function (err) {
          wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
        }).finally(function () {
          self.setData({ bindingWechat: false });
        });
      },
      fail: function () {
        self.setData({ bindingWechat: false });
        wx.showToast({ title: '无法连接微信', icon: 'none' });
      },
    });
  },

  // ===== Logout =====
  logout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#34d399',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();
          app.clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },

  copyApiBase: function () {
    wx.setClipboardData({
      data: this.data.apiBase,
      success: function () {
        wx.showToast({ title: '已复制 API 地址', icon: 'none' });
      },
    });
  },
});
