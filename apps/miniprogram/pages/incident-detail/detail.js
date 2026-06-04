const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

Page({
  data: {
    id: '',
    incident: null,
    notes: [],
    loading: true,
    error: '',
    noteContent: '',
    noteSaving: false,
  },

  onLoad(options) {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ id: options.id });
    this.loadIncident(options.id);
  },

  onPullDownRefresh() {
    this.loadIncident(this.data.id).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadIncident(id) {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getIncident(id).then(function (data) {
      var inc = data.incident || data;
      var timeline = data.timeline || inc.notes || [];
      self.setData({
        incident: Object.assign({}, inc, {
          statusLabel: format.incidentStatusLabel(inc.status),
          severityLabel: format.severityLabel(inc.severity),
          startedText: format.formatDateTime(inc.startedAt),
          resolvedText: inc.resolvedAt ? format.formatDateTime(inc.resolvedAt) : '—',
        }),
        notes: timeline.map(function (n) {
          return Object.assign({}, n, {
            timeText: format.formatDateTime(n.createdAt),
            action: n.message || n.content || '',
          });
        }),
        loading: false,
      });
      wx.setNavigationBarTitle({ title: inc.title || inc.monitorName || '事件详情' });
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  onNoteInput: function (e) {
    this.setData({ noteContent: e.detail.value });
  },

  addNote: function () {
    var self = this;
    var content = self.data.noteContent.trim();
    if (!content) return;
    self.setData({ noteSaving: true });
    api.addIncidentNote(self.data.id, content).then(function () {
      self.setData({ noteContent: '', noteSaving: false });
      self.loadIncident(self.data.id);
      wx.showToast({ title: '笔记已添加', icon: 'success' });
    }).catch(function (err) {
      self.setData({ noteSaving: false });
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    });
  },

  resolveIncident: function () {
    var self = this;
    wx.showModal({
      title: '确认',
      content: '确定将此事件标记为已恢复？',
      success: function (res) {
        if (res.confirm) {
          api.resolveIncident(self.data.id).then(function () {
            self.loadIncident(self.data.id);
            wx.showToast({ title: '已标记恢复', icon: 'success' });
          }).catch(function (err) {
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
          });
        }
      },
    });
  },
});
