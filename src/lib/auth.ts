import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function generateToken(): string {
  return nanoid(32);
}

export function otpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
