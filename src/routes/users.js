import express from 'express';
import { UserModel } from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET all users
router.get('/', async (req, res) => {
  try {
    const users = await UserModel.findAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
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

    // Generate tokens
    const accessToken = generateAccessToken(user._id.toString(), user.email);
    const refreshToken = generateRefreshToken(user._id.toString(), user.email);

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
    const updateData = { displayName, photoURL };
    
    if (role) {
      updateData.role = role.toLowerCase();
    }
    
    await UserModel.update(req.params.id, updateData);
    const user = await UserModel.findById(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
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

    // Generate new access token
    const newAccessToken = generateAccessToken(decoded.userId, decoded.email);

    res.json({
      accessToken: newAccessToken,
      expiresIn: 1800 // 30 minutes in seconds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
