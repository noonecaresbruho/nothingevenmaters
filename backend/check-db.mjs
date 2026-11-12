import { getDb } from './src/db.js';

const db = await getDb();
const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
console.log('Tabelas:', tables);
process.exit(0);