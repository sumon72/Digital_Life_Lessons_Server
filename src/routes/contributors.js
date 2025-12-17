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
        { $match: { 
          createdAt: { $gte: oneWeekAgo },
          authorEmail: { $exists: true, $ne: null } // Only include lessons with valid authorId
        }},
        { $group: { _id: '$authorEmail', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
      .toArray();
      console.log('Contributors aggregation result:', contributors);
    // Enrich with user details
    const enriched = await Promise.all(
      contributors.map(async (c) => {
        try {
          const user = await UserModel.findByEmail(c._id?.toString());
         
          return {
            userId: c._id,
            name: user?.displayName || 'Unknown',
            email: user?.email || 'N/A',
            photoURL: user?.photoURL || null,
            contributions: c.count,
            plan: user?.paymentStatus || 'free'
          };
        } catch (err) {
          console.error(`Error fetching user ${c._id}:`, err);
          return {
            userId: c._id,
            name: 'Unknown',
            email: 'N/A',
            photoURL: null,
            contributions: c.count,
            plan: 'free'
          };
        }
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('Error in /top-week:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
