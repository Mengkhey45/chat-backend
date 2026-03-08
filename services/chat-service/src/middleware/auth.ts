import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface JWTPayload {
  userId: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

const getToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

export const authMiddleware: RequestHandler = (req, res, next) => {
  const token = getToken(req as Request);
  const secret = process.env.JWT_SECRET;

  console.log(`[AuthDebug] MID: ${req.method} ${req.originalUrl}`);
  console.log(`[AuthDebug] HDR: ${req.headers.authorization ? 'YES' : 'MISSING'}`);
  console.log(`[AuthDebug] SEC: ${secret ? `LOADED(${secret.substring(0, 3)}...)` : 'MISSING'}`);

  if (!token) {
    return res.status(401).json({ 
      error_source: "chat-service-middleware",
      message: "No token provided"
    });
  }

  if (!secret) {
    return res.status(500).json({ 
      error_source: "chat-service-middleware",
      message: "JWT_SECRET missing" 
    });
  }

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;
    (req as AuthenticatedRequest).user = payload;
    console.log(`[AuthDebug] OK: ${payload.userId}`);
    next();
  } catch (err: any) {
    console.error(`[AuthDebug] FAIL: ${err.message}`);
    res.status(401).json({ 
      error_source: "chat-service-middleware",
      message: "Invalid token",
      error: err.message
    });
  }
};
