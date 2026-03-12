import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import path from 'path';
import { sequelize } from './models';
import {
  helmetMiddleware,
  globalRateLimit,
  generateCsrfToken,
  csrfProtection,
} from './middleware/security';

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import shareRoutes from './routes/share';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security
app.use(helmetMiddleware);
app.use(globalRateLimit);
app.set('trust proxy', 1);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Session (use SequelizeStore in production with MySQL)
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({ db: sequelize });

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https'),
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      sameSite: 'strict',
    },
  })
);

// CSRF
app.use(generateCsrfToken);
app.use('/auth', csrfProtection);
app.use('/admin/share', csrfProtection);

// Routes
app.get('/', (_req, res) => res.redirect('/admin'));
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/s', shareRoutes);

// 404
app.use((_req, res) => {
  res.status(404).render('share/access', {
    error: 'Page not found.',
    link: null,
    csrfToken: '',
  });
});

// Start
async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: true });
    sessionStore.sync();
    console.log('Models synced');

    app.listen(port, '0.0.0.0', () => {
      console.log(`LockDrop running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
