function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

function formatRelative(iso) {
  if (!iso) return '从未检测';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + ' 秒前';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + ' 分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' 小时前';
  const day = Math.floor(hr / 24);
  return day + ' 天前';
}

function statusLabel(status) {
  const map = {
    up: '正常',
    down: '故障',
    paused: '已暂停',
    pending: '待检测',
  };
  return map[status] || status || '未知';
}

function incidentStatusLabel(status) {
  const map = {
    open: '进行中',
    resolved: '已恢复',
  };
  return map[status] || status || '未知';
}

function severityLabel(severity) {
  const map = {
    critical: '严重',
    warning: '警告',
    info: '信息',
  };
  return map[severity] || severity || '—';
}

module.exports = {
  formatDateTime,
  formatRelative,
  statusLabel,
  incidentStatusLabel,
  severityLabel,
};
