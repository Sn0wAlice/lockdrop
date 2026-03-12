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

// Trust reverse proxy (Cloudflare, nginx, traefik, etc.) — MUST be before session
// Number of proxy hops: Cloudflare(1) + optional nginx/traefik(2)
app.set('trust proxy', 2);

// Security
app.use(helmetMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files — served BEFORE session middleware (no session overhead)
app.use(express.static(path.join(__dirname, '../public')));

// Catch favicon and other static 404s BEFORE session middleware
// Prevents race condition: browser requests page + favicon simultaneously,
// both create new sessions (no cookie yet), last Set-Cookie wins → CSRF mismatch
app.use((req, res, next) => {
  if (req.path === '/favicon.ico' || req.path.startsWith('/assets/')) {
    return res.status(204).end();
  }
  next();
});

// Session (use SequelizeStore in production with MySQL)
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({ db: sequelize });

app.use(
  session({
    name: 'lockdrop.sid',
    secret: process.env.SESSION_SECRET || 'change-me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      // secure: false is safe here — Cloudflare enforces HTTPS on the client side.
      // The origin connection (Cloudflare → Docker) is HTTP, so secure: true
      // breaks session cookies entirely. httpOnly + sameSite still protect the cookie.
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      sameSite: 'lax',
    },
  })
);

// Rate limiting (after session, uses trust proxy for IP detection)
app.use(globalRateLimit);

// CSRF
app.use(generateCsrfToken);
app.use('/auth', csrfProtection);
app.use('/admin', csrfProtection);
app.use('/s', csrfProtection);

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
    await sessionStore.sync();
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
