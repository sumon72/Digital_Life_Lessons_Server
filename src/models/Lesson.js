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
      viewCount: 0
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
}
