import express from 'express';
import { createServer as createViteServer } from 'vite';
import NextAuth from 'next-auth';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { authConfig } from './src/auth/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
function handleClientRouting(req, res, next) {
  if (req.path.startsWith('/api/')) {
    next();
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
}

/**
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function handleAuth(req, res) {
  const nextauth = await NextAuth(authConfig);
  return nextauth(req, res);
}

async function startServer() {
  const app = express();
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // Session middleware must be used before NextAuth
  app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
  }));

  // Serve static files from the dist directory
  app.use(express.static(path.join(__dirname, 'dist')));

  // Use Vite's middleware in development
  app.use(vite.middlewares);

  // Set up NextAuth routes
  app.use('/api/auth/*', handleAuth);

  // Handle client-side routing
  app.get('*', handleClientRouting);

  const port = 3000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer().catch((e) => {
  console.error('Error starting server:', e);
  process.exit(1);
});
