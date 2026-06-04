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

function register(email, password, displayName) {
  return request('/api/v1/auth/register', {
    method: 'POST',
    auth: false,
    data: {
      email: email,
      password: password,
      displayName: displayName || '',
      otpCode: '',
    },
  }).then(function (data) {
    if (!data.accessToken) {
      throw new Error('注册失败');
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

function wechatPhoneLogin(phoneCode, loginCode, displayName) {
  return request('/api/v1/auth/wechat/miniprogram/phone', {
    method: 'POST',
    auth: false,
    data: { code: phoneCode, loginCode: loginCode || '', displayName: displayName || '' },
  }).then(function (data) {
    if (!data.accessToken) {
      throw new Error('手机号登录失败');
    }
    auth.setAuth(data);
    return data;
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

function regenerateBadgeToken(id) {
  return request(orgPath('/monitors/' + id + '/regenerate-badge-token'), {
    method: 'POST',
  });
}

function pauseMonitor(id) {
  return request(orgPath('/monitors/' + id), {
    method: 'PATCH',
    data: { status: 'paused' },
  });
}

function resumeMonitor(id) {
  return request(orgPath('/monitors/' + id), {
    method: 'PATCH',
    data: { status: 'pending' },
  });
}

function deleteMonitor(id) {
  return request(orgPath('/monitors/' + id), {
    method: 'DELETE',
  });
}

function updateMonitor(id, data) {
  return request(orgPath('/monitors/' + id), {
    method: 'PATCH',
    data: data,
  });
}

function createMonitor(data) {
  return request(orgPath('/monitors'), {
    method: 'POST',
    data: data,
  });
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

function updateProfile(data) {
  return request('/api/v1/me/profile', { method: 'PATCH', data: data });
}

function changePassword(currentPassword, newPassword) {
  return request('/api/v1/me/password/change', {
    method: 'POST',
    data: { currentPassword: currentPassword, newPassword: newPassword },
  });
}

function setPassword(newPassword) {
  return request('/api/v1/me/password/set', {
    method: 'POST',
    data: { newPassword: newPassword },
  });
}

function updateNotifications(data) {
  return request('/api/v1/me/notifications', { method: 'PATCH', data: data });
}

function getMembers() {
  return request(orgPath('/members'));
}

function getInvitations() {
  return request(orgPath('/invitations'));
}

function createInvitation(email, role) {
  return request(orgPath('/invitations'), {
    method: 'POST',
    data: { email: email, role: role || 'member' },
  });
}

function getApiKeys() {
  return request(orgPath('/api-keys'));
}

function createApiKey(name) {
  return request(orgPath('/api-keys'), {
    method: 'POST',
    data: { name: name },
  });
}

function deleteApiKey(id) {
  return request(orgPath('/api-keys/' + id), { method: 'DELETE' });
}

function getAuditLogs() {
  return request(orgPath('/audit-logs?limit=50'));
}

function getAlertChannels() {
  return request(orgPath('/alert-channels'));
}

function getOnCallSchedules() {
  return request(orgPath('/on-call/schedules'));
}

function getSessions() {
  return request('/api/v1/me/sessions');
}

function revokeSession(sessionId) {
  return request('/api/v1/me/sessions/' + sessionId, { method: 'DELETE' });
}

function getTotpStatus() {
  return request('/api/v1/me/totp');
}

function getMaintenanceWindows() {
  return request(orgPath('/maintenance-windows'));
}

function getSystemReport(period, withAI) {
  var url = orgPath('/reports/system?period=' + (period || 'weekly'));
  if (withAI) url += '&ai=true';
  return request(url);
}

function getDashboard() {
  return request(orgPath('/dashboard'));
}

module.exports = {
  request,
  login,
  register,
  getWechatStatus,
  wechatLogin,
  bindWechat,
  wechatPhoneLogin,
  getMonitors,
  getMonitor,
  getMonitorChecks,
  getMonitorStats,
  regenerateBadgeToken,
  pauseMonitor,
  resumeMonitor,
  deleteMonitor,
  updateMonitor,
  createMonitor,
  getIncidents,
  getMe,
  updateProfile,
  changePassword,
  setPassword,
  updateNotifications,
  getMembers,
  getInvitations,
  createInvitation,
  getApiKeys,
  createApiKey,
  deleteApiKey,
  getAuditLogs,
  getAlertChannels,
  getOnCallSchedules,
  getSessions,
  revokeSession,
  getTotpStatus,
  getMaintenanceWindows,
  getSystemReport,
  getDashboard,
};
