import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import usersRouter from './src/routes/users.js';
import lessonsRouter from './src/routes/lessons.js';
import contributorsRouter from './src/routes/contributors.js';
import paymentRouter from './src/routes/payment.js';
import dashboardRouter from './src/routes/dashboard.js';
import adminRouter from './src/routes/admin.js';
import commentsRouter from './src/routes/comments.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - Important: raw body for Stripe webhook must be before JSON parser
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
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
app.use('/api/payment', paymentRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/comments', commentsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
