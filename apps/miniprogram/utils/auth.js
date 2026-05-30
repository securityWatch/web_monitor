const AUTH_KEY = 'pulsewatch_auth';

function getAuth() {
  try {
    return wx.getStorageSync(AUTH_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setAuth(data) {
  wx.setStorageSync(AUTH_KEY, data);
}

function clearAuth() {
  wx.removeStorageSync(AUTH_KEY);
}

function isLoggedIn() {
  const auth = getAuth();
  return !!(auth && auth.accessToken && auth.organization && auth.organization.id);
}

function getOrgId() {
  const auth = getAuth();
  return auth && auth.organization ? auth.organization.id : '';
}

function getAccessToken() {
  const auth = getAuth();
  return auth ? auth.accessToken : '';
}

function getRefreshToken() {
  const auth = getAuth();
  return auth ? auth.refreshToken : '';
}

module.exports = {
  AUTH_KEY,
  getAuth,
  setAuth,
  clearAuth,
  isLoggedIn,
  getOrgId,
  getAccessToken,
  getRefreshToken,
};
