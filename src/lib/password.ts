import { compare, hash } from "bcryptjs";

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hashed: string): Promise<boolean>;
}

const ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, ROUNDS);
  }

  verify(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `fake:${plain}`;
  }

  async verify(plain: string, hashed: string): Promise<boolean> {
    return hashed === `fake:${plain}`;
  }
}
