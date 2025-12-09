import { MongoClient, ServerApiVersion } from 'mongodb';

let db = null;

export async function connectDB() {
  if (db) {
    return db;
  }

  try {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    await client.connect();
    db = client.db('DigitalLifeLessons');

    // Verify connection
    await db.admin().ping();
    console.log('✓ MongoDB connected successfully');

    return db;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error);
    process.exit(1);
  }
}

export function getDB() {
  if (!db) {
    throw new Error('Database not connected. Call connectDB first.');
  }
  return db;
}
