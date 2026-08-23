const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || process.env.jwt_secret || 'change_this_secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token is required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type && payload.type !== 'access') return res.status(401).json({ message: 'Token si sahihi' });
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token si sahihi au umekatika' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Inaruhusiwa tu kwa admin' });
    }
    next();
  });
}

module.exports = { authMiddleware, adminMiddleware };
