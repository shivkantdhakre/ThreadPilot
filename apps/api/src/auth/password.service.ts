import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;

  constructor(private readonly config: ConfigService) {
    this.memoryCost = this.config.get<number>('ARGON2_MEMORY_COST', 65536);
    this.timeCost = this.config.get<number>('ARGON2_TIME_COST', 3);
    this.parallelism = this.config.get<number>('ARGON2_PARALLELISM', 4);
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
