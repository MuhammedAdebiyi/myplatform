import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prisma, OrgRole } from '@myplatform/database';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { hasPermission, Permission } from '../permissions.js';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const organizationId = extractOrganizationId(request);
    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    if (request.apiKeyContext) {
      if (request.apiKeyContext.organizationId !== organizationId) {
        throw new ForbiddenException('API key does not belong to this organization');
      }

      request.organizationId = organizationId;
      request.authenticationMethod = 'API_KEY';

      if (!requiredPermissions || requiredPermissions.length === 0) {
        return true;
      }

      const hasAll = requiredPermissions.every((perm) =>
        request.apiKeyContext.permissions.includes(perm),
      );

      if (!hasAll) {
        throw new ForbiddenException(
          `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
        );
      }

      return true;
    }

    const user = request.user;
    if (!user) return false;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    request.organizationId = organizationId;
    request.orgRole = membership.role;
    request.authenticationMethod = 'SESSION';

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const hasAll = requiredPermissions.every((perm) =>
      hasPermission(membership.role, perm),
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}

function extractOrganizationId(request: any): string | null {
  if (request.params?.organizationId) {
    return request.params.organizationId;
  }

  const orgHeader = request.headers?.['x-organization-id'];
  if (typeof orgHeader === 'string') {
    return orgHeader;
  }

  return null;
}
