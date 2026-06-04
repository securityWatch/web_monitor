const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');
const env = require('../../config/env.js');

Page({
  data: {
    id: '',
    monitor: null,
    checks: [],
    stats: null,
    loading: true,
    error: '',
    badgeCopied: '',
    expandedCheck: null,
  },

  onLoad(options) {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ id: options.id, env: { baseUrl: env.baseUrl } });
    this.loadAll(options.id);
    this._timer = setInterval(function () {
      this.loadAll(this.data.id, true);
    }.bind(this), 15000);
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer);
  },

  onPullDownRefresh() {
    this.loadAll(this.data.id).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadAll(id, silent) {
    if (!silent) this.setData({ loading: true, error: '' });
    const self = this;
    return Promise.all([api.getMonitor(id), api.getMonitorStats(id), api.getMonitorChecks(id)])
      .then(function (results) {
        const monitor = results[0];
        const statsData = results[1];
        const checksData = results[2];
        const checks = (checksData.checks || []).map(function (c) {
          return Object.assign({}, c, {
            timeText: format.formatDateTime(c.checkedAt),
            statusText: c.isUp ? '正常' : '异常',
            responseText: c.responseMs != null ? c.responseMs + ' ms' : '—',
            codeText: c.statusCode != null ? String(c.statusCode) : '—',
            hasError: !!c.errorMessage,
            errorMessage: c.errorMessage || '',
          });
        });
        self.setData({
          monitor: Object.assign({}, monitor, {
            statusLabel: format.statusLabel(monitor.status),
            lastCheckText: format.formatRelative(monitor.lastCheckedAt),
            intervalText: monitor.intervalSeconds + ' 秒',
          }),
          stats: statsData.summary || null,
          checks: checks,
          loading: false,
        });
        wx.setNavigationBarTitle({ title: monitor.name || '监控详情' });
      })
      .catch(function (err) {
        self.setData({
          error: err.message || '加载失败',
          loading: false,
        });
      });
  },

  toggleCheckDetail: function (e) {
    var idx = e.currentTarget.dataset.index;
    this.setData({
      expandedCheck: this.data.expandedCheck === idx ? null : idx,
    });
  },

  editMonitor: function () {
    wx.navigateTo({ url: '/pages/monitor-edit/edit?id=' + this.data.id });
  },

  togglePause: function () {
    var self = this;
    var monitor = self.data.monitor;
    var isPaused = monitor.status === 'paused';
    var action = isPaused ? api.resumeMonitor : api.pauseMonitor;
    action(this.data.id).then(function () {
      self.loadAll(self.data.id);
      wx.showToast({ title: isPaused ? '监控已恢复' : '监控已暂停', icon: 'success' });
    }).catch(function (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  deleteMonitor: function () {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + (self.data.monitor && self.data.monitor.name) + '」吗？此操作不可撤销。',
      success: function (res) {
        if (res.confirm) {
          api.deleteMonitor(self.data.id).then(function () {
            wx.showToast({ title: '监控已删除', icon: 'success' });
            wx.navigateBack();
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },

  copyBadgeMarkdown: function () {
    const token = this.data.monitor && this.data.monitor.publicBadgeToken;
    if (!token) return;
    const code = '![PulseWatch](' + env.baseUrl + '/api/v1/public/badge/' + token + '.svg)';
    const self = this;
    wx.setClipboardData({
      data: code,
      success: function () {
        self.setData({ badgeCopied: 'markdown' });
        setTimeout(function () {
          self.setData({ badgeCopied: '' });
        }, 2000);
      },
    });
  },

  copyBadgeHTML: function () {
    const token = this.data.monitor && this.data.monitor.publicBadgeToken;
    if (!token) return;
    const code = '<img src="' + env.baseUrl + '/api/v1/public/badge/' + token + '.svg" alt="PulseWatch uptime badge" />';
    const self = this;
    wx.setClipboardData({
      data: code,
      success: function () {
        self.setData({ badgeCopied: 'html' });
        setTimeout(function () {
          self.setData({ badgeCopied: '' });
        }, 2000);
      },
    });
  },

  regenerateBadgeToken: function () {
    const self = this;
    const id = this.data.id;
    self.setData({ regeneratingBadge: true });
    api
      .regenerateBadgeToken(id)
      .then(function (res) {
        const monitor = Object.assign({}, self.data.monitor, { publicBadgeToken: res.token });
        self.setData({ monitor: monitor, regeneratingBadge: false, badgeCopied: '' });
        wx.showToast({ title: '令牌已更新', icon: 'success' });
      })
      .catch(function (err) {
        self.setData({ regeneratingBadge: false });
        wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      });
  },
});
