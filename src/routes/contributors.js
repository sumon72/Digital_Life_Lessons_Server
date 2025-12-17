import express from 'express';
import { UserModel } from '../models/User.js';
import { getDB } from '../config/db.js';

const router = express.Router();

// GET top contributors of the week
router.get('/top-week', async (req, res) => {
  try {
    const db = getDB();
    
    // Get lessons created in the last 7 days grouped by author
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const contributors = await db.collection('lessons')
      .aggregate([
        { $match: { createdAt: { $gte: oneWeekAgo } } },
        { $group: { _id: '$authorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
      .toArray();

    // Enrich with user details
    const enriched = await Promise.all(
      contributors.map(async (c) => {
        const user = await UserModel.findById(c._id.toString());
        return {
          userId: c._id,
          name: user?.displayName || 'Unknown',
          email: user?.email,
          contributions: c.count
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
