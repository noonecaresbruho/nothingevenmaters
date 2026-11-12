const crypto = require('node:crypto');
const path = require('path');
const sqlite3 = require('sqlite3');

const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));

const digest = crypto.createHash('sha256').update('admin').digest();
const hash = 'sha256$' + digest.toString('base64');

db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin'], function(err) {
  if (err) console.error(err);
  else console.log('hash salvo:', hash);
  db.close();
});