import { Request, Response, NextFunction } from 'express';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if ((req.session as any)?.isAdmin) {
    return next();
  }
  res.redirect('/auth/login');
};
