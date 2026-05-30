Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/monitors/index', text: '监控', icon: '◎' },
      { pagePath: '/pages/incidents/index', text: '事件', icon: '!' },
      { pagePath: '/pages/settings/index', text: '设置', icon: '⚙' },
    ],
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      wx.switchTab({ url: item.pagePath });
    },
  },
});
