import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';

export class SaveModel {
  static async create(userId, lessonId) {
    const db = getDB();
    const existingSave = await db.collection('saves').findOne({
      userId: new ObjectId(userId),
      lessonId: new ObjectId(lessonId)
    });

    if (existingSave) {
      return existingSave._id; // Already saved
    }

    const result = await db.collection('saves').insertOne({
      userId: new ObjectId(userId),
      lessonId: new ObjectId(lessonId),
      createdAt: new Date()
    });

    // Increment lesson save count
    await db.collection('lessons').updateOne(
      { _id: new ObjectId(lessonId) },
      { $inc: { savedCount: 1 } }
    );

    return result.insertedId;
  }

  static async delete(userId, lessonId) {
    const db = getDB();
    const result = await db.collection('saves').deleteOne({
      userId: new ObjectId(userId),
      lessonId: new ObjectId(lessonId)
    });

    if (result.deletedCount > 0) {
      // Decrement lesson save count
      await db.collection('lessons').updateOne(
        { _id: new ObjectId(lessonId) },
        { $inc: { savedCount: -1 } }
      );
    }

    return result;
  }

  static async findByUser(userId) {
    const db = getDB();
    return db.collection('saves')
      .find({ userId: new ObjectId(userId) })
      .toArray();
  }

  static async isSaved(userId, lessonId) {
    const db = getDB();
    const save = await db.collection('saves').findOne({
      userId: new ObjectId(userId),
      lessonId: new ObjectId(lessonId)
    });
    return !!save;
  }
}
