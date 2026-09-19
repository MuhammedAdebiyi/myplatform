import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  Res,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { GitHubService } from './github.service.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { Permission } from '../rbac/permissions.js';
import { WebhookGuard } from './guards/webhook.guard.js';
import { ConnectServiceDto } from './dto/connect-service.dto.js';

@Controller()
export class GitHubController {
  constructor(private readonly githubService: GitHubService) {}

  @UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
  @RequirePermissions(Permission.SERVICE_UPDATE)
  @Get('organizations/:organizationId/github/install')
  async install(
    @GetOrganizationId() organizationId: string,
    @Res() res: any,
  ) {
    const { url } = await this.githubService.createInstallUrl(organizationId);
    res.redirect(url);
  }

  @UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
  @RequirePermissions(Permission.SERVICE_UPDATE)
  @Get('organizations/:organizationId/github/callback')
  async callback(
    @GetOrganizationId() organizationId: string,
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    if (!installationId || !state) {
      return res.redirect(`${process.env.APP_URL}/settings/github?error=missing_params`);
    }

    if (setupAction !== 'install') {
      return res.redirect(`${process.env.APP_URL}/settings/github?error=unexpected_setup_action`);
    }

    try {
      await this.githubService.handleCallback(
        organizationId,
        parseInt(installationId, 10),
        state,
      );
      res.redirect(`${process.env.APP_URL}/settings/github?success=true`);
    } catch {
      res.redirect(`${process.env.APP_URL}/settings/github?error=installation_failed`);
    }
  }

  @Post('webhooks/github')
  @UseGuards(WebhookGuard)
  @HttpCode(200)
  async webhook(@Req() req: any) {
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;
    const payload = req.body;

    const existingDelivery = await this.githubService.findDelivery(deliveryId);
    if (existingDelivery) {
      return { ok: true, duplicated: true };
    }

    await this.githubService.recordDelivery(deliveryId, event);

    switch (event) {
      case 'installation':
        await this.githubService.handleInstallationEvent(payload);
        break;
      case 'installation_repositories':
        await this.githubService.handleInstallationReposEvent(payload);
        break;
      case 'push':
        await this.githubService.handlePushEvent(payload);
        break;
      default:
        break;
    }

    return { ok: true };
  }

  @UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
  @RequirePermissions(Permission.SERVICE_READ)
  @Get('organizations/:organizationId/github/repositories')
  async listRepositories(
    @GetOrganizationId() organizationId: string,
  ) {
    return this.githubService.listRepositories(organizationId);
  }

  @UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
  @RequirePermissions(Permission.SERVICE_UPDATE)
  @Patch('organizations/:organizationId/github/services/:id/connect')
  async connectService(
    @GetOrganizationId() organizationId: string,
    @Param('id') serviceId: string,
    @Body() dto: ConnectServiceDto,
  ) {
    return this.githubService.connectService(
      organizationId,
      serviceId,
      dto.githubRepositoryId,
      dto.branch,
    );
  }
}
