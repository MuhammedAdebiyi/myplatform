import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import { CreateDomainDto } from './dto/deployment.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { AuthContext } from '../auth/decorators/auth-context.decorator.js';
import type { AuthContext as AuthContextType } from '../auth/decorators/auth-context.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import { Permission } from '../rbac/permissions.js';

@Injectable()
export class DomainsService {
  constructor(private readonly audit: AuditService) {}

  list(organizationId: string, projectId: string, serviceId: string) {
    // Tenant-scoped via the service's organizationId (RULE 03/34).
    return prisma.domain.findMany({
      where: { service: { id: serviceId, projectId, organizationId } },
      select: { id: true, hostname: true, isCustom: true, serviceId: true },
      orderBy: { hostname: 'asc' },
    });
  }

  async create(
    organizationId: string,
    projectId: string,
    serviceId: string,
    dto: CreateDomainDto,
    actorUserId?: string,
    actorApiKeyId?: string,
  ) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, projectId, organizationId, lifecycle: 'ACTIVE' },
      select: { id: true },
    });
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);

    const existing = await prisma.domain.findUnique({
      where: { hostname: dto.hostname },
      select: { id: true },
    });
    if (existing) {
      // Hostname is globally unique — do NOT reveal whether it's another tenant's.
      throw new ConflictException('Hostname already in use');
    }

    const domain = await prisma.domain.create({
      data: { serviceId: service.id, hostname: dto.hostname, isCustom: true },
      select: { id: true, hostname: true, isCustom: true, serviceId: true },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'domain.created',
      resourceType: 'Domain',
      resourceId: domain.id,
      metadata: { serviceId: service.id, hostname: domain.hostname },
    });

    return domain;
  }

  async remove(
    organizationId: string,
    projectId: string,
    serviceId: string,
    domainId: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ) {
    const domain = await prisma.domain.findFirst({
      where: { id: domainId, service: { id: serviceId, projectId, organizationId } },
    });
    if (!domain) throw new NotFoundException(`Domain ${domainId} not found`);

    await prisma.domain.delete({ where: { id: domain.id } });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'domain.deleted',
      resourceType: 'Domain',
      resourceId: domain.id,
      metadata: { serviceId, hostname: domain.hostname },
    });

    return { deleted: true, id: domain.id };
  }
}

// Guard chain (RULE 32 trace): Session → EmailVerified → ApiKey → Organization.
// No token → 401 (SessionGuard). mp_ token → ApiKeyGuard + OrganizationGuard
// check DOMAIN_READ/DOMAIN_MANAGE against key permissions. Session token →
// role matrix check. Cross-tenant resource → 404 from service lookup.
@UseGuards(SessionGuard, EmailVerifiedGuard, ApiKeyGuard, OrganizationGuard)
@Controller('organizations/:organizationId/projects/:projectId/services/:serviceId/domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @RequirePermissions(Permission.DOMAIN_READ)
  list(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.domains.list(organizationId, projectId, serviceId);
  }

  @Post()
  @RequirePermissions(Permission.DOMAIN_MANAGE)
  create(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateDomainDto,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.domains.create(
      organizationId,
      projectId,
      serviceId,
      dto,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }

  @Delete(':id')
  @RequirePermissions(Permission.DOMAIN_MANAGE)
  remove(
    @GetOrganizationId() organizationId: string,
    @Param('projectId') projectId: string,
    @Param('serviceId') serviceId: string,
    @Param('id') id: string,
    @AuthContext() auth: AuthContextType,
  ) {
    return this.domains.remove(
      organizationId,
      projectId,
      serviceId,
      id,
      auth.actorUserId,
      auth.actorApiKeyId,
    );
  }
}
