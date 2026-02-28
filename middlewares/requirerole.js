module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    // auth middleware must run before this
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const role = (req.user.role || '').toUpperCase();
    const ok = allowedRoles.map(r => r.toUpperCase()).includes(role);

    if (!ok) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }

    next();
  };
};
