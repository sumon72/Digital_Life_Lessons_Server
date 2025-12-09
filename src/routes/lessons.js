import express from 'express';
import { LessonModel } from '../models/Lesson.js';
import { SaveModel } from '../models/Save.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET all lessons (with filters)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const lessons = await LessonModel.findAll(filter);
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET featured lessons
router.get('/featured', async (req, res) => {
  try {
    const featured = await LessonModel.findFeatured();
    res.json(featured);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET most saved lessons
router.get('/most-saved', async (req, res) => {
  try {
    const mostSaved = await LessonModel.findMostSaved();
    res.json(mostSaved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET lesson by ID
router.get('/:id', async (req, res) => {
  try {
    const lesson = await LessonModel.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    // Increment view count
    await LessonModel.incrementViewCount(req.params.id);
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE lesson
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      author, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      accessLevel,
      privacy,
      status = 'draft' 
    } = req.body;
    
    if (!title || !content || !author || !description) {
      return res.status(400).json({ error: 'Title, content, author, and description required' });
    }

    const lessonId = await LessonModel.create({
      title,
      content,
      author,
      description,
      category: category || 'Personal',
      emotionalTone: emotionalTone || 'Hopeful',
      authorName: authorName || author,
      authorPhotoURL: authorPhotoURL || '',
      accessLevel: accessLevel || 'free',
      privacy: privacy || 'private',
      status
    });

    // Fetch and return the created lesson
    const lesson = await LessonModel.findById(lessonId.toString());
    res.status(201).json(lesson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE lesson
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      author, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      accessLevel,
      privacy,
      status 
    } = req.body;
    await LessonModel.update(req.params.id, { 
      title, 
      content, 
      author, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      accessLevel,
      privacy,
      status 
    });
    // Fetch and return the updated lesson
    const lesson = await LessonModel.findById(req.params.id);
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE lesson
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await LessonModel.delete(req.params.id);
    res.json({ message: 'Lesson deleted successfully', _id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SAVE/UNSAVE lesson
router.post('/:id/save', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const isSaved = await SaveModel.isSaved(userId, req.params.id);
    
    if (isSaved) {
      await SaveModel.delete(userId, req.params.id);
      res.json({ message: 'Lesson unsaved', saved: false });
    } else {
      await SaveModel.create(userId, req.params.id);
      res.json({ message: 'Lesson saved', saved: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
