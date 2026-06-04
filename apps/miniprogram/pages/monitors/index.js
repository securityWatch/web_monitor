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

  openNew() {
    wx.navigateTo({ url: '/pages/monitor-edit/edit' });
  },

  onLongPress(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var monitor = self.data.monitors.find(function (m) { return m.id === id; });
    if (!monitor) return;

    var items = ['编辑', '暂停/恢复', '删除'];
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        switch (res.tapIndex) {
          case 0:
            wx.navigateTo({ url: '/pages/monitor-edit/edit?id=' + id });
            break;
          case 1:
            self.togglePause(monitor);
            break;
          case 2:
            self.confirmDelete(monitor);
            break;
        }
      },
    });
  },

  togglePause: function (monitor) {
    var self = this;
    var action = monitor.status === 'paused' ? api.resumeMonitor : api.pauseMonitor;
    action(monitor.id).then(function () {
      self.loadMonitors();
      wx.showToast({ title: monitor.status === 'paused' ? '监控已恢复' : '监控已暂停', icon: 'success' });
    }).catch(function (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  confirmDelete: function (monitor) {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + monitor.name + '」吗？',
      success: function (res) {
        if (res.confirm) {
          api.deleteMonitor(monitor.id).then(function () {
            self.loadMonitors();
            wx.showToast({ title: '已删除', icon: 'success' });
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },
});
