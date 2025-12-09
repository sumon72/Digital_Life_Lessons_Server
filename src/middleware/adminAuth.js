import { authenticateToken } from './auth.js';

// Middleware to check if user is admin
export const requireAdmin = async (req, res, next) => {
  // First authenticate the token
  authenticateToken(req, res, (err) => {
    if (err) return;

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied. Admin role required.',
        message: 'You do not have permission to access this resource.'
      });
    }

    next();
  });
};
