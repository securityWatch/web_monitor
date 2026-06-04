/** Build DATABASE_URL for deploy scripts — never hardcode passwords in repo. */
function databaseUrlFromEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const pw = process.env.PG_PASSWORD;
  if (!pw) {
    throw new Error(
      'Set PG_PASSWORD (PostgreSQL password) or DATABASE_URL before deploying.'
    );
  }
  return `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:6541/pulsewatch`;
}

module.exports = { databaseUrlFromEnv };
