import { getDb } from './src/db.js';
import crypto from 'node:crypto';

const db = await getDb();
const digest = crypto.createHash('sha256').update('admin').digest();
const hash = 'sha256$' + digest.toString('base64');

await db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin']);
console.log('hash salvo:', hash);

const user = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
console.log('usuario:', user);
process.exit(0);