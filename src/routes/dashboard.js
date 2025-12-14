import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { LessonModel } from '../models/Lesson.js'
import { SaveModel } from '../models/Save.js'
import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'

const router = express.Router()

// Get user dashboard stats
router.get('/user/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const userEmail = req.user.email
    const db = getDB()

    // Match lessons authored by this user across possible legacy fields
    const authorFilter = {
      $or: [
        { author: new ObjectId(userId) },
        { authorId: new ObjectId(userId) },
        { authorEmail: userEmail }
      ]
    }

    // Get total lessons created by user
    const totalLessons = await db.collection('lessons')
      .countDocuments(authorFilter)

    // Get total likes across all user's lessons
    const lessonsWithLikes = await db.collection('lessons')
      .find(authorFilter)
      .project({ likesCount: 1 })
      .toArray()
    const totalLikes = lessonsWithLikes.reduce((sum, lesson) => sum + (lesson.likesCount || 0), 0)

    // Get total saves (lessons saved by this user)
    const saves = await SaveModel.findByUser(userId)
    const totalSaved = saves.length

    // Get recent lessons
    const recentLessons = await db.collection('lessons')
      .find(authorFilter)
      .sort({ createdAt: -1 })
      .limit(3)
      .project({ title: 1, category: 1, emotionalTone: 1, privacy: 1, likesCount: 1, savedCount: 1, viewsCount: 1, createdAt: 1 })
      .toArray()

    // Build weekly contributions (last 8 weeks including current)
    const weeksToShow = 8
    const today = new Date()
    const eightWeeksAgo = new Date()
    eightWeeksAgo.setUTCDate(today.getUTCDate() - (weeksToShow - 1) * 7)

    const weeklyLessons = await db.collection('lessons')
      .find({
        ...authorFilter,
        $or: [
          { createdAt: { $gte: eightWeeksAgo } },
          { updatedAt: { $gte: eightWeeksAgo } }
        ]
      })
      .project({ createdAt: 1, updatedAt: 1 })
      .toArray()

    const getWeekStartKey = (date) => {
      const d = new Date(date)
      const day = d.getUTCDay() // 0=Sun
      const diff = (day + 6) % 7 // back to Monday
      d.setUTCHours(0, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() - diff)
      return d.toISOString().slice(0, 10)
    }

    const weekBuckets = {}
    weeklyLessons.forEach((lesson) => {
      const baseDate = lesson.createdAt || lesson.updatedAt || new Date()
      const key = getWeekStartKey(baseDate)
      weekBuckets[key] = (weekBuckets[key] || 0) + 1
    })

    const weeklyContributions = []
    for (let i = weeksToShow - 1; i >= 0; i--) {
      const ref = new Date(today)
      ref.setUTCDate(ref.getUTCDate() - i * 7)
      const key = getWeekStartKey(ref)
      weeklyContributions.push({
        weekStart: key,
        count: weekBuckets[key] || 0
      })
    }

    res.json({
      totalLessons,
      totalLikes,
      totalSaved,
      recentLessons,
      weeklyContributions
    })
  } catch (error) {
    console.error('Error fetching user stats:', error)
    res.status(500).json({ message: 'Failed to fetch user stats' })
  }
})

// Get user's all lessons with filters
router.get('/user/lessons', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const db = getDB()

    const lessons = await db.collection('lessons')
      .find({ author: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .project({ title: 1, category: 1, emotionalTone: 1, privacy: 1, accessLevel: 1, likesCount: 1, savedCount: 1, viewsCount: 1, createdAt: 1 })
      .toArray()

    res.json(lessons)
  } catch (error) {
    console.error('Error fetching user lessons:', error)
    res.status(500).json({ message: 'Failed to fetch lessons' })
  }
})

// Get user's public lessons (for profile page)
router.get('/user/public-lessons', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const db = getDB()

    const lessons = await db.collection('lessons')
      .find({ author: new ObjectId(userId), privacy: 'public' })
      .sort({ createdAt: -1 })
      .project({ title: 1, category: 1, emotionalTone: 1, accessLevel: 1, likesCount: 1, savedCount: 1, viewsCount: 1, createdAt: 1 })
      .toArray()

    res.json(lessons)
  } catch (error) {
    console.error('Error fetching public lessons:', error)
    res.status(500).json({ message: 'Failed to fetch public lessons' })
  }
})

// Get user's saved lessons (favorites)
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const db = getDB()

    // Get all saves for this user
    const saves = await db.collection('saves')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray()

    // Get all lesson IDs
    const lessonIds = saves.map(save => save.lessonId)

    if (lessonIds.length === 0) {
      return res.json([])
    }

    // Fetch all lessons in one query
    const lessons = await db.collection('lessons')
      .find({ _id: { $in: lessonIds } })
      .toArray()

    // Get all author IDs
    const authorIds = lessons.map(lesson => lesson.author).filter(Boolean)

    // Fetch all authors in one query
    const authors = await db.collection('users')
      .find({ _id: { $in: authorIds } })
      .project({ displayName: 1, email: 1 })
      .toArray()

    // Create author lookup map
    const authorMap = {}
    authors.forEach(author => {
      authorMap[author._id.toString()] = author
    })

    // Create lesson lookup map
    const lessonMap = {}
    lessons.forEach(lesson => {
      lessonMap[lesson._id.toString()] = lesson
    })

    // Build favorites array with complete data
    const favorites = saves
      .map(save => {
        const lesson = lessonMap[save.lessonId.toString()]
        if (!lesson) return null // Skip if lesson was deleted

        const author = lesson.author ? authorMap[lesson.author.toString()] : null

        return {
          _id: lesson._id,
          title: lesson.title,
          category: lesson.category,
          emotionalTone: lesson.emotionalTone,
          author: author || { displayName: 'Unknown', email: '' },
          likesCount: lesson.likesCount || 0,
          savedCount: lesson.savedCount || 0,
          viewsCount: lesson.viewsCount || 0,
          savedAt: save.createdAt
        }
      })
      .filter(Boolean) // Remove null entries

    res.json(favorites)
  } catch (error) {
    console.error('Error fetching favorites:', error)
    res.status(500).json({ message: 'Failed to fetch favorites' })
  }
})

export default router
