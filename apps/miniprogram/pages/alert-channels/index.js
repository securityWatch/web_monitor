var api = require('../../utils/api.js');
var auth = require('../../utils/auth.js');

var CHANNEL_TYPES = [
  { id: 'webhook', label: 'Webhook' },
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' },
  { id: 'teams', label: 'Microsoft Teams' },
  { id: 'dingtalk', label: '钉钉' },
  { id: 'feishu', label: '飞书' },
  { id: 'wecom', label: '企业微信' },
  { id: 'pagerduty', label: 'PagerDuty' },
  { id: 'opsgenie', label: 'Opsgenie' },
  { id: 'sms', label: '短信' },
  { id: 'voice', label: '语音电话' },
];

var EVENT_OPTIONS = [
  { id: 'all', label: '全部事件' },
  { id: 'down', label: '宕机' },
  { id: 'up', label: '恢复' },
  { id: 'security', label: '安全事件' },
  { id: 'ssl_warning', label: 'SSL 到期预警' },
  { id: 'dns_change', label: 'DNS 变更' },
  { id: 'tamper_major_change', label: '篡改检测' },
];

Page({
  data: {
    channels: [],
    loading: true,
    error: '',
    showForm: false,
    formMode: 'create',
    form: { name: '', url: '', secret: '', routingKey: '', apiKey: '', phone: '' },
    formType: 'webhook',
    formTypeIndex: 0,
    typeLabels: CHANNEL_TYPES.map(function (t) { return t.label; }),
    eventTypes: EVENT_OPTIONS.map(function (e) { return { id: e.id, label: e.label, selected: e.id === 'all' }; }),
    saving: false,
    editingId: '',
  },

  onShow: function () {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadChannels();
  },

  loadChannels: function () {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getAlertChannels().then(function (data) {
      var list = data.channels || data || [];
      self.setData({ channels: list, loading: false });
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  eventTypeLabel: function (types) {
    if (!types || types.length === 0 || types.indexOf('all') >= 0) return '全部事件';
    return types.map(function (id) {
      var found = EVENT_OPTIONS.find(function (e) { return e.id === id; });
      return found ? found.label : id;
    }).join(', ');
  },

  openCreate: function () {
    this.setData({
      showForm: true,
      formMode: 'create',
      form: { name: '', url: '', secret: '', routingKey: '', apiKey: '', phone: '' },
      formType: 'webhook',
      formTypeIndex: 0,
      eventTypes: EVENT_OPTIONS.map(function (e) { return { id: e.id, label: e.label, selected: e.id === 'all' }; }),
      editingId: '',
      error: '',
    });
  },

  openEdit: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var ch = self.data.channels.find(function (c) { return c.id === id; });
    if (!ch) return;
    var typeIdx = CHANNEL_TYPES.findIndex(function (t) { return t.id === ch.type; });
    var ets = EVENT_OPTIONS.map(function (e) {
      return { id: e.id, label: e.label, selected: (ch.eventTypes || ['all']).indexOf(e.id) >= 0 };
    });
    self.setData({
      showForm: true,
      formMode: 'edit',
      form: {
        name: ch.name,
        url: ch.config ? (ch.config.url || '') : '',
        secret: ch.config ? (ch.config.secret || '') : '',
        routingKey: ch.config ? (ch.config.routingKey || '') : '',
        apiKey: ch.config ? (ch.config.apiKey || '') : '',
        phone: ch.config ? (ch.config.phone || '') : '',
      },
      formType: ch.type,
      formTypeIndex: typeIdx >= 0 ? typeIdx : 0,
      eventTypes: ets,
      editingId: id,
      error: '',
    });
  },

  onNameInput: function (e) {
    this.setData({ 'form.name': e.detail.value });
  },
  onUrlInput: function (e) {
    this.setData({ 'form.url': e.detail.value });
  },
  onSecretInput: function (e) {
    this.setData({ 'form.secret': e.detail.value });
  },
  onRoutingKeyInput: function (e) {
    this.setData({ 'form.routingKey': e.detail.value });
  },
  onApiKeyInput: function (e) {
    this.setData({ 'form.apiKey': e.detail.value });
  },
  onPhoneInput: function (e) {
    this.setData({ 'form.phone': e.detail.value });
  },

  onTypeChange: function (e) {
    var idx = e.detail.value;
    var type = CHANNEL_TYPES[idx].id;
    this.setData({ formTypeIndex: idx, formType: type });
  },

  toggleEvent: function (e) {
    var id = e.currentTarget.dataset.id;
    var ets = this.data.eventTypes.map(function (et) {
      if (et.id !== id) return et;
      var newSel = !et.selected;
      return { id: et.id, label: et.label, selected: newSel };
    });
    // If selecting 'all', deselect others
    if (id === 'all' && !this.data.eventTypes.find(function (e) { return e.id === 'all'; }).selected) {
      ets = ets.map(function (e) { return { id: e.id, label: e.label, selected: e.id === 'all' }; });
    }
    // If deselecting last specific, re-select all
    var hasSpecific = ets.some(function (e) { return e.id !== 'all' && e.selected; });
    if (!hasSpecific) {
      ets = ets.map(function (e) { return { id: e.id, label: e.label, selected: e.id === 'all' }; });
    }
    this.setData({ eventTypes: ets });
  },

  buildPayload: function () {
    var self = this;
    var f = self.data.form;
    var type = self.data.formType;
    var config = {};
    var urlTypes = ['webhook', 'slack', 'discord', 'teams', 'dingtalk', 'feishu', 'wecom'];
    var cnSignTypes = ['dingtalk', 'feishu'];

    if (urlTypes.indexOf(type) >= 0) config.url = f.url;
    if (cnSignTypes.indexOf(type) >= 0) { config.secret = f.secret; config.signEnabled = !!f.secret; }
    if (type === 'pagerduty') config.routingKey = f.routingKey;
    if (type === 'opsgenie') config.apiKey = f.apiKey;
    if (type === 'sms' || type === 'voice') config.phone = f.phone;

    var selectedEvents = self.data.eventTypes.filter(function (e) { return e.selected; }).map(function (e) { return e.id; });
    if (selectedEvents.indexOf('all') >= 0) selectedEvents = ['all'];

    return {
      name: f.name,
      type: type,
      config: config,
      enabled: true,
      eventTypes: selectedEvents,
    };
  },

  saveForm: function () {
    var self = this;
    var f = self.data.form;
    if (!f.name) return;
    self.setData({ saving: true, error: '' });
    var payload = self.buildPayload();
    var promise;
    if (self.data.formMode === 'create') {
      promise = api.createAlertChannel(payload);
    } else {
      promise = api.updateAlertChannel(self.data.editingId, payload);
    }
    promise.then(function () {
      self.setData({ showForm: false, saving: false });
      wx.showToast({ title: self.data.formMode === 'create' ? '渠道已创建' : '渠道已更新', icon: 'success' });
      self.loadChannels();
    }).catch(function (err) {
      self.setData({ saving: false, error: err.message || '保存失败' });
    });
  },

  closeForm: function () {
    this.setData({ showForm: false });
  },

  toggleChannel: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var enabled = e.currentTarget.dataset.enabled === 'true';
    api.updateAlertChannel(id, { enabled: !enabled }).then(function () {
      self.loadChannels();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  testChannel: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    api.testAlertChannel(id).then(function () {
      wx.showToast({ title: '测试消息已发送', icon: 'success' });
    }).catch(function (err) {
      wx.showToast({ title: err.message || '发送失败', icon: 'none' });
    });
  },

  deleteChannel: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定删除此告警渠道吗？',
      success: function (res) {
        if (res.confirm) {
          api.deleteAlertChannel(id).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            self.loadChannels();
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },

  stopPropagation: function () {},
});
