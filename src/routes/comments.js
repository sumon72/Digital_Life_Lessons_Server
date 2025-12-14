import express from 'express';
import { CommentModel } from '../models/Comment.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET comments for a lesson
router.get('/lesson/:lessonId', async (req, res) => {
  try {
    const comments = await CommentModel.findByLessonId(req.params.lessonId);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET comment count for a lesson
router.get('/lesson/:lessonId/count', async (req, res) => {
  try {
    const count = await CommentModel.countByLessonId(req.params.lessonId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a comment (requires authentication)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { lessonId, content } = req.body;
    
    if (!lessonId || !content) {
      return res.status(400).json({ error: 'Lesson ID and content are required' });
    }

    if (content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    const commentData = {
      lessonId,
      content: content.trim(),
      userId: req.user.userId,
      userEmail: req.user.email,
      userName: req.user.displayName || req.user.email.split('@')[0],
      userPhotoURL: req.user.photoURL || ''
    };

    const commentId = await CommentModel.create(commentData);
    const comment = await CommentModel.findById(commentId.toString());
    
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update a comment (requires authentication and ownership)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const comment = await CommentModel.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    await CommentModel.update(req.params.id, { content: content.trim() });
    const updatedComment = await CommentModel.findById(req.params.id);
    
    res.json(updatedComment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a comment (requires authentication and ownership)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const comment = await CommentModel.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment or is admin
    if (comment.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await CommentModel.delete(req.params.id);
    
    res.json({ message: 'Comment deleted successfully', _id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
