const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

Page({
  data: {
    id: '',
    monitor: null,
    checks: [],
    stats: null,
    loading: true,
    error: '',
  },

  onLoad(options) {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ id: options.id });
    this.loadAll(options.id);
  },

  onPullDownRefresh() {
    this.loadAll(this.data.id).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadAll(id) {
    this.setData({ loading: true, error: '' });
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
});
