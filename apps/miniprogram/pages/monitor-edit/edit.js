const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

const TYPE_OPTIONS = ['http', 'tcp', 'ping', 'keyword', 'ssl', 'dns', 'heartbeat', 'domain', 'tamper', 'pagespeed', 'api_json'];
const INTERVAL_LABELS = ['30 秒', '60 秒', '2 分', '3 分', '5 分', '10 分', '15 分', '30 分', '60 分'];
const INTERVAL_VALUES = [30, 60, 120, 180, 300, 600, 900, 1800, 3600];
const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
const REGION_OPTIONS = ['us-east', 'eu-west', 'ap-southeast', 'ap-northeast', 'us-west', 'eu-central', 'sa-east', 'ap-south'];

Page({
  data: {
    id: '',
    monitor: null,
    loading: true,
    saving: false,
    error: '',
    isNew: false,
    form: { name: '', targetUrl: '', type: 'http', intervalSeconds: 300, regions: ['us-east'], method: 'GET', body: '', headers: '' },
    httpMethodIndex: 0,
    regionIndex: 0,
    alertFailures: 1,
    webhookEnabled: true,
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
    intervalOptions: INTERVAL_LABELS,
    intervalValues: INTERVAL_VALUES,
    intervalIndex: 4,
    httpMethods: HTTP_METHODS,
    regionOptions: REGION_OPTIONS,
    targetPlaceholder: 'https://example.com',
    showAdvanced: false,
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
      var intIdx = INTERVAL_VALUES.indexOf(300);
      this.setData({
        isNew: true,
        loading: false,
        monitor: {},
        form: { name: '', targetUrl: '', type: 'http', intervalSeconds: 300, regions: ['us-east'], method: 'GET', body: '', headers: '' },
        typeIndex: 0,
        intervalIndex: intIdx >= 0 ? intIdx : 4,
      });
      wx.setNavigationBarTitle({ title: '创建监控' });
    }
  },

  loadMonitor(id) {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getMonitor(id).then(function (monitor) {
      var typeIdx = TYPE_OPTIONS.indexOf(monitor.type);
      var intIdx = INTERVAL_VALUES.indexOf(monitor.intervalSeconds);
      var cfg = monitor.config || {};
      var method = cfg.method || 'GET';
      var methodIdx = HTTP_METHODS.indexOf(method);
      var regions = monitor.regions || ['us-east'];
      var regionIdx = REGION_OPTIONS.indexOf(regions[0]);
      var consecutiveFailures = typeof cfg.consecutiveFailuresBeforeAlert === 'number' ? cfg.consecutiveFailuresBeforeAlert : 1;
      var webhookEnabled = typeof cfg.webhookEnabled === 'boolean' ? cfg.webhookEnabled : true;

      self.setData({
        monitor: monitor,
        form: {
          name: monitor.name,
          targetUrl: monitor.targetUrl,
          type: monitor.type,
          intervalSeconds: monitor.intervalSeconds,
          regions: regions,
          method: method,
          body: cfg.body || '',
          headers: JSON.stringify(cfg.headers || {}),
        },
        typeIndex: typeIdx >= 0 ? typeIdx : 0,
        intervalIndex: intIdx >= 0 ? intIdx : 4,
        httpMethodIndex: methodIdx >= 0 ? methodIdx : 0,
        regionIndex: regionIdx >= 0 ? regionIdx : 0,
        alertFailures: consecutiveFailures,
        webhookEnabled: webhookEnabled,
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
    var idx = parseInt(e.detail.value);
    var type = TYPE_OPTIONS[idx] || 'http';
    var placeholder = 'https://example.com';
    if (type === 'dns' || type === 'domain') placeholder = 'example.com';
    else if (type === 'ping') placeholder = '8.8.8.8 or example.com';
    else if (type === 'tcp') placeholder = 'example.com';
    else if (type === 'heartbeat') placeholder = 'heartbeat token name';
    this.setData({ typeIndex: idx, 'form.type': type, targetPlaceholder: placeholder });
  },

  onIntervalChange: function (e) {
    var idx = parseInt(e.detail.value);
    this.setData({
      intervalIndex: idx,
      'form.intervalSeconds': INTERVAL_VALUES[idx],
    });
  },

  onMethodChange: function (e) {
    var idx = parseInt(e.detail.value);
    this.setData({ httpMethodIndex: idx, 'form.method': HTTP_METHODS[idx] });
  },

  onRegionChange: function (e) {
    var idx = parseInt(e.detail.value);
    this.setData({ regionIndex: idx, 'form.regions': [REGION_OPTIONS[idx]] });
  },

  onBodyInput: function (e) {
    this.setData({ 'form.body': e.detail.value });
  },

  onHeadersInput: function (e) {
    this.setData({ 'form.headers': e.detail.value });
  },

  onAlertFailuresInput: function (e) {
    var val = parseInt(e.detail.value) || 1;
    this.setData({ alertFailures: Math.min(10, Math.max(1, val)) });
  },

  toggleWebhook: function (e) {
    this.setData({ webhookEnabled: !!e.detail.value });
  },

  toggleAdvanced: function () {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  },

  buildConfig: function () {
    var self = this;
    var f = self.data.form;
    var type = f.type;
    var cfg = {};

    if (type === 'http' || type === 'keyword' || type === 'api_json') {
      if (f.method && f.method !== 'GET') cfg.method = f.method;
      if (f.body) cfg.body = f.body;
      if (f.headers) {
        try { cfg.headers = JSON.parse(f.headers); } catch (e) { cfg.headers = {}; }
      }
    }

    cfg.consecutiveFailuresBeforeAlert = self.data.alertFailures;
    cfg.webhookEnabled = self.data.webhookEnabled;

    return cfg;
  },

  onSave: function () {
    var self = this;
    var f = self.data.form;

    if (!f.name) { self.setData({ error: '请输入名称' }); return; }
    if (!f.targetUrl && f.type !== 'heartbeat') { self.setData({ error: '请输入目标 URL' }); return; }

    self.setData({ saving: true, error: '' });

    var payload = {
      name: f.name,
      targetUrl: f.targetUrl,
      intervalSeconds: f.intervalSeconds,
      config: self.buildConfig(),
      regions: f.regions,
    };

    var promise;
    if (self.data.isNew) {
      payload.type = f.type;
      promise = api.createMonitor(payload);
    } else {
      promise = api.updateMonitor(self.data.id, payload);
    }

    promise.then(function () {
      wx.showToast({ title: self.data.isNew ? '监控已创建' : '监控已更新', icon: 'success' });
      wx.navigateBack();
    }).catch(function (err) {
      self.setData({ saving: false, error: err.message || '保存失败' });
    });
  },
});
