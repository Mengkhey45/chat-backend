import { Queue } from 'bullmq';
import type { Request, Response } from "express";
declare const mediaQueue: Queue<any, any, string, any, any, string>;
declare const getUploadUrl: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export { mediaQueue, getUploadUrl };
//# sourceMappingURL=fileController.d.ts.map