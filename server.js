const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
dotenv.config();
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { connectDB, databaseStatus } = require('./config/db');
const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || process.env.jwt_secret || 'change_this_secret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.admin_email || 'admin@admin.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.admin_password || 'Admin123';

if (!process.env.JWT_SECRET && !process.env.jwt_secret) {
  console.warn('WARNING: JWT_SECRET si imewekwa. Tumia .env kwa usalama au weka environment variable kwenye deployment.');
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const allowedOrigins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(origin => origin.trim()) : true;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('MongoDB haipatikani:', error.message);
    res.status(503).json({ message: 'Huduma ya database haipatikani kwa sasa' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/records', recordRoutes);

app.get('/api/ping', (req, res) => res.json({ message: 'pong', database: databaseStatus() }));

app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint haipo' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Hitilafu ya request:', error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: 'Hitilafu ya server' });
});

async function createDefaultAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin123';
    const existing = await User.findOne({ email });
    if (!existing) {
      const hash = await bcrypt.hash(password, 10);
      await User.create({ name: 'Admin', email, password: hash, role: 'admin' });
      console.log(`Admin default ameundwa: ${email}`);
    } else {
      console.log('Admin default tayari yupo.');
    }
  } catch (err) {
    console.error('Haikuweza kuunda admin default:', err.message);
  }
}

if (require.main === module) {
  connectDB()
    .then(createDefaultAdmin)
    .then(() => app.listen(PORT, () => {
      console.log(`Server inaendesha kwenye http://localhost:${PORT}`);
    }))
    .catch(error => {
      console.error('Server haikuweza kuanza:', error.message);
      process.exitCode = 1;
    });
}

async function shutdown(signal) {
  console.log(`${signal}: server inazima...`);
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
