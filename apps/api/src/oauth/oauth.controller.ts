import { Controller, Get, Post, Delete, Query, Param, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { OAuthService } from './oauth.service.js';
import { AuthProvider } from '@myplatform/database';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator.js';

@Controller('auth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('google')
  async googleInit(@Req() req: any, @Res() res: any) {
    const { url } = await this.oauthService.createAuthorizationUrl(
      AuthProvider.GOOGLE,
      req.query.redirect_to as string | undefined,
    );
    res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing code or state');
    }

    const result = await this.oauthService.handleCallback(
      AuthProvider.GOOGLE,
      code,
      state,
      req.ip,
      req.headers['user-agent'],
    );

    res.redirect(
      `${process.env.APP_URL}/auth/callback?token=${result.sessionToken}&new=${result.isNewUser}`,
    );
  }

  @Get('github')
  async githubInit(@Req() req: any, @Res() res: any) {
    const { url } = await this.oauthService.createAuthorizationUrl(
      AuthProvider.GITHUB,
      req.query.redirect_to as string | undefined,
    );
    res.redirect(url);
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    if (!code || !state) {
      throw new UnauthorizedException('Missing code or state');
    }

    const result = await this.oauthService.handleCallback(
      AuthProvider.GITHUB,
      code,
      state,
      req.ip,
      req.headers['user-agent'],
    );

    res.redirect(
      `${process.env.APP_URL}/auth/callback?token=${result.sessionToken}&new=${result.isNewUser}`,
    );
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

    res.redirect(`${process.env.APP_URL}/settings/accounts?linked=true`);
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
  async listIdentities(@CurrentUser() user: CurrentUserType) {
    return this.oauthService.listIdentities(user.id);
  }
}
