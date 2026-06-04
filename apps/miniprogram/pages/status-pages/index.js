const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const format = require('../../utils/format.js');

function formatTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
}

Page({
  data: {
    pages: [],
    loading: true,
    error: '',
    showForm: false,
    formMode: 'create',
    form: { name: '', isPublic: true, customDomain: '' },
    saving: false,
    editingId: '',
    showAnnouncements: false,
    announcePageId: '',
    announcePageName: '',
    announcements: [],
    announceContent: '',
    announceSaving: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadPages();
  },

  loadPages: function () {
    var self = this;
    self.setData({ loading: true, error: '' });
    api.getStatusPages().then(function (data) {
      var pages = data.statusPages || data.pages || data || [];
      if (Array.isArray(pages)) {
        self.setData({ pages: pages, loading: false });
      } else {
        self.setData({ loading: false });
      }
    }).catch(function (err) {
      self.setData({ error: err.message || '加载失败', loading: false });
    });
  },

  openCreate: function () {
    this.setData({
      showForm: true,
      formMode: 'create',
      form: { name: '', isPublic: true, customDomain: '' },
      editingId: '',
    });
  },

  openDetail: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var page = self.data.pages.find(function (p) { return p.id === id; });
    if (!page) return;

    wx.showActionSheet({
      itemList: ['编辑', '管理公告', '删除'],
      success: function (res) {
        switch (res.tapIndex) {
          case 0:
            self.setData({
              showForm: true,
              formMode: 'edit',
              form: { name: page.name, isPublic: page.isPublic, customDomain: page.customDomain || '' },
              editingId: id,
            });
            break;
          case 1:
            self.openAnnouncements(id, page.name);
            break;
          case 2:
            self.confirmDelete(id, page.name);
            break;
        }
      },
    });
  },

  onFormName: function (e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onFormPublic: function (e) {
    this.setData({ 'form.isPublic': e.detail.value });
  },

  onFormDomain: function (e) {
    this.setData({ 'form.customDomain': e.detail.value });
  },

  saveForm: function () {
    var self = this;
    var f = self.data.form;
    if (!f.name) return;
    self.setData({ saving: true, error: '' });

    // Generate slug from name
    var slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';

    var promise;
    if (self.data.formMode === 'create') {
      promise = api.createStatusPage({ name: f.name, slug: slug, isPublic: f.isPublic, monitorIds: [] });
    } else {
      promise = api.updateStatusPage(self.data.editingId, { name: f.name, isPublic: f.isPublic, customDomain: f.customDomain || '' });
    }

    promise.then(function () {
      self.setData({ showForm: false, saving: false, editingId: '' });
      wx.showToast({ title: self.data.formMode === 'create' ? '状态页已创建' : '状态页已更新', icon: 'success' });
      self.loadPages();
    }).catch(function (err) {
      self.setData({ saving: false });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    });
  },

  closeForm: function () {
    this.setData({ showForm: false });
  },

  confirmDelete: function (id, name) {
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除状态页「' + name + '」吗？',
      success: function (res) {
        if (res.confirm) {
          api.deleteStatusPage(id).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            self.loadPages();
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },

  openAnnouncements: function (id, name) {
    var self = this;
    self.setData({
      showAnnouncements: true,
      announcePageId: id,
      announcePageName: name,
      announcements: [],
      announceContent: '',
    });
    api.getStatusPageAnnouncements(id).then(function (data) {
      var list = data.announcements || data || [];
      self.setData({ announcements: list });
    }).catch(function () {});
  },

  closeAnnouncements: function () {
    this.setData({ showAnnouncements: false });
  },

  onAnnounceContent: function (e) {
    this.setData({ announceContent: e.detail.value });
  },

  createAnnouncement: function () {
    var self = this;
    var content = self.data.announceContent.trim();
    if (!content) return;
    self.setData({ announceSaving: true });
    api.createAnnouncement(self.data.announcePageId, { title: content }).then(function () {
      self.setData({ announceContent: '', announceSaving: false });
      wx.showToast({ title: '公告已发布', icon: 'success' });
      api.getStatusPageAnnouncements(self.data.announcePageId).then(function (data) {
        var list = data.announcements || data || [];
        self.setData({ announcements: list });
      }).catch(function () {});
    }).catch(function (err) {
      self.setData({ announceSaving: false });
      wx.showToast({ title: err.message || '发布失败', icon: 'none' });
    });
  },

  deleteAnnouncement: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定删除此公告？',
      success: function (res) {
        if (res.confirm) {
          api.deleteAnnouncement(self.data.announcePageId, id).then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            api.getStatusPageAnnouncements(self.data.announcePageId).then(function (data) {
              var list = data.announcements || data || [];
              self.setData({ announcements: list });
            }).catch(function () {});
          }).catch(function (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
        }
      },
    });
  },

  stopPropagation: function () {},
});
