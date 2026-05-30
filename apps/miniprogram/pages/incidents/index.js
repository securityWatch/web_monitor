const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

Page({
  data: {
    incidents: [],
    filter: 'all',
    loading: true,
    error: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadIncidents();
  },

  onPullDownRefresh() {
    this.loadIncidents().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ filter: filter });
    this.loadIncidents();
  },

  loadIncidents() {
    this.setData({ loading: true, error: '' });
    return api
      .getIncidents(this.data.filter)
      .then(
        function (incidents) {
          const enriched = incidents.map(function (inc) {
            return Object.assign({}, inc, {
              statusLabel: format.incidentStatusLabel(inc.status),
              severityLabel: format.severityLabel(inc.severity),
              startedText: format.formatDateTime(inc.startedAt),
              resolvedText: inc.resolvedAt ? format.formatDateTime(inc.resolvedAt) : '—',
            });
          });
          this.setData({ incidents: enriched, loading: false });
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
});
