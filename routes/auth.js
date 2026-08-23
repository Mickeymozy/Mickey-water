const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.jwt_secret || 'change_this_secret';

router.post('/login', async (req, res) => {
  try {
    const emailValue = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!emailValue || !password) return res.status(400).json({ message: 'Email na password yanahitajika' });

    const user = await User.findOne({ email: emailValue });
    if (!user) return res.status(401).json({ message: 'Taarifa zisizofaa' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Taarifa zisizofaa' });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
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

module.exports = router;
