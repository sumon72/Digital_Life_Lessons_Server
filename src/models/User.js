import { getDB } from '../config/db.js';
import { ObjectId } from 'mongodb';

export class UserModel {
  static async create(userData) {
    const db = getDB();
    const result = await db.collection('users').insertOne({
      ...userData,
      isPremium: false, // New users start with free plan
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return result.insertedId;
  }

  static async findById(id) {
    const db = getDB();
    return db.collection('users').findOne({ _id: new ObjectId(id) });
  }

  static async findByEmail(email) {
    const db = getDB();
    return db.collection('users').findOne({ email });
  }

  static async update(id, userData) {
    const db = getDB();
    return db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...userData, updatedAt: new Date() } }
    );
  }

  static async delete(id) {
    const db = getDB();
    return db.collection('users').deleteOne({ _id: new ObjectId(id) });
  }

  static async findAll() {
    const db = getDB();
    return db.collection('users').find({}).toArray();
  }
}
