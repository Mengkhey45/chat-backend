declare module 'nodemailer' {
  export type Transporter = any;
  export type SentMessageInfo = any;
  export function createTransport(options: any): Transporter;
  export function verify(): Promise<void>;

  export function createTransport(arg0: { host: string; port: number; secure: boolean; auth: { user: string; pass: string; }; }): any {
    throw new Error("Function not implemented.");
  }
}
