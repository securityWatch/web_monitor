const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

function formatTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

Page({
  data: {
    stats: null,
    incidents: [],
    recentFailures: [],
    chartData: [],
    loading: true,
    error: '',
    greeting: '',
    userName: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    var stored = auth.getAuth();
    var name = (stored && stored.user && (stored.user.displayName || stored.user.email)) || '用户';
    var hour = new Date().getHours();
    var greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    this.setData({ userName: name, greeting: greeting });
    this.loadData();
    this._timer = setInterval(this.loadData.bind(this), 30000);
  },

  onHide: function () {
    if (this._timer) clearInterval(this._timer);
  },

  onUnload: function () {
    if (this._timer) clearInterval(this._timer);
  },

  loadData: function () {
    var self = this;
    api.getDashboard().then(function (data) {
      var chartData = [];
      var trend = data.responseTimeTrend || [];
      var maxMs = 1;
      trend.forEach(function (p) { if (p.avgMs > maxMs) maxMs = p.avgMs; });
      chartData = trend.map(function (p) {
        return {
          label: formatTime(p.time),
          ms: Math.round(p.avgMs),
          pct: Math.max(3, (p.avgMs / maxMs) * 100),
        };
      });
      self.setData({
        stats: data,
        chartData: chartData,
        recentFailures: data.recentFailures || [],
        incidents: (data.recentIncidents || []).map(function (inc) {
          return Object.assign({}, inc, {
            statusLabel: format.incidentStatusLabel(inc.status),
            startedText: format.formatDateTime(inc.startedAt),
          });
        }),
        loading: false,
        error: '',
      });
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  openIncident: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/incident-detail/detail?id=' + id });
  },
});
