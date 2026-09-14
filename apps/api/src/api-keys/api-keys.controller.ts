import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service.js';
import { ApiKeysThrottlerGuard } from './api-keys-throttler.guard.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { AuthContext } from '../auth/decorators/auth-context.decorator.js';
import type { AuthContext as AuthContextType } from '../auth/decorators/auth-context.decorator.js';
import { Permission } from '../rbac/permissions.js';

@UseGuards(SessionGuard, ApiKeyGuard, OrganizationGuard, ApiKeysThrottlerGuard)
@Controller('organizations/:organizationId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @RequirePermissions(Permission.API_KEY_CREATE)
  create(
    @GetOrganizationId() organizationId: string,
    @AuthContext() auth: AuthContextType,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(organizationId, auth.actorUserId ?? '', dto);
  }

  @Post(':id/rotate')
  @RequirePermissions(Permission.API_KEY_CREATE)
  rotate(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.apiKeys.rotate(organizationId, id, auth.actorUserId);
  }

  @Get()
  @RequirePermissions(Permission.API_KEY_LIST)
  list(@GetOrganizationId() organizationId: string) {
    return this.apiKeys.list(organizationId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.API_KEY_REVOKE)
  revoke(
    @GetOrganizationId() organizationId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.apiKeys.revoke(organizationId, id, auth.actorUserId);
  }
}
