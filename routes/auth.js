const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Record = require('../models/Record');
const { authMiddleware } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const RefreshToken = require('../models/RefreshToken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.jwt_secret || 'change_this_secret';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  return jwt.sign({ userId: user._id, role: user.role, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
}

async function createRefreshToken(user) {
  const token = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
  return token;
}

function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}

router.post('/login', async (req, res) => {
  try {
    const emailValue = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!emailValue || !password) return res.status(400).json({ message: 'Email na password yanahitajika' });

    const user = await User.findOne({ email: emailValue });
    if (!user) return res.status(401).json({ message: 'Taarifa zisizofaa' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Taarifa zisizofaa' });

    const token = createAccessToken(user);
    const refreshToken = await createRefreshToken(user);
    res.json({ token, refreshToken, user: { name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || '');
    const saved = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken), expiresAt: { $gt: new Date() } });
    if (!saved) return res.status(401).json({ message: 'Refresh token si sahihi au imekwisha muda' });
    const user = await User.findById(saved.userId);
    if (!user) return res.status(401).json({ message: 'Akaunti haipatikani' });
    await RefreshToken.deleteOne({ _id: saved._id });
    res.json({ token: createAccessToken(user), refreshToken: await createRefreshToken(user) });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kuhuisha session' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Weka email sahihi' });
    const user = await User.findOne({ email }).select('+resetTokenHash');
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashToken(resetToken);
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const transport = mailer();
      if (transport) {
        const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:3000';
        await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, subject: 'Mickey Water - Badilisha nywila', text: `Fungua link hii kubadilisha nywila: ${origin}/reset-password.html?token=${resetToken}` });
      }
    }
    res.json({ message: 'Kama email ipo, ujumbe wa kubadilisha nywila umetumwa.' });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kutuma ujumbe' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Nywila iwe na angalau herufi 8' });
    const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpiresAt: { $gt: new Date() } }).select('+resetTokenHash');
    if (!user) return res.status(400).json({ message: 'Link ya kubadilisha nywila si sahihi au imekwisha muda' });
    user.password = await bcrypt.hash(password, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    await RefreshToken.deleteMany({ userId: user._id });
    res.json({ message: 'Nywila imebadilishwa. Ingia tena.' });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kubadilisha nywila' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || !password) return res.status(400).json({ message: 'Jaza maeneo yote' });
    if (name.length < 2 || name.length > 100) return res.status(400).json({ message: 'Jina si sahihi' });
    if (password.length < 8) return res.status(400).json({ message: 'Nywila iwe na angalau herufi 8' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email tayari imetumika' });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hash });
    await user.save();

    res.status(201).json({ message: 'Mtumiaji ameundwa. Ingia sasa.' });
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Akaunti haipatikani' });

    await Record.deleteMany({ createdBy: user._id });
    await RefreshToken.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    await AuditLog.create({ userId: user._id, action: 'account_deleted', metadata: { email: user.email } }).catch(error => {
      console.error('Audit log failed (account_deleted):', error.message);
    });
    res.json({ message: 'Akaunti na records zake zimefutwa kabisa' });
  } catch (error) {
    res.status(500).json({ message: 'Akaunti haikuweza kufutwa' });
  }
});

module.exports = router;
