import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service.js';
import { CreateDeploymentDto } from './dto/deployment.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { AuthContext } from '../auth/decorators/auth-context.decorator.js';
import type { AuthContext as AuthContextType } from '../auth/decorators/auth-context.decorator.js';
import { Permission } from '../rbac/permissions.js';
import type { CursorPaginationQuery } from '../common/pagination.js';

// Guard order matters (RULE 32): Session → EmailVerified → ApiKey → Organization.
@UseGuards(SessionGuard, EmailVerifiedGuard, ApiKeyGuard, OrganizationGuard)
@Controller('organizations/:organizationId/projects/:projectId/services/:serviceId/deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get()
  @RequirePermissions(Permission.DEPLOYMENT_READ)
  list(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Query() query: CursorPaginationQuery,
  ) {
    return this.deployments.listForService(
      organizationId,
      projectId,
      serviceId,
      query.limit,
      query.cursor,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.DEPLOYMENT_READ)
  findOne(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Param('id') id: string,
  ) {
    return this.deployments.findOne(organizationId, projectId, serviceId, id);
  }

  @Post()
  @RequirePermissions(Permission.DEPLOYMENT_CREATE)
  async create(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateDeploymentDto,
    @AuthContext() auth: AuthContextType,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { deployment, idempotentReplay } = await this.deployments.create(
      organizationId,
      projectId,
      serviceId,
      dto,
      auth.actorUserId,
      auth.actorApiKeyId,
      idempotencyKey
        ? { organizationId, key: idempotencyKey, endpoint: 'deployments.create' }
        : undefined,
    );
    return deployment ?? { idempotentReplay };
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.DEPLOYMENT_CANCEL)
  cancel(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.deployments.cancel(
      organizationId,
      projectId,
      serviceId,
      id,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }

  @Post(':id/rollback')
  @RequirePermissions(Permission.DEPLOYMENT_ROLLBACK)
  rollback(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.deployments.rollback(
      organizationId,
      projectId,
      serviceId,
      id,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }
}
