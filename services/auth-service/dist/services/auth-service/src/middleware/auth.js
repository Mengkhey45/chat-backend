// import jwt from 'jsonwebtoken';
// import { Request, Response, NextFunction } from 'express';
// interface AuthenticatedRequest extends Request {
//   user?: any;
// }
// /**
//  * Extract JWT token from request
//  */
// const getToken = (req: Request): string | null => {
//   if (req.headers.authorization?.startsWith("Bearer ")) {
//     return req.headers.authorization.split(" ")[1];
//   }
//   // if (req.cookies?.token) return req.cookies.token; // unused: cookie-parser not configured and token not set in cookies
//   return null;
// };
// /**
//  * Auth middleware: protect routes
//  */
// export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
//   const token = getToken(req);
//   if (!token) {
//     res.status(401).json({ message: "No token provided" });
//     return;
//   }
//   try {
//     const payload = jwt.verify(token, process.env.JWT_SECRET as string);
//     req.user = payload;
//     next();
//   } catch {
//     res.status(401).json({ message: "Invalid or expired token" });
//     return;
//   }
// };
// // Support both default export and named export for compatibility
// // ...existing code...
import jwt from 'jsonwebtoken';
const getToken = (req) => {
    if (req.headers.authorization?.startsWith("Bearer ")) {
        return req.headers.authorization.split(" ")[1];
    }
    return null;
};
export const authMiddleware = (req, res, next) => {
    const token = getToken(req);
    if (!token) {
        res.status(401).json({ message: "No token provided" });
        return;
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (err) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
};
