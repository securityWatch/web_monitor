const { Client } = require('ssh2');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const { HOST, USER, PASSWORD } = require('./config');

function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function hasSshpass() {
  try {
    if (process.platform === 'win32') {
      execSync('where sshpass', { stdio: 'pipe' });
    } else {
      execSync('which sshpass', { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

function ensureSshpass() {
  if (hasSshpass()) return;
  if (process.platform === 'win32') return;
  console.log('[deploy] Installing sshpass for faster SSH transfers...');
  execSync('sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sshpass', { stdio: 'inherit' });
}

function withSshClient(fn) {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', () => fn(conn).then(resolve, reject).finally(() => conn.end()));
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 30000 });
  });
}

function sshExecViaConn(command, { timeoutMs = 600000 } = {}) {
  return withSshClient(
    (conn) =>
      new Promise((resolve, reject) => {
        conn.exec(command, { pty: true }, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          const timer = setTimeout(() => {
            stream.close();
            reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          stream.on('data', (d) => { stdout += d.toString(); });
          stream.stderr.on('data', (d) => { stderr += d.toString(); });
          stream.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code: code || 0, stdout, stderr });
          });
        });
      }),
  );
}

/** Run a remote command; returns { code, stdout }. */
async function sshExec(command, { timeoutMs = 600000 } = {}) {
  ensureSshpass();
  if (!hasSshpass()) {
    return sshExecViaConn(command, { timeoutMs });
  }
  const wrapped = `sshpass -p ${shellQuote(PASSWORD)} ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${USER}@${HOST} ${shellQuote(command)}`;
  try {
    const stdout = execSync(wrapped, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status || 1, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

function scpToRemoteViaConn(localPath, remotePath) {
  return withSshClient(
    (conn) =>
      new Promise((res, rej) => {
        conn.sftp((err, sftp) => {
          if (err) return rej(err);
          const start = Date.now();
          sftp.fastPut(localPath, remotePath, (e) => {
            if (e) return rej(e);
            console.log(`[deploy] uploaded ${remotePath} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
            res();
          });
        });
      }),
  );
}

/** Stream a local file to remote path (gzip optional). Uses scp — much faster than ssh2 fastPut on slow links. */
async function scpToRemote(localPath, remotePath, { gzip = false } = {}) {
  ensureSshpass();
  if (!hasSshpass()) {
    if (gzip) throw new Error('gzip scp requires sshpass; upload uncompressed file with ssh2 instead');
    return scpToRemoteViaConn(localPath, remotePath);
  }
  return new Promise((resolve, reject) => {
    const dest = `${USER}@${HOST}:${remotePath}`;
    if (!gzip) {
      const args = ['-p', PASSWORD, 'scp', '-o', 'StrictHostKeyChecking=no', localPath, dest];
      const p = spawn('sshpass', args, { stdio: 'inherit' });
      p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`scp exit ${c}`))));
      return;
    }
    const r = spawn('gzip', ['-c', localPath]);
    const args = ['-p', PASSWORD, 'scp', '-o', 'StrictHostKeyChecking=no', dest];
    const w = spawn('sshpass', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    r.stdout.pipe(w.stdin);
    r.on('error', reject);
    w.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`scp gzip exit ${c}`))));
  });
}

/** Pipe tar stream to remote extract directory. */
function tarStreamToRemote(localDir, tarArgs, remoteExtractDir) {
  ensureSshpass();
  if (!hasSshpass()) {
    throw new Error('tarStreamToRemote requires sshpass on this platform');
  }
  return new Promise((resolve, reject) => {
    const remoteCmd = `mkdir -p ${remoteExtractDir} && tar xzf - -C ${remoteExtractDir}`;
    const ssh = spawn(
      'sshpass',
      ['-p', PASSWORD, 'ssh', '-o', 'StrictHostKeyChecking=no', `${USER}@${HOST}`, remoteCmd],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const tar = spawn('tar', tarArgs, { cwd: localDir, stdio: ['ignore', 'pipe', 'inherit'] });
    tar.stdout.pipe(ssh.stdin);
    tar.on('close', (c) => {
      if (c !== 0) reject(new Error(`tar exit ${c}`));
    });
    ssh.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`remote tar exit ${c}`))));
  });
}

function sftpFastPut(localPath, remotePath) {
  return scpToRemoteViaConn(localPath, remotePath);
}

module.exports = {
  shellQuote,
  hasSshpass,
  ensureSshpass,
  sshExec,
  scpToRemote,
  tarStreamToRemote,
  withSshClient,
  sftpFastPut,
};
