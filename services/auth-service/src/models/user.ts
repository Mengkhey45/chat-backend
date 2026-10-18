/**
 * This file used to define a *second* User schema over the same `users`
 * collection, duplicating shared/models/User.ts. Both registered the model name
 * "User", so once every service runs inside one process only one definition
 * survives — whichever module loaded first. The schema now lives in one place;
 * this re-export keeps the existing `import User from "../models/user"` sites working.
 */
export { User, User as default } from "../../../../shared/models/User";
export type { IUser } from "../../../../shared/models/User";
