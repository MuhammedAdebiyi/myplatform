import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { prisma } from '@myplatform/database';
import type { Prisma } from '@myplatform/database';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { ApiKeyGuard } from '../auth/guards/api-key.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { OrganizationGuard } from '../rbac/guards/organization.guard.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { GetOrganizationId } from '../rbac/decorators/get-organization-id.decorator.js';
import { Permission } from '../rbac/permissions.js';
import { paginateQuery, parseLimit, type CursorPaginationQuery } from '../common/pagination.js';

// Guard chain (RULE 32 trace): Session → EmailVerified → ApiKey → Organization.
// Session users need AUDIT_READ from their role (OWNER/ADMIN only). API keys
// can hold audit:read explicitly. Cross-org access is impossible: the where
// clause is pinned to the guard-resolved organizationId (RULE 04).
@UseGuards(SessionGuard, EmailVerifiedGuard, ApiKeyGuard, OrganizationGuard)
@Controller('organizations/:organizationId/audit-logs')
export class AuditController {
  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  async list(
    @GetOrganizationId() organizationId: string,
    @Query() query: CursorPaginationQuery & { action?: string; resourceType?: string; resourceId?: string },
  ) {
    // Append-only by design: there is deliberately no POST/PATCH/DELETE here
    // (scope §16). Filter params are strictly optional equality filters.
    const result: {
      items: Array<Prisma.AuditLogGetPayload<{ select: {
        id: true; actorType: true; actorUserId: true; actorApiKeyId: true;
        actorSystemId: true; action: true; resourceType: true; resourceId: true;
        metadata: true; ipAddress: true; userAgent: true; createdAt: true;
      } }>>;
      nextCursor: string | null;
    } = await paginateQuery(
      (args) =>
        prisma.auditLog.findMany({
          ...args,
          select: {
            id: true,
            actorType: true,
            actorUserId: true,
            actorApiKeyId: true,
            actorSystemId: true,
            action: true,
            resourceType: true,
            resourceId: true,
            metadata: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
          },
        }),
      {
        organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      },
      parseLimit(query.limit),
      query.cursor,
      { id: 'desc' },
    );
    return result;
  }
}
