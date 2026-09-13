import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Organization, Membership, OrgRole, ActorType } from '@myplatform/database';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly audit: AuditService) {}

  async create(
    dto: { name: string; slug: string },
    creatorUserId: string,
  ): Promise<Organization> {
    const existing = await prisma.organization.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Organization slug already taken');
    }

    const [organization] = await prisma.$transaction([
      prisma.organization.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          createdBy: creatorUserId,
          memberships: {
            create: {
              userId: creatorUserId,
              role: OrgRole.OWNER,
            },
          },
        },
      }),
    ]);

    this.audit.log({
      organizationId: organization.id,
      actorType: ActorType.USER,
      actorUserId: creatorUserId,
      action: 'organization.create',
      resourceType: 'Organization',
      resourceId: organization.id,
      metadata: { name: organization.name, slug: organization.slug },
    });

    return organization;
  }

  async findOneBySlug(slug: string): Promise<Organization> {
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) throw new NotFoundException(`Organization ${slug} not found`);
    return org;
  }

  async findManyForUser(userId: string): Promise<(Organization & { role: OrgRole })[]> {
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    }));
  }

  async addMember(
    organizationId: string,
    inviterUserId: string,
    inviteeEmail: string,
    role: OrgRole,
  ): Promise<Membership> {
    const inviterMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: inviterUserId,
          organizationId,
        },
      },
    });

    if (!inviterMembership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (!canManageRole(inviterMembership.role, role)) {
      throw new ForbiddenException(
        `Cannot assign role ${role} with your role ${inviterMembership.role}`,
      );
    }

    const invitee = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      select: { id: true },
    });
    if (!invitee) {
      throw new NotFoundException(`User with email ${inviteeEmail} not found`);
    }

    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitee.id,
          organizationId,
        },
      },
    });
    if (existingMembership) {
      throw new ConflictException('User is already a member of this organization');
    }

    const membership = await prisma.membership.create({
      data: {
        userId: invitee.id,
        organizationId,
        role,
      },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId: inviterUserId,
      action: 'organization.member.add',
      resourceType: 'Membership',
      resourceId: membership.id,
      metadata: { inviteeEmail, role },
    });

    return membership;
  }

  async removeMember(
    organizationId: string,
    removerUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const removerMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: removerUserId,
          organizationId,
        },
      },
    });

    if (!removerMembership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });
    if (!targetMembership) {
      throw new NotFoundException('User is not a member of this organization');
    }

    if (targetMembership.role === OrgRole.OWNER) {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    if (!canManageRole(removerMembership.role, targetMembership.role)) {
      throw new ForbiddenException(
        `Cannot remove member with role ${targetMembership.role} with your role ${removerMembership.role}`,
      );
    }

    await prisma.membership.delete({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId: removerUserId,
      action: 'organization.member.remove',
      resourceType: 'Membership',
      metadata: { targetUserId, role: targetMembership.role },
    });
  }
}

function canManageRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  const hierarchy: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.DEVELOPER, OrgRole.MEMBER, OrgRole.VIEWER];
  const actorIndex = hierarchy.indexOf(actorRole);
  const targetIndex = hierarchy.indexOf(targetRole);
  return actorIndex < targetIndex;
}
