// ─────────────────────────────────────────────────────────────────────────────
// Authentication Service — Registration, Login, OAuth, Tokens
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, gt } from 'drizzle-orm';
import type { User, AuthTokenPayload } from '@ibm-agent/types';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  generateId,
} from '@ibm-agent/shared';
import { JWT_ACCESS_EXPIRES, JWT_REFRESH_EXPIRES } from '@ibm-agent/shared';
import { getDb } from '../db/connection';
import { users, refreshTokens, userSettings } from '../db/schema';
import { env } from '../lib/env';
import type { RegisterInput, LoginInput } from '@ibm-agent/shared';

export interface AuthResult {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  // ── Token Generation ────────────────────────────────────────────────────────

  private generateAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role } satisfies Omit<AuthTokenPayload, 'iat' | 'exp'>,
      env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES },
    );
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES,
    });
  }

  private async storeRefreshToken(userId: string, token: string): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await db.insert(refreshTokens).values({ userId, token, expiresAt });
  }

  // ── Register ────────────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<AuthResult> {
    const db = getDb();

    // Check existing email
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const [user] = await db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: 'developer',
        provider: 'local',
      })
      .returning();

    // Create default settings
    await db.insert(userSettings).values({ userId: user.id });

    const accessToken = this.generateAccessToken(user as unknown as User);
    const refreshToken = this.generateRefreshToken(user.id);
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(input: LoginInput): Promise<AuthResult> {
    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const accessToken = this.generateAccessToken(user as unknown as User);
    const refreshToken = this.generateRefreshToken(user.id);
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  // ── OAuth Login (GitHub / Google) ───────────────────────────────────────────

  async oauthLogin(
    provider: 'github' | 'google',
    providerId: string,
    email: string,
    name: string,
    avatarUrl?: string,
  ): Promise<AuthResult> {
    const db = getDb();

    let [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.provider, provider), eq(users.providerId!, providerId)))
      .limit(1);

    if (!user) {
      // Check if email exists (link account)
      const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (byEmail) {
        // Link OAuth to existing account
        [user] = await db
          .update(users)
          .set({ provider, providerId, avatarUrl })
          .where(eq(users.id, byEmail.id))
          .returning();
      } else {
        // Create new user
        [user] = await db
          .insert(users)
          .values({ email: email.toLowerCase(), name, avatarUrl, provider, providerId, role: 'developer' })
          .returning();
        await db.insert(userSettings).values({ userId: user.id });
      }
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const accessToken = this.generateAccessToken(user as unknown as User);
    const refreshToken = this.generateRefreshToken(user.id);
    await this.storeRefreshToken(user.id, refreshToken);

    return { user: this.sanitizeUser(user), accessToken, refreshToken, expiresIn: 900 };
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async refresh(token: string): Promise<Omit<AuthResult, 'refreshToken'>> {
    const db = getDb();

    let payload: { sub: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new AuthenticationError('Invalid refresh token');
    }

    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, token),
          eq(refreshTokens.userId, payload.sub),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!storedToken || storedToken.revokedAt) {
      throw new AuthenticationError('Refresh token revoked or expired');
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or deactivated');
    }

    const accessToken = this.generateAccessToken(user as unknown as User);

    return { user: this.sanitizeUser(user), accessToken, expiresIn: 900 };
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(token: string): Promise<void> {
    const db = getDb();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.token, token));
  }

  async logoutAll(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, userId));
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError('User');
    return this.sanitizeUser(user);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private sanitizeUser(user: typeof users.$inferSelect): Omit<User, 'passwordHash'> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? undefined,
      role: user.role as User['role'],
      provider: user.provider as User['provider'],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export const authService = new AuthService();
