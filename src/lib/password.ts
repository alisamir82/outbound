import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const passwordRules = {
  min: 10,
  check(p: string): string | null {
    if (p.length < this.min) return `Password must be at least ${this.min} characters`;
    if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p))
      return "Password must contain lower-case, upper-case and a digit";
    return null;
  },
};
