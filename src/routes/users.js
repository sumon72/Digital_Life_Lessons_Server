import express from 'express';
import { UserModel } from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// GET all users (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await UserModel.findAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET user by ID (users can only get their own data unless admin)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const requestedId = req.params.id;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    // Users can only fetch their own data unless they're admin
    if (requestedId !== requestingUserId && requestingUserRole !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only access your own user data.'
      });
    }

    const user = await UserModel.findById(requestedId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE user (with JWT tokens)
router.post('/', async (req, res) => {
  try {
    const { email, displayName, photoURL, role = 'user' } = req.body;
    
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email and displayName required' });
    }

    let user = await UserModel.findByEmail(email);
    
    // If user doesn't exist, create new user
    if (!user) {
      const userId = await UserModel.create({ 
        email, 
        displayName, 
        photoURL,
        role: role.toLowerCase()
      });
      
      user = await UserModel.findById(userId.toString());
    }

    // Generate tokens with role
    const accessToken = generateAccessToken(user._id.toString(), user.email, user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email, user.role);

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
      expiresIn: 1800 // 30 minutes in seconds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE user
router.put('/:id', async (req, res) => {
  try {
    const { displayName, photoURL, role } = req.body;
    
    // Prevent updating the main admin user
    const user = await UserModel.findById(req.params.id);
    if (user?.email === 'admin@gmail.com') {
      return res.status(403).json({ 
        error: 'Cannot modify the main admin account',
        message: 'This account is protected and cannot be modified.'
      });
    }
    
    const updateData = { displayName, photoURL };
    
    if (role) {
      updateData.role = role.toLowerCase();
    }
    
    await UserModel.update(req.params.id, updateData);
    const updatedUser = await UserModel.findById(req.params.id);
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    // Prevent deleting the main admin user
    const user = await UserModel.findById(req.params.id);
    if (user?.email === 'admin@gmail.com') {
      return res.status(403).json({ 
        error: 'Cannot delete the main admin account',
        message: 'This account is protected and cannot be deleted.'
      });
    }
    
    await UserModel.delete(req.params.id);
    res.json({ message: 'User deleted successfully', _id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// REFRESH token endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    // Generate new access token with role
    const newAccessToken = generateAccessToken(decoded.userId, decoded.email, decoded.role);

    res.json({
      accessToken: newAccessToken,
      expiresIn: 1800 // 30 minutes in seconds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
