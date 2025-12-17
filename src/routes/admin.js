import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
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

    // Reported lessons (count distinct lessons with reports in lessonReports collection AND that still exist)
    const reportedLessonsData = await db.collection('lessonReports').aggregate([
      { $group: { _id: '$lessonId' } },
      { $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: '_id',
          as: 'lessonInfo'
        }
      },
      { $unwind: { path: '$lessonInfo', preserveNullAndEmptyArrays: true } },
      { $match: { lessonInfo: { $ne: null } } }
    ]).toArray()
    const reportedLessons = reportedLessonsData.length

    // Today's new lessons
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayNewLessons = await db.collection('lessons').countDocuments({ createdAt: { $gte: startOfToday } })

    // Top contributors (users with most lessons)
    const activeContributors = await db.collection('lessons').aggregate([
      { $group: { 
          _id: '$authorEmail', 
          lessonCount: { $sum: 1 },
          totalLikes: { $sum: '$likesCount' },
          totalSaves: { $sum: '$savedCount' }
        } 
      },
      { $sort: { lessonCount: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'users',
          localField: 'email',
          foreignField: 'authorEmail',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      { $project: {
          _id: '$userInfo._id',
          displayName: '$userInfo.displayName',
          email: '$userInfo.email',
          photoURL: '$userInfo.photoURL',
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

// Get growth analytics data
router.get('/growth-analytics', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB()

    // Get last 30 days of lesson creation data
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const lessonGrowth = await db.collection('lessons').aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).toArray()

    // Format lesson growth data
    const formattedLessonGrowth = lessonGrowth.map(item => ({
      date: new Date(item._id.year, item._id.month - 1, item._id.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: item.count
    }))

    // Get last 30 days of user registration data
    const userGrowth = await db.collection('users').aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).toArray()

    // Format user growth data
    const formattedUserGrowth = userGrowth.map(item => ({
      date: new Date(item._id.year, item._id.month - 1, item._id.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: item.count
    }))

    res.json({
      lessonGrowth: formattedLessonGrowth,
      userGrowth: formattedUserGrowth
    })
  } catch (error) {
    console.error('Error fetching growth analytics:', error)
    res.status(500).json({ message: 'Failed to fetch growth analytics' })
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

    // Get reported lessons count from lessonReports collection
    const reportedLessonsData = await db.collection('lessonReports').aggregate([
      { $group: { _id: '$lessonId' } }
    ]).toArray()
    const reportedLessonIds = new Set(reportedLessonsData.map(r => r._id.toString()))

    const stats = {
      total: lessons.length,
      public: lessons.filter(l => l.privacy === 'public').length,
      private: lessons.filter(l => l.privacy === 'private').length,
      premium: lessons.filter(l => l.accessLevel === 'premium').length,
      reported: reportedLessonsData.length
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

    // Get all reports grouped by lesson
    const reports = await db.collection('lessonReports').aggregate([
      { $group: {
          _id: '$lessonId',
          reportCount: { $sum: 1 },
          latestReportDate: { $max: '$createdAt' }
        }
      },
      { $sort: { reportCount: -1 } },
      { $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: '_id',
          as: 'lessonInfo'
        }
      },
      { $unwind: { path: '$lessonInfo', preserveNullAndEmptyArrays: true } },
      // Drop reports whose lessons were deleted to avoid null lessonInfo
      { $match: { lessonInfo: { $ne: null } } },
      { $addFields: {
          'authorId': {
            $cond: [
              { $eq: [{ $type: '$lessonInfo.author' }, 'objectId'] },
              '$lessonInfo.author',
              { $cond: [
                  { $eq: [{ $type: '$lessonInfo.author' }, 'string'] },
                  { $convert: { input: '$lessonInfo.author', to: 'objectId', onError: null } },
                  null
                ]
              }
            ]
          }
        }
      },
      { $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'authorInfo'
        }
      }
    ]).toArray()

    if (reports.length === 0) {
      return res.json([])
    }

    // Format result
    const result = reports.map(report => ({
      _id: report._id,
      lesson: {
        _id: report.lessonInfo._id,
        title: report.lessonInfo.title || 'Untitled',
        category: report.lessonInfo.category || 'Uncategorized',
        emotionalTone: report.lessonInfo.emotionalTone || 'Neutral',
        privacy: report.lessonInfo.privacy || 'private',
        author: report.authorInfo && report.authorInfo.length > 0 
          ? { 
              _id: report.authorInfo[0]._id, 
              displayName: report.authorInfo[0].displayName || report.lessonInfo.authorName || 'Unknown', 
              email: report.authorInfo[0].email || report.lessonInfo.authorEmail || 'unknown@example.com'
            }
          : { 
              displayName: report.lessonInfo.authorName || 'Unknown Author', 
              email: report.lessonInfo.authorEmail || 'unknown@example.com'
            },
        createdAt: report.lessonInfo.createdAt || new Date()
      },
      reportCount: report.reportCount || 0,
      latestReportDate: report.latestReportDate || report.lessonInfo.createdAt || new Date()
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

    // Fetch author info with proper type handling
    let author = null
    if (lesson.author) {
      try {
        // Handle both ObjectId and string formats
        const authorId = typeof lesson.author === 'string' ? new ObjectId(lesson.author) : lesson.author
        const authorUser = await db.collection('users').findOne({ _id: authorId })
        
        if (authorUser) {
          author = {
            _id: authorUser._id,
            displayName: authorUser.displayName || 'Unknown',
            email: authorUser.email || 'unknown@example.com'
          }
        } else {
          // Fallback to lesson's stored author data
          author = {
            displayName: lesson.authorName || 'Unknown Author',
            email: lesson.authorEmail || 'unknown@example.com'
          }
        }
      } catch (err) {
        // If conversion fails, use fallback
        author = {
          displayName: lesson.authorName || 'Unknown Author',
          email: lesson.authorEmail || 'unknown@example.com'
        }
      }
    } else {
      // No author ObjectId, use fallback
      author = {
        displayName: lesson.authorName || 'Unknown Author',
        email: lesson.authorEmail || 'unknown@example.com'
      }
    }

    // Fetch all reports for this lesson from lessonReports collection
    const reports = await db.collection('lessonReports')
      .find({ lessonId: new ObjectId(id) })
      .sort({ createdAt: -1 })
      .toArray()

    // Add reporter info to reports
    if (reports.length > 0) {
      const reporterIds = [...new Set(reports.map(r => r.reporterUserId).filter(Boolean))]
      const reporters = await db.collection('users')
        .find({ _id: { $in: reporterIds } })
        .project({ displayName: 1, email: 1 })
        .toArray()

      const reporterMap = {}
      reporters.forEach(reporter => {
        reporterMap[reporter._id.toString()] = reporter
      })

      // Add reporter info to reports with fallback
      reports.forEach(report => {
        if (report.reporterUserId) {
          const reporterInfo = reporterMap[report.reporterUserId.toString()]
          report.reporterInfo = reporterInfo || {
            displayName: report.reporterEmail?.split('@')[0] || 'Unknown',
            email: report.reporterEmail || 'unknown@example.com'
          }
        } else {
          // If no reporter user ID, use email if available
          report.reporterInfo = {
            displayName: report.reporterEmail?.split('@')[0] || 'Unknown',
            email: report.reporterEmail || 'unknown@example.com'
          }
        }
      })
    }

    res.json({
      lesson: {
        _id: lesson._id,
        title: lesson.title || 'Untitled',
        category: lesson.category || 'Uncategorized',
        emotionalTone: lesson.emotionalTone || 'Neutral',
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

    // Delete all reports for this lesson from lessonReports collection
    const deleteResult = await db.collection('lessonReports').deleteMany(
      { lessonId: new ObjectId(id) }
    )

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ message: 'No reports found for this lesson' })
    }

    res.json({ 
      message: 'Reports dismissed successfully',
      deletedCount: deleteResult.deletedCount
    })
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
