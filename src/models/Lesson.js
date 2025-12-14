import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';

export class LessonModel {
  static async create(lessonData) {
    const db = getDB();
    const result = await db.collection('lessons').insertOne({
      ...lessonData,
      createdAt: new Date(),
      updatedAt: new Date(),
      savedCount: 0,
      viewCount: 0,
      likesCount: 0,
      likes: []
    });
    return result.insertedId;
  }

  static async findById(id) {
    const db = getDB();
    return db.collection('lessons').findOne({ _id: new ObjectId(id) });
  }

  static async findByAuthor(authorId) {
    const db = getDB();
    return db.collection('lessons').find({ authorId: new ObjectId(authorId) }).toArray();
  }

  static async findFeatured(limit = 3) {
    const db = getDB();
    return db.collection('lessons')
      .find({ status: 'published' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async findMostSaved(limit = 3) {
    const db = getDB();
    return db.collection('lessons')
      .find({ status: 'published' })
      .sort({ savedCount: -1 })
      .limit(limit)
      .toArray();
  }

  static async update(id, lessonData) {
    const db = getDB();
    return db.collection('lessons').updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...lessonData, updatedAt: new Date() } }
    );
  }

  static async delete(id) {
    const db = getDB();
    return db.collection('lessons').deleteOne({ _id: new ObjectId(id) });
  }

  static async findAll(filter = {}) {
    const db = getDB();
    return db.collection('lessons').find(filter).toArray();
  }

  static async incrementSaveCount(id) {
    const db = getDB();
    return db.collection('lessons').updateOne(
      { _id: new ObjectId(id) },
      { $inc: { savedCount: 1 } }
    );
  }

  static async incrementViewCount(id) {
    const db = getDB();
    return db.collection('lessons').updateOne(
      { _id: new ObjectId(id) },
      { $inc: { viewCount: 1 } }
    );
  }

  static async toggleLike(lessonId, userId) {
    const db = getDB();
    const lesson = await db.collection('lessons').findOne({ _id: new ObjectId(lessonId) });
    
    if (!lesson) throw new Error('Lesson not found');
    
    const likes = lesson.likes || [];
    const isLiked = likes.includes(userId);
    
    if (isLiked) {
      // Remove like
      await db.collection('lessons').updateOne(
        { _id: new ObjectId(lessonId) },
        { 
          $pull: { likes: userId },
          $inc: { likesCount: -1 }
        }
      );
    } else {
      // Add like
      await db.collection('lessons').updateOne(
        { _id: new ObjectId(lessonId) },
        { 
          $push: { likes: userId },
          $inc: { likesCount: 1 }
        }
      );
    }
    
    return !isLiked; // Return the new state
  }

  static async findSimilar(category, emotionalTone, limit = 6, excludeId = null) {
    const db = getDB();
    const conditions = [];

    if (category) conditions.push({ category });
    if (emotionalTone) conditions.push({ emotionalTone });

    const filter = {
      privacy: 'public'
    };

    if (excludeId) {
      filter._id = { $ne: new ObjectId(excludeId) };
    }

    // Only add the OR block when we actually have values to match; otherwise allow all public lessons
    if (conditions.length > 0) {
      filter.$or = conditions;
    }
    
    return db.collection('lessons')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async findRecentPublic(limit = 6, excludeId = null) {
    const db = getDB();
    const filter = {
      privacy: 'public'
    };

    if (excludeId) {
      filter._id = { $ne: new ObjectId(excludeId) };
    }

    return db.collection('lessons')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }
}
