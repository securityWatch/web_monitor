/** Build comma-separated CORS origins for IP + optional domains. */
function buildCorsOrigins(host, domainsCsv) {
  const origins = new Set([`http://${host}`]);
  for (const raw of (domainsCsv || '').split(',')) {
    const d = raw.trim().replace(/^https?:\/\//, '');
    if (!d) continue;
    origins.add(`http://${d}`);
    origins.add(`https://${d}`);
  }
  return [...origins].join(',');
}

module.exports = { buildCorsOrigins };
