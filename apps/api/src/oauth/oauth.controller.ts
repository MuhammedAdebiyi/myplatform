import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OAuthService } from './oauth.service.js';
import { AuthProvider } from '@myplatform/database';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { OAuthThrottlerGuard } from './oauth-throttler.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator.js';
import type { CursorPaginationQuery } from '../common/pagination.js';

@Controller('auth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  private appUrl(): string {
    return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  /** After the API finishes the code exchange, hand the browser to the web app to set mp_session. */
  private completeOnFrontend(
    res: any,
    sessionToken: string,
    isNewUser: boolean,
    redirectTo: string | null,
  ) {
    const params = new URLSearchParams({
      token: sessionToken,
      new: String(isNewUser),
    });
    if (redirectTo) params.set('redirect_to', redirectTo);
    res.redirect(`${this.appUrl()}/api/auth/oauth?${params.toString()}`);
  }

  private failOnFrontend(res: any, code = 'oauth_failed') {
    res.redirect(`${this.appUrl()}/login?error=${code}`);
  }

  @UseGuards(OAuthThrottlerGuard)
  @Get('google')
  async googleInit(@Req() req: any, @Res() res: any) {
    try {
      const { url } = await this.oauthService.createAuthorizationUrl(
        AuthProvider.GOOGLE,
        req.query.redirect_to as string | undefined,
      );
      res.redirect(url);
    } catch {
      this.failOnFrontend(res, 'oauth_not_configured');
    }
  }

  @UseGuards(OAuthThrottlerGuard)
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    if (!code || !state) {
      this.failOnFrontend(res);
      return;
    }

    try {
      const result = await this.oauthService.handleCallback(
        AuthProvider.GOOGLE,
        code,
        state,
        req.ip,
        req.headers['user-agent'],
      );
      this.completeOnFrontend(res, result.sessionToken, result.isNewUser, result.redirectTo);
    } catch {
      this.failOnFrontend(res);
    }
  }

  @UseGuards(OAuthThrottlerGuard)
  @Get('github')
  async githubInit(@Req() req: any, @Res() res: any) {
    try {
      const { url } = await this.oauthService.createAuthorizationUrl(
        AuthProvider.GITHUB,
        req.query.redirect_to as string | undefined,
      );
      res.redirect(url);
    } catch {
      this.failOnFrontend(res, 'oauth_not_configured');
    }
  }

  @UseGuards(OAuthThrottlerGuard)
  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    if (!code || !state) {
      this.failOnFrontend(res);
      return;
    }

    try {
      const result = await this.oauthService.handleCallback(
        AuthProvider.GITHUB,
        code,
        state,
        req.ip,
        req.headers['user-agent'],
      );
      this.completeOnFrontend(res, result.sessionToken, result.isNewUser, result.redirectTo);
    } catch {
      this.failOnFrontend(res);
    }
  }

  @UseGuards(SessionGuard)
  @Get('link/:provider')
  async linkInit(
    @Param('provider') provider: string,
    @CurrentUser() user: CurrentUserType,
    @Res() res: any,
  ) {
    const authProvider = provider.toUpperCase() as AuthProvider;
    if (!Object.values(AuthProvider).includes(authProvider)) {
      throw new UnauthorizedException('Invalid provider');
    }

    const { url } = await this.oauthService.createLinkUrl(authProvider, user.id);
    res.redirect(url);
  }

  @UseGuards(SessionGuard)
  @Get('link/:provider/callback')
  async linkCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @CurrentUser() user: CurrentUserType,
    @Res() res: any,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing code or state');
    }

    const authProvider = provider.toUpperCase() as AuthProvider;
    await this.oauthService.handleLinkCallback(authProvider, code, state, user.id);

    res.redirect(`${this.appUrl()}/settings/accounts?linked=true`);
  }

  @UseGuards(SessionGuard)
  @Delete('link/:provider')
  async unlinkProvider(
    @Param('provider') provider: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const authProvider = provider.toUpperCase() as AuthProvider;
    await this.oauthService.unlinkProvider(user.id, authProvider);
    return { unlinked: true };
  }

  @UseGuards(SessionGuard)
  @Get('identities')
  async listIdentities(
    @CurrentUser() user: CurrentUserType,
    @Query() query: CursorPaginationQuery,
  ) {
    return this.oauthService.listIdentities(user.id, query.limit, query.cursor);
  }
}
