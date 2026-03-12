import { Router, Request, Response } from 'express';
import { loginRateLimit } from '../middleware/security';

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  if ((req.session as any)?.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    error: null,
    csrfToken: (req.session as any).csrfToken,
  });
});

router.post('/login', loginRateLimit, (req: Request, res: Response) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (username === adminUser && password === adminPassword) {
    (req.session as any).isAdmin = true;
    return res.redirect('/admin');
  }

  res.render('admin/login', {
    error: 'Invalid credentials',
    csrfToken: (req.session as any).csrfToken,
  });
});

router.get('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

export default router;
