import { Router } from 'express';
import { register, login, logout, getCurrentUser } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { authRateLimiter } from '../middleware/rate-limiter';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentUser);

export const authRoutes = router;
