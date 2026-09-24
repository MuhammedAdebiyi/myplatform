import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { CreateEnvVarDto } from './dto/create-env-var.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { AuthContext } from '../auth/decorators/auth-context.decorator.js';
import type { AuthContext as AuthContextType } from '../auth/decorators/auth-context.decorator.js';
import { Permission } from '../rbac/permissions.js';
import type { CursorPaginationQuery } from '../common/pagination.js';

@UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
@Controller('organizations/:organizationId/projects/:projectId/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermissions(Permission.SERVICE_READ)
  findAll(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Query() query: CursorPaginationQuery,
  ) {
    return this.services.findAllForProject(organizationId, projectId, query.limit, query.cursor);
  }

  @Get(':id')
  @RequirePermissions(Permission.SERVICE_READ)
  findOne(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.services.findOne(organizationId, id);
  }

  @Get(':id/env-vars')
  @RequirePermissions(Permission.SERVICE_READ)
  listEnvVars(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.services.listEnvVars(organizationId, projectId, id);
  }

  @Post(':id/env-vars')
  @RequirePermissions(Permission.SERVICE_UPDATE)
  createEnvVar(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateEnvVarDto,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.services.createEnvVar(
      organizationId,
      projectId,
      id,
      dto,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }

  @Delete(':id/env-vars/:envVarId')
  @RequirePermissions(Permission.SERVICE_UPDATE)
  removeEnvVar(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('envVarId') envVarId: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.services.removeEnvVar(
      organizationId,
      projectId,
      id,
      envVarId,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }

  @Post()
  @RequirePermissions(Permission.SERVICE_CREATE)
  create(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateServiceDto,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.services.create(organizationId, projectId, dto, auth.actorUserId, auth.actorApiKeyId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SERVICE_DELETE)
  remove(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.services.remove(organizationId, id, auth.actorUserId, auth.actorApiKeyId);
  }
}
