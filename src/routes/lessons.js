import express from 'express';
import { LessonModel } from '../models/Lesson.js';
import { SaveModel } from '../models/Save.js';
import { authenticateToken } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';

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

// GET lessons by author email (public only)
router.get('/author-email/:authorEmail', async (req, res) => {
  try {
    const authorEmail = decodeURIComponent(req.params.authorEmail);
    const db = getDB();

    const lessons = await db
      .collection('lessons')
      .find({
        authorEmail,
        privacy: 'public'
      })
      .sort({ createdAt: -1 })
      .toArray();

    let authorInfo = null;
    if (lessons.length > 0) {
      authorInfo = {
        email: lessons[0].authorEmail,
        name: lessons[0].authorName || lessons[0].authorEmail,
        photoURL: lessons[0].authorPhotoURL || null
      };
    }

    res.json({ lessons, authorInfo, total: lessons.length });
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
      authorEmail, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      featuredImage,
      accessLevel,
      privacy,
      status = 'draft' 
    } = req.body;
    
    if (!title || !content || !authorEmail || !description) {
      return res.status(400).json({ error: 'Title, content, authorEmail, and description required' });
    }

    const lessonId = await LessonModel.create({
      title,
      content,
      authorEmail,
      description,
      category: category || 'Personal',
      emotionalTone: emotionalTone || 'Hopeful',
      authorName: authorName || authorEmail,
      authorPhotoURL: authorPhotoURL || '',
      featuredImage: featuredImage || '',
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
      authorEmail, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      featuredImage,
      accessLevel,
      privacy,
      status 
    } = req.body;
    await LessonModel.update(req.params.id, { 
      title, 
      content, 
      authorEmail, 
      description,
      category,
      emotionalTone,
      authorName,
      authorPhotoURL,
      featuredImage,
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

// SAVE status for current user
router.get('/:id/save/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const saved = await SaveModel.isSaved(userId, req.params.id);
    res.json({ saved });
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
    } else {
      await SaveModel.create(userId, req.params.id);
    }
    
    // Fetch updated lesson to get current savedCount
    const lesson = await LessonModel.findById(req.params.id);
    const savedCount = lesson?.savedCount || 0;
    
    res.json({ 
      message: isSaved ? 'Lesson unsaved' : 'Lesson saved', 
      saved: !isSaved,
      savedCount: savedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LIKE lesson
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isLiked = await LessonModel.toggleLike(req.params.id, userId);
    const lesson = await LessonModel.findById(req.params.id);
    res.json({ 
      message: isLiked ? 'Lesson liked' : 'Lesson unliked',
      isLiked,
      likesCount: lesson.likesCount || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET similar lessons
router.get('/:id/similar', async (req, res) => {
  try {
    const lesson = await LessonModel.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    const similar = await LessonModel.findSimilar(
      lesson.category,
      lesson.emotionalTone,
      6,
      req.params.id
    );
    res.json(similar);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// REPORT lesson
router.post('/:id/report', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const db = getDB();
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason required' });
    }
    
    const report = {
      lessonId: new ObjectId(req.params.id),
      reporterUserId: req.user.userId,
      reporterEmail: req.user.email,
      reason,
      createdAt: new Date(),
      status: 'pending'
    };
    
    const result = await db.collection('lessonReports').insertOne(report);
    res.status(201).json({ 
      message: 'Lesson reported successfully',
      reportId: result.insertedId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
