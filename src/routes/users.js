import express from 'express';
import { UserModel } from '../models/User.js';

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

// CREATE user
router.post('/', async (req, res) => {
  try {
    const { email, displayName, photoURL } = req.body;
    
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email and displayName required' });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const userId = await UserModel.create({ email, displayName, photoURL });
    res.status(201).json({ _id: userId, email, displayName, photoURL });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE user
router.put('/:id', async (req, res) => {
  try {
    const { displayName, photoURL } = req.body;
    await UserModel.update(req.params.id, { displayName, photoURL });
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    await UserModel.delete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
