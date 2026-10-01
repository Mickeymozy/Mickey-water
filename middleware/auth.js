const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || process.env.jwt_secret || 'change_this_secret';
const ADMIN_EMAIL = 'mickidadyhamza@gmail.com';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token is required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type && payload.type !== 'access') return res.status(401).json({ message: 'Token si sahihi' });
    if (req.originalUrl.split('?')[0] !== '/api/health') {
      const account = await User.findById(payload.userId).select('email role active');
      if (!account || account.active === false) return res.status(401).json({ message: 'Akaunti imezimwa au haipatikani' });
      payload.email = account.email;
      payload.role = account.role;
    }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token si sahihi au umekatika' });
    }
    res.status(503).json({ message: 'Imeshindikana kuthibitisha akaunti kwa sasa' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin' || String(req.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ message: 'Inaruhusiwa tu kwa admin' });
    }
    next();
  });
}

module.exports = { authMiddleware, adminMiddleware };
