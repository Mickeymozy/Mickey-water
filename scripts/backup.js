const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI haijawekwa');
const output = path.join(process.cwd(), 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
execFile('mongodump', ['--uri', process.env.MONGODB_URI, '--out', output], (error) => {
  if (error) throw error;
  console.log(`Backup imehifadhiwa: ${output}`);
});