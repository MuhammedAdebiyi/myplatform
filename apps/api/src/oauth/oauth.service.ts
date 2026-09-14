import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { prisma, AuthProvider, ActorType, OrgRole } from '@myplatform/database';
import { generatePkcePair, generateOAuthState, hashSessionToken, sessionExpiresAt, generateSessionToken } from '@myplatform/auth';
import { AuditService } from '../audit/audit.service.js';

interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
}

interface OAuthTokens {
  access_token: string;
  token_type: string;
  scope: string;
}

interface OAuthUserInfo {
  id: string;
  email: string | null;
  name: string | null;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private readonly audit: AuditService) {}

  private getProviderConfig(provider: AuthProvider): OAuthProviderConfig {
    switch (provider) {
      case AuthProvider.GOOGLE:
        return {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          userinfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
          scope: 'openid email profile',
        };
      case AuthProvider.GITHUB:
        return {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          authorizationUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userinfoUrl: 'https://api.github.com/user',
          scope: 'read:user user:email',
        };
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async createAuthorizationUrl(
    provider: AuthProvider,
    redirectTo?: string,
  ): Promise<{ url: string; state: string }> {
    const config = this.getProviderConfig(provider);
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateOAuthState();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await prisma.oAuthState.create({
      data: {
        state,
        provider,
        codeVerifier,
        redirectTo: redirectTo ?? null,
        expiresAt,
      },
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${process.env.APP_URL}/auth/${provider.toLowerCase()}/callback`,
      response_type: 'code',
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${config.authorizationUrl}?${params.toString()}`,
      state,
    };
  }

  async handleCallback(
    provider: AuthProvider,
    code: string,
    state: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; isNewUser: boolean }> {
    const oauthState = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!oauthState) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (oauthState.provider !== provider) {
      throw new UnauthorizedException('Provider mismatch');
    }

    if (oauthState.expiresAt < new Date()) {
      await prisma.oAuthState.delete({ where: { state } });
      throw new UnauthorizedException('OAuth state expired');
    }

    await prisma.oAuthState.delete({ where: { state } });

    const config = this.getProviderConfig(provider);
    const tokens = await this.exchangeCode(config, code, oauthState.codeVerifier);
    const userInfo = await this.fetchUserInfo(config, tokens.access_token);

    if (!userInfo.email) {
      throw new UnauthorizedException('Provider did not return an email');
    }

    const result = await this.findOrCreateUser(
      provider,
      userInfo,
      ip,
      userAgent,
    );

    return result;
  }

  private async exchangeCode(
    config: OAuthProviderConfig,
    code: string,
    codeVerifier: string,
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.APP_URL}/auth/${config.scope.includes('openid') ? 'google' : 'github'}/callback`,
      code_verifier: codeVerifier,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error({ status: response.status, body: text }, 'OAuth token exchange failed');
      throw new UnauthorizedException('Failed to exchange OAuth code');
    }

    return response.json() as Promise<OAuthTokens>;
  }

  private async fetchUserInfo(
    config: OAuthProviderConfig,
    accessToken: string,
  ): Promise<OAuthUserInfo> {
    const response = await fetch(config.userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch user info');
    }

    const data = await response.json() as any;

    if (config.scope.includes('openid')) {
      return { id: data.sub, email: data.email, name: data.name };
    }

    let email = data.email;
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (emailRes.ok) {
        const emails = await emailRes.json() as any[];
        const primary = emails.find((e: any) => e.primary && e.verified);
        email = primary?.email ?? emails.find((e: any) => e.verified)?.email;
      }
    }

    return { id: String(data.id), email, name: data.name ?? data.login };
  }

  private async findOrCreateUser(
    provider: AuthProvider,
    userInfo: OAuthUserInfo,
    ip?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; isNewUser: boolean }> {
    const existingIdentity = await prisma.accountIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: userInfo.id,
        },
      },
      include: { user: { select: { id: true, status: true } } },
    });

    if (existingIdentity) {
      return this.handleExistingUser(existingIdentity.user.id, existingIdentity.user.status, provider, ip, userAgent);
    }

    try {
      return await this.createNewUser(provider, userInfo, ip, userAgent);
    } catch (err: any) {
      // P2002 = unique constraint violation on @@unique([provider, providerAccountId])
      // This fires when two concurrent callbacks race: both see null, both try to create.
      // The second insert fails — recover by re-fetching the identity the first request created.
      if (err?.code === 'P2002') {
        this.logger.warn({ provider, providerAccountId: userInfo.id }, 'Race condition on identity create, re-fetching');
        const retryIdentity = await prisma.accountIdentity.findUnique({
          where: {
            provider_providerAccountId: {
              provider,
              providerAccountId: userInfo.id,
            },
          },
          include: { user: { select: { id: true, status: true } } },
        });
        if (retryIdentity) {
          return this.handleExistingUser(retryIdentity.user.id, retryIdentity.user.status, provider, ip, userAgent);
        }
        // If still not found, something else went wrong — fall through to original error
      }
      throw err;
    }
  }

  private async handleExistingUser(
    userId: string,
    status: string,
    provider: AuthProvider,
    ip?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; isNewUser: boolean }> {
    if (status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended');
    }

    const session = generateSessionToken();
    await prisma.session.create({
      data: {
        userId,
        tokenHash: session.hash,
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt: sessionExpiresAt(),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'user.oauth.login',
      resourceType: 'User',
      resourceId: userId,
      metadata: { provider },
      ipAddress: ip,
      userAgent,
    });

    return { sessionToken: session.raw, isNewUser: false };
  }

  private async createNewUser(
    provider: AuthProvider,
    userInfo: OAuthUserInfo,
    ip?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; isNewUser: boolean }> {
    const result = await prisma.$transaction(async (tx) => {
      const slug = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const user = await tx.user.create({
        data: {
          email: userInfo.email!,
          name: userInfo.name ?? 'User',
          emailVerified: true,
          accountIdentities: {
            create: {
              provider,
              providerAccountId: userInfo.id,
              email: userInfo.email,
            },
          },
          memberships: {
            create: {
              organization: {
                create: {
                  name: `${userInfo.name ?? 'My'} Organization`,
                  slug,
                  createdBy: 'system',
                },
              },
              role: OrgRole.OWNER,
            },
          },
        },
        select: { id: true },
      });

      const session = generateSessionToken();
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: session.hash,
          ipAddress: ip ?? null,
          userAgent: userAgent ?? null,
          expiresAt: sessionExpiresAt(),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return { sessionToken: session.raw, userId: user.id };
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: result.userId,
      action: 'user.oauth.register',
      resourceType: 'User',
      resourceId: result.userId,
      metadata: { provider, email: userInfo.email },
      ipAddress: ip,
      userAgent,
    });

    return { sessionToken: result.sessionToken, isNewUser: true };
  }

  async createLinkUrl(
    provider: AuthProvider,
    userId: string,
  ): Promise<{ url: string; state: string }> {
    const config = this.getProviderConfig(provider);
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateOAuthState();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await prisma.oAuthState.create({
      data: {
        state,
        provider,
        codeVerifier,
        redirectTo: `/settings/accounts`,
        initiatingUserId: userId,
        expiresAt,
      },
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${process.env.APP_URL}/auth/${provider.toLowerCase()}/callback`,
      response_type: 'code',
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    return {
      url: `${config.authorizationUrl}?${params.toString()}`,
      state,
    };
  }

  async handleLinkCallback(
    provider: AuthProvider,
    code: string,
    state: string,
    userId: string,
  ): Promise<{ linked: boolean; provider: string }> {
    const oauthState = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!oauthState) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (oauthState.provider !== provider) {
      throw new UnauthorizedException('Provider mismatch');
    }

    if (oauthState.expiresAt < new Date()) {
      await prisma.oAuthState.delete({ where: { state } });
      throw new UnauthorizedException('OAuth state expired');
    }

    if (!userId) {
      throw new UnauthorizedException('Authentication required to link accounts');
    }

    if (oauthState.initiatingUserId && oauthState.initiatingUserId !== userId) {
      await prisma.oAuthState.delete({ where: { state } });
      throw new UnauthorizedException('Session user does not match the user who initiated the link');
    }

    await prisma.oAuthState.delete({ where: { state } });

    const config = this.getProviderConfig(provider);
    const tokens = await this.exchangeCode(config, code, oauthState.codeVerifier);
    const userInfo = await this.fetchUserInfo(config, tokens.access_token);

    if (!userInfo.email) {
      throw new UnauthorizedException('Provider did not return an email');
    }

    const existingIdentity = await prisma.accountIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: userInfo.id,
        },
      },
    });

    if (existingIdentity) {
      if (existingIdentity.userId === userId) {
        return { linked: false, provider };
      }
      throw new UnauthorizedException(
        'This provider account is already linked to another user',
      );
    }

    await prisma.accountIdentity.create({
      data: {
        userId,
        provider,
        providerAccountId: userInfo.id,
        email: userInfo.email,
      },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'user.oauth.link',
      resourceType: 'User',
      resourceId: userId,
      metadata: { provider, providerAccountId: userInfo.id },
    });

    return { linked: true, provider };
  }

  async unlinkProvider(
    userId: string,
    provider: AuthProvider,
  ): Promise<void> {
    const identity = await prisma.accountIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: '__nonexistent__',
        },
      },
    });

    const identities = await prisma.accountIdentity.findMany({
      where: { userId },
    });

    const targetIdentity = identities.find((i) => i.provider === provider);
    if (!targetIdentity) {
      throw new UnauthorizedException('Provider not linked to this account');
    }

    if (identities.length <= 1) {
      throw new UnauthorizedException(
        'Cannot unlink your only authentication method',
      );
    }

    await prisma.accountIdentity.delete({
      where: { id: targetIdentity.id },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'user.oauth.unlink',
      resourceType: 'User',
      resourceId: userId,
      metadata: { provider },
    });
  }

  async listIdentities(userId: string) {
    return prisma.accountIdentity.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
