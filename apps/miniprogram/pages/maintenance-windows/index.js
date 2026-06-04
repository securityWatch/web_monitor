var api = require('../../utils/api.js');
var auth = require('../../utils/auth.js');

function pad(n) { return n < 10 ? '0' + n : String(n); }

function formatTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: {
    windows: [],
    loading: true,
    error: '',
    showForm: false,
    saving: false,
    form: { name: '', message: '' },
    startDate: '',
    startTime: '00:00',
    endDate: '',
    endTime: '00:00',
  },

  onShow: function () {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadWindows();
  },

  loadWindows: function () {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getMaintenanceWindows().then(function (data) {
      var list = data.windows || data || [];
      self.setData({ windows: list, loading: false });
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  openCreate: function () {
    var now = new Date();
    var later = new Date(now.getTime() + 3600000);
    this.setData({
      showForm: true,
      form: { name: '', message: '' },
      startDate: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
      startTime: pad(now.getHours()) + ':' + pad(now.getMinutes()),
      endDate: later.getFullYear() + '-' + pad(later.getMonth() + 1) + '-' + pad(later.getDate()),
      endTime: pad(later.getHours()) + ':' + pad(later.getMinutes()),
      error: '',
    });
  },

  closeForm: function () { this.setData({ showForm: false }); },
  stopPropagation: function () {},

  onNameInput: function (e) { this.setData({ 'form.name': e.detail.value }); },
  onMessageInput: function (e) { this.setData({ 'form.message': e.detail.value }); },
  onStartDateChange: function (e) { this.setData({ startDate: e.detail.value }); },
  onStartTimeChange: function (e) { this.setData({ startTime: e.detail.value }); },
  onEndDateChange: function (e) { this.setData({ endDate: e.detail.value }); },
  onEndTimeChange: function (e) { this.setData({ endTime: e.detail.value }); },

  saveForm: function () {
    var self = this;
    var startsAt = self.data.startDate + 'T' + self.data.startTime + ':00+08:00';
    var endsAt = self.data.endDate + 'T' + self.data.endTime + ':00+08:00';
    self.setData({ saving: true, error: '' });
    api.createMaintenanceWindow({
      name: self.data.form.name || '维护窗口',
      startsAt: startsAt,
      endsAt: endsAt,
      message: self.data.form.message,
    }).then(function () {
      self.setData({ showForm: false, saving: false });
      wx.showToast({ title: '维护窗口已创建', icon: 'success' });
      self.loadWindows();
    }).catch(function (err) {
      self.setData({ saving: false, error: err.message || '创建失败' });
    });
  },

  confirmDelete: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定删除此维护窗口？',
      success: function (res) {
        if (res.confirm) {
          api.deleteMaintenanceWindow(id).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            self.loadWindows();
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },
});
