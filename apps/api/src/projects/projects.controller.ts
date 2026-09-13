import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { AuthContext } from '../auth/decorators/auth-context.decorator.js';
import type { AuthContext as AuthContextType } from '../auth/decorators/auth-context.decorator.js';
import { Permission } from '../rbac/permissions.js';

@UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard)
@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions(Permission.PROJECT_READ)
  findAll(@GetOrganizationId() organizationId: string) {
    return this.projects.findAll(organizationId);
  }

  @Get(':id')
  @RequirePermissions(Permission.PROJECT_READ)
  findOne(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.projects.findOne(organizationId, id);
  }

  @Post()
  @RequirePermissions(Permission.PROJECT_CREATE)
  create(
    @GetOrganizationId() organizationId: string,
    @Body() dto: CreateProjectDto,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.projects.create(organizationId, dto, auth.actorUserId, auth.actorApiKeyId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.PROJECT_DELETE)
  remove(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.projects.remove(organizationId, id, auth.actorUserId, auth.actorApiKeyId);
  }
}
