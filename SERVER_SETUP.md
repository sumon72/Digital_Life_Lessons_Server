# Digital Life Lessons Server

Express.js backend server with MongoDB integration.

## Project Structure

```
src/
├── config/
│   └── db.js              # MongoDB connection & configuration
├── models/
│   ├── User.js            # User model & operations
│   ├── Lesson.js          # Lesson model & operations
│   └── Save.js            # Save/Bookmark model & operations
└── routes/
    ├── users.js           # User routes (CRUD)
    ├── lessons.js         # Lesson routes (CRUD + featured/most-saved)
    └── contributors.js    # Contributors routes
```

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Update `.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/digital-life-lessons
JWT_SECRET=your_jwt_secret_key_here
```

### 3. Start MongoDB
```bash
# Using MongoDB locally
mongod

# Or use MongoDB Atlas (update MONGODB_URI in .env)
```

### 4. Run Server
```bash
# Development
npm run dev

# Production
npm start
```

## API Routes

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Lessons
- `GET /api/lessons` - Get all lessons (with filter)
- `GET /api/lessons/featured` - Get featured lessons
- `GET /api/lessons/most-saved` - Get most saved lessons
- `GET /api/lessons/:id` - Get lesson by ID
- `POST /api/lessons` - Create lesson
- `PUT /api/lessons/:id` - Update lesson
- `DELETE /api/lessons/:id` - Delete lesson
- `POST /api/lessons/:id/save` - Save/unsave lesson

### Contributors
- `GET /api/contributors/top-week` - Get top contributors of the week

## Database Collections

### users
```json
{
  "_id": ObjectId,
  "email": "user@example.com",
  "displayName": "John Doe",
  "photoURL": "https://...",
  "createdAt": Date,
  "updatedAt": Date
}
```

### lessons
```json
{
  "_id": ObjectId,
  "title": "Lesson Title",
  "content": "Lesson content...",
  "authorId": ObjectId,
  "category": "category",
  "status": "published|draft",
  "savedCount": 0,
  "viewCount": 0,
  "createdAt": Date,
  "updatedAt": Date
}
```

### saves
```json
{
  "_id": ObjectId,
  "userId": ObjectId,
  "lessonId": ObjectId,
  "createdAt": Date
}
```

## Development
```bash
npm run dev  # Runs with nodemon for hot reload
```
