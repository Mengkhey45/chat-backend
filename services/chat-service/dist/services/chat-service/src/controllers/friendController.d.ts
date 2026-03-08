import type { Request, Response } from 'express';
interface AuthenticatedRequest extends Request {
    user: {
        userId: string;
    };
}
export declare const acceptFriendRequest: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export {};
//# sourceMappingURL=friendController.d.ts.map