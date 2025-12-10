import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { LessonModel } from '../models/Lesson.js'
import { UserModel } from '../models/User.js'
import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'

const router = express.Router()

// Middleware to verify admin role
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' })
  }
  next()
}

// Get admin dashboard stats
router.get('/stats', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB()

    // Total users
    const totalUsers = await db.collection('users').countDocuments()

    // Total lessons
    const totalLessons = await db.collection('lessons').countDocuments()

    // Public/Private breakdown
    const publicLessons = await db.collection('lessons').countDocuments({ privacy: 'public' })
    const privateLessons = await db.collection('lessons').countDocuments({ privacy: 'private' })

    // Premium lessons
    const premiumLessons = await db.collection('lessons').countDocuments({ accessLevel: 'premium' })

    // Reported lessons (lessons with reportCount > 0)
    const reportedLessons = await db.collection('lessons').countDocuments({ reportCount: { $gt: 0 } })

    // Today's new lessons
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayNewLessons = await db.collection('lessons').countDocuments({ createdAt: { $gte: startOfToday } })

    // Top contributors (users with most lessons)
    const activeContributors = await db.collection('lessons').aggregate([
      { $group: { 
          _id: '$author', 
          lessonCount: { $sum: 1 },
          totalLikes: { $sum: '$likesCount' },
          totalSaves: { $sum: '$savedCount' }
        } 
      },
      { $sort: { lessonCount: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      { $project: {
          _id: '$userInfo._id',
          displayName: '$userInfo.displayName',
          email: '$userInfo.email',
          lessonCount: 1,
          totalLikes: 1,
          totalSaves: 1
        }
      }
    ]).toArray()

    res.json({
      totalUsers,
      totalLessons,
      publicLessons,
      privateLessons,
      premiumLessons,
      reportedLessons,
      todayNewLessons,
      activeContributors
    })
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    res.status(500).json({ message: 'Failed to fetch admin stats' })
  }
})

// Get all lessons for admin management
router.get('/lessons', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB()

    // Fetch all lessons
    const lessons = await db.collection('lessons')
      .find()
      .sort({ createdAt: -1 })
      .toArray()

    // Get all author IDs
    const authorIds = [...new Set(lessons.map(l => l.author).filter(Boolean))]

    // Fetch all authors
    const authors = await db.collection('users')
      .find({ _id: { $in: authorIds } })
      .project({ displayName: 1, email: 1 })
      .toArray()

    // Create author lookup map
    const authorMap = {}
    authors.forEach(author => {
      authorMap[author._id.toString()] = author
    })

    // Add author info to lessons
    const lessonsWithAuthors = lessons.map(lesson => ({
      ...lesson,
      author: lesson.author ? authorMap[lesson.author.toString()] : null
    }))

    const stats = {
      total: lessons.length,
      public: lessons.filter(l => l.privacy === 'public').length,
      private: lessons.filter(l => l.privacy === 'private').length,
      premium: lessons.filter(l => l.accessLevel === 'premium').length,
      reported: lessons.filter(l => (l.reportCount || 0) > 0).length
    }

    res.json({ lessons: lessonsWithAuthors, stats })
  } catch (error) {
    console.error('Error fetching lessons:', error)
    res.status(500).json({ message: 'Failed to fetch lessons' })
  }
})

// Toggle featured status for a lesson
router.put('/lessons/:id/featured', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { isFeatured } = req.body
    const db = getDB()

    const result = await db.collection('lessons').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { isFeatured } },
      { returnDocument: 'after' }
    )

    if (!result) {
      return res.status(404).json({ message: 'Lesson not found' })
    }

    res.json(result)
  } catch (error) {
    console.error('Error toggling featured:', error)
    res.status(500).json({ message: 'Failed to update featured status' })
  }
})

// Get reported lessons
router.get('/reported-lessons', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB()

    // Fetch reported lessons
    const reportedLessons = await db.collection('lessons')
      .find({ reportCount: { $gt: 0 } })
      .sort({ reportCount: -1 })
      .toArray()

    if (reportedLessons.length === 0) {
      return res.json([])
    }

    // Get all author IDs
    const authorIds = [...new Set(reportedLessons.map(l => l.author).filter(Boolean))]

    // Fetch all authors
    const authors = await db.collection('users')
      .find({ _id: { $in: authorIds } })
      .project({ displayName: 1, email: 1 })
      .toArray()

    // Create author lookup map
    const authorMap = {}
    authors.forEach(author => {
      authorMap[author._id.toString()] = author
    })

    // Format result
    const result = reportedLessons.map(lesson => ({
      _id: lesson._id,
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        category: lesson.category,
        emotionalTone: lesson.emotionalTone,
        privacy: lesson.privacy,
        author: lesson.author ? authorMap[lesson.author.toString()] : null,
        createdAt: lesson.createdAt
      },
      reportCount: lesson.reportCount || 0,
      latestReportDate: lesson.reports && lesson.reports.length > 0 
        ? lesson.reports[lesson.reports.length - 1].reportedAt 
        : lesson.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error fetching reported lessons:', error)
    res.status(500).json({ message: 'Failed to fetch reported lessons' })
  }
})

// Get detailed reports for a specific lesson
router.get('/lessons/:id/reports', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDB()

    const lesson = await db.collection('lessons').findOne({ _id: new ObjectId(id) })

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' })
    }

    // Fetch author info
    let author = null
    if (lesson.author) {
      author = await db.collection('users')
        .findOne({ _id: lesson.author })
        .then(u => u ? { _id: u._id, displayName: u.displayName, email: u.email } : null)
    }

    // Fetch reporter info for all reports
    const reports = lesson.reports || []
    if (reports.length > 0) {
      const reporterIds = [...new Set(reports.map(r => r.reportedBy).filter(Boolean))]
      const reporters = await db.collection('users')
        .find({ _id: { $in: reporterIds } })
        .project({ displayName: 1, email: 1 })
        .toArray()

      const reporterMap = {}
      reporters.forEach(reporter => {
        reporterMap[reporter._id.toString()] = reporter
      })

      // Add reporter info to reports
      reports.forEach(report => {
        if (report.reportedBy) {
          report.reportedBy = reporterMap[report.reportedBy.toString()] || null
        }
      })
    }

    res.json({
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        category: lesson.category,
        emotionalTone: lesson.emotionalTone,
        author: author,
        createdAt: lesson.createdAt
      },
      reports: reports
    })
  } catch (error) {
    console.error('Error fetching report details:', error)
    res.status(500).json({ message: 'Failed to fetch report details' })
  }
})

// Ignore all reports for a lesson
router.put('/lessons/:id/ignore-reports', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDB()

    const result = await db.collection('lessons').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          reports: [],
          reportCount: 0
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return res.status(404).json({ message: 'Lesson not found' })
    }

    res.json({ message: 'Reports dismissed successfully' })
  } catch (error) {
    console.error('Error ignoring reports:', error)
    res.status(500).json({ message: 'Failed to ignore reports' })
  }
})

// Update user role
router.put('/users/:id/role', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body
    const db = getDB()

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { role } },
      { returnDocument: 'after' }
    )

    if (!result) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Remove password from response
    delete result.password

    res.json(result)
  } catch (error) {
    console.error('Error updating user role:', error)
    res.status(500).json({ message: 'Failed to update user role' })
  }
})

export default router
