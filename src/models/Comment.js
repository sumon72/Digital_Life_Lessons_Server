import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';

export class CommentModel {
  static async create(commentData) {
    const db = getDB();
    const result = await db.collection('comments').insertOne({
      ...commentData,
      lessonId: ObjectId.isValid(commentData.lessonId)
        ? new ObjectId(commentData.lessonId)
        : commentData.lessonId, // fall back if legacy string IDs exist
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return result.insertedId;
  }

  static async findByLessonId(lessonId) {
    const db = getDB();
    const objectId = ObjectId.isValid(lessonId) ? new ObjectId(lessonId) : null;
    const filter = objectId
      ? { $or: [{ lessonId: objectId }, { lessonId: lessonId }] }
      : { lessonId: lessonId };

    return db.collection('comments')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
  }

  static async findById(id) {
    const db = getDB();
    return db.collection('comments').findOne({ _id: new ObjectId(id) });
  }

  static async update(id, commentData) {
    const db = getDB();
    return db.collection('comments').updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...commentData, updatedAt: new Date() } }
    );
  }

  static async delete(id) {
    const db = getDB();
    return db.collection('comments').deleteOne({ _id: new ObjectId(id) });
  }

  static async countByLessonId(lessonId) {
    const db = getDB();
    const objectId = ObjectId.isValid(lessonId) ? new ObjectId(lessonId) : null;
    const filter = objectId
      ? { $or: [{ lessonId: objectId }, { lessonId: lessonId }] }
      : { lessonId: lessonId };

    return db.collection('comments').countDocuments(filter);
  }
}
