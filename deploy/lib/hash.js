const crypto = require('crypto');
const fs = require('fs');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

module.exports = { sha256File };
