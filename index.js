import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import usersRouter from './src/routes/users.js';
import lessonsRouter from './src/routes/lessons.js';
import contributorsRouter from './src/routes/contributors.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Debug logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// Connect to MongoDB
await connectDB();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Digital Life Lessons Server is running' });
});

app.use('/api/users', usersRouter);
app.use('/api/lessons', lessonsRouter);
app.use('/api/contributors', contributorsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
