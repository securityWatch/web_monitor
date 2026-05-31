const env = require('../config/env.js');
const auth = require('./auth.js');

function request(path, options) {
  options = options || {};
  const method = options.method || 'GET';
  const data = options.data;
  const needAuth = options.auth !== false;
  const retry = options._retry !== false;

  return new Promise(function (resolve, reject) {
    const header = {
      'Content-Type': 'application/json',
    };
    if (needAuth) {
      const token = auth.getAccessToken();
      if (token) {
        header.Authorization = 'Bearer ' + token;
      }
    }

    wx.request({
      url: env.baseUrl + path,
      method: method,
      data: data,
      header: header,
      success: function (res) {
        if (res.statusCode === 401 && needAuth && retry && auth.getRefreshToken()) {
          refreshToken()
            .then(function () {
              return request(path, Object.assign({}, options, { _retry: false }));
            })
            .then(resolve)
            .catch(function () {
              auth.clearAuth();
              wx.reLaunch({ url: '/pages/login/login' });
              reject(new Error('登录已过期，请重新登录'));
            });
          return;
        }

        if (res.statusCode === 401) {
          auth.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('未授权，请重新登录'));
          return;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        const errMsg =
          (res.data && (res.data.error || res.data.message)) ||
          '请求失败 (' + res.statusCode + ')';
        reject(new Error(errMsg));
      },
      fail: function (err) {
        reject(new Error(err.errMsg || '网络错误'));
      },
    });
  });
}

function refreshToken() {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: env.baseUrl + '/api/v1/auth/refresh',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { refreshToken: auth.getRefreshToken() },
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.accessToken) {
          auth.setAuth(res.data);
          resolve(res.data);
        } else {
          reject(new Error('refresh failed'));
        }
      },
      fail: reject,
    });
  });
}

function login(email, password) {
  return request('/api/v1/auth/login', {
    method: 'POST',
    auth: false,
    data: { email: email, password: password },
  }).then(function (data) {
    if (data.requiresTotp) {
      throw new Error('该账号已启用双因素认证，请使用 Web 端登录');
    }
    if (!data.accessToken) {
      throw new Error('登录失败');
    }
    auth.setAuth(data);
    return data;
  });
}

function getWechatStatus() {
  return request('/api/v1/auth/wechat/miniprogram/status', { auth: false });
}

function wechatLogin(code, profile) {
  profile = profile || {};
  return request('/api/v1/auth/wechat/miniprogram', {
    method: 'POST',
    auth: false,
    data: {
      code: code,
      displayName: profile.displayName || '',
      avatarUrl: profile.avatarUrl || '',
    },
  }).then(function (data) {
    if (data.requiresTotp) {
      throw new Error('该账号已启用双因素认证，请使用 Web 端登录');
    }
    if (!data.accessToken) {
      throw new Error('微信登录失败');
    }
    auth.setAuth(data);
    return data;
  });
}

function bindWechat(code) {
  return request('/api/v1/me/wechat/miniprogram/bind', {
    method: 'POST',
    data: { code: code },
  });
}

function orgPath(suffix) {
  const orgId = auth.getOrgId();
  return '/api/v1/orgs/' + orgId + suffix;
}

function getMonitors() {
  return request(orgPath('/monitors')).then(function (data) {
    return data.monitors || [];
  });
}

function getMonitor(id) {
  return request(orgPath('/monitors/' + id));
}

function getMonitorChecks(id, page) {
  page = page || 1;
  return request(orgPath('/monitors/' + id + '/checks?page=' + page + '&limit=20'));
}

function getMonitorStats(id) {
  return request(orgPath('/monitors/' + id + '/stats?range=24h'));
}

function getIncidents(status) {
  let path = orgPath('/incidents');
  if (status && status !== 'all') {
    path += '?status=' + status;
  }
  return request(path).then(function (data) {
    return data.incidents || [];
  });
}

function getMe() {
  return request('/api/v1/me');
}

module.exports = {
  request,
  login,
  getWechatStatus,
  wechatLogin,
  bindWechat,
  getMonitors,
  getMonitor,
  getMonitorChecks,
  getMonitorStats,
  getIncidents,
  getMe,
};
