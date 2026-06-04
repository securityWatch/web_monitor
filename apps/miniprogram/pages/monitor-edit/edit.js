const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

const TYPE_OPTIONS = ['http', 'tcp', 'ping', 'keyword', 'ssl', 'dns', 'heartbeat'];
const INTERVAL_OPTIONS = ['30', '60', '120', '180', '300', '600', '900', '1800', '3600'];

Page({
  data: {
    id: '',
    monitor: null,
    loading: true,
    saving: false,
    error: '',
    isNew: false,
    form: { name: '', targetUrl: '', type: 'http', intervalSeconds: 300 },
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
    intervalOptions: INTERVAL_OPTIONS,
    intervalIndex: 4,
    targetPlaceholder: 'https://example.com',
  },

  onLoad(options) {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    if (options.id) {
      this.setData({ id: options.id, isNew: false });
      this.loadMonitor(options.id);
    } else {
      this.setData({
        isNew: true,
        loading: false,
        monitor: {},
        form: { name: '', targetUrl: '', type: 'http', intervalSeconds: 300 },
        typeIndex: 0,
        intervalIndex: 4,
      });
      wx.setNavigationBarTitle({ title: '创建监控' });
    }
  },

  loadMonitor(id) {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getMonitor(id).then(function (monitor) {
      var typeIdx = TYPE_OPTIONS.indexOf(monitor.type);
      var intIdx = INTERVAL_OPTIONS.indexOf(String(monitor.intervalSeconds));
      self.setData({
        monitor: monitor,
        form: {
          name: monitor.name,
          targetUrl: monitor.targetUrl,
          type: monitor.type,
          intervalSeconds: monitor.intervalSeconds,
        },
        typeIndex: typeIdx >= 0 ? typeIdx : 0,
        intervalIndex: intIdx >= 0 ? intIdx : 4,
        targetPlaceholder: 'https://example.com',
        loading: false,
      });
      wx.setNavigationBarTitle({ title: '编辑监控' });
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  onNameInput: function (e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onTargetUrlInput: function (e) {
    this.setData({ 'form.targetUrl': e.detail.value });
  },

  onTypeChange: function (e) {
    var idx = e.detail.value;
    var type = TYPE_OPTIONS[idx];
    var placeholder = 'https://example.com';
    if (type === 'dns' || type === 'domain') placeholder = 'example.com';
    else if (type === 'ping') placeholder = '8.8.8.8 or example.com';
    else if (type === 'tcp') placeholder = 'example.com';
    else if (type === 'heartbeat') placeholder = 'heartbeat token name';
    this.setData({ typeIndex: idx, 'form.type': type, targetPlaceholder: placeholder });
  },

  onIntervalChange: function (e) {
    var idx = e.detail.value;
    this.setData({
      intervalIndex: idx,
      'form.intervalSeconds': parseInt(INTERVAL_OPTIONS[idx]),
    });
  },

  onSave: function () {
    var self = this;
    var f = self.data.form;

    if (!f.name) { self.setData({ error: '请输入名称' }); return; }
    if (!f.targetUrl && f.type !== 'heartbeat') { self.setData({ error: '请输入目标 URL' }); return; }

    self.setData({ saving: true, error: '' });

    var promise;
    if (self.data.isNew) {
      promise = api.createMonitor({
        name: f.name,
        type: f.type,
        targetUrl: f.targetUrl,
        intervalSeconds: f.intervalSeconds,
      });
    } else {
      promise = api.updateMonitor(self.data.id, {
        name: f.name,
        targetUrl: f.targetUrl,
        intervalSeconds: f.intervalSeconds,
      });
    }

    promise.then(function () {
      wx.showToast({ title: self.data.isNew ? '监控已创建' : '监控已更新', icon: 'success' });
      wx.navigateBack();
    }).catch(function (err) {
      self.setData({ saving: false, error: err.message || '保存失败' });
    });
  },
});
