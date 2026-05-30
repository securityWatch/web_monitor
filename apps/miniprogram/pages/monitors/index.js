const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

Page({
  data: {
    monitors: [],
    loading: true,
    error: '',
    summary: { up: 0, down: 0, total: 0 },
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadMonitors();
  },

  onPullDownRefresh() {
    this.loadMonitors().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadMonitors() {
    this.setData({ loading: true, error: '' });
    return api
      .getMonitors()
      .then(
        function (monitors) {
          const enriched = monitors.map(function (m) {
            return Object.assign({}, m, {
              statusLabel: format.statusLabel(m.status),
              lastCheckText: format.formatRelative(m.lastCheckedAt),
              responseText: m.lastResponseMs != null ? m.lastResponseMs + ' ms' : '—',
              uptimeText: m.uptime24h != null ? m.uptime24h.toFixed(2) + '%' : '—',
            });
          });
          const up = enriched.filter(function (m) {
            return m.status === 'up';
          }).length;
          const down = enriched.filter(function (m) {
            return m.status === 'down';
          }).length;
          this.setData({
            monitors: enriched,
            loading: false,
            summary: { up: up, down: down, total: enriched.length },
          });
        }.bind(this)
      )
      .catch(
        function (err) {
          this.setData({
            error: err.message || '加载失败',
            loading: false,
          });
        }.bind(this)
      );
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/monitor-detail/detail?id=' + id });
  },
});
