import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface JWTPayload {
  userId: string;
  email?: string;
}

declare global {
  namespace Express {
    interface User {
      userId?: string;
      email?: string;
    }
  }
}

export type AuthenticatedRequest = Request;

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
    if (!payload?.userId) {
      return res.status(401).json({ message: "Invalid token" });
    }
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err: any) {
    // The reason a token failed verification ("jwt expired" vs "invalid
    // signature") is useful to us and useful to an attacker; log it, don't
    // return it. Expiry is the one case worth telling the client about so the
    // frontend can refresh rather than force a re-login.
    console.warn(`[Auth] token rejected: ${err.name}`);
    res.status(401).json({
      message: "Invalid or expired token",
      ...(err.name === 'TokenExpiredError' ? { expired: true } : {}),
    });
  }
};
