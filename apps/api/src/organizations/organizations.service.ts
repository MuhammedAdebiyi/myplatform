import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Organization, Membership, OrgRole, ActorType } from '@myplatform/database';
import { AuditService } from '../audit/audit.service.js';
import { UpdateOrganizationDto } from './dto/organization.dto.js';

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
      action: 'organization.created',
      resourceType: 'Organization',
      resourceId: organization.id,
      metadata: { name: organization.name, slug: organization.slug },
    });

    return organization;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }
    if (!canManageRole(membership.role, OrgRole.VIEWER)) {
      throw new ForbiddenException('Insufficient role to update organization settings');
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { name: dto.name },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId,
      action: 'organization.updated',
      resourceType: 'Organization',
      resourceId: organizationId,
      metadata: { name: organization.name },
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
      where: {
        userId,
        organization: { lifecycle: 'ACTIVE' },
      },
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
      action: 'member.invited',
      resourceType: 'Membership',
      resourceId: membership.id,
      metadata: { inviteeEmail, role },
    });

    return membership;
  }

  async updateMemberRole(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    newRole: OrgRole,
  ): Promise<Membership> {
    const actorMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
    });
    if (!actorMembership) {
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

    // Grant check: actor must outrank the NEW role being granted.
    if (!canManageRole(actorMembership.role, newRole)) {
      throw new ForbiddenException(
        `Cannot assign role ${newRole} with your role ${actorMembership.role}`,
      );
    }

    // Target check: actor must outrank the target's CURRENT role — except an
    // OWNER modifying their own membership (self-demotion is allowed).
    const isSelf = actorUserId === targetUserId;
    if (!isSelf && !canManageRole(actorMembership.role, targetMembership.role)) {
      throw new ForbiddenException(
        `Cannot modify member with role ${targetMembership.role} with your role ${actorMembership.role}`,
      );
    }

    // Last-owner protection: demoting the only OWNER would orphan the org.
    if (
      targetMembership.role === OrgRole.OWNER &&
      newRole !== OrgRole.OWNER
    ) {
      const ownerCount = await prisma.membership.count({
        where: { organizationId, role: OrgRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ConflictException(
          'Cannot demote the only owner — promote another owner first',
        );
      }
    }

    const updated = await prisma.membership.update({
      where: { id: targetMembership.id },
      data: { role: newRole },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId,
      action: 'member.role_changed',
      resourceType: 'Membership',
      resourceId: targetMembership.id,
      metadata: {
        targetUserId,
        previousRole: targetMembership.role,
        newRole,
      },
    });

    return updated;
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

    if (!canManageRole(removerMembership.role, targetMembership.role)) {
      throw new ForbiddenException(
        `Cannot remove member with role ${targetMembership.role} with your role ${removerMembership.role}`,
      );
    }

    // Last-owner protection: removing the only OWNER would orphan the org.
    if (targetMembership.role === OrgRole.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: { organizationId, role: OrgRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ConflictException(
          'Cannot remove the only owner — promote another owner first',
        );
      }
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
      action: 'member.removed',
      resourceType: 'Membership',
      metadata: { targetUserId, role: targetMembership.role },
    });
  }
}

/**
 * Role manageability: an actor can manage targets STRICTLY BELOW their own
 * rank — except the OWNER, who sits at the top of the hierarchy and can
 * manage every role including co-OWNERs (last-owner protection is enforced
 * separately in updateMemberRole/removeMember). Equal rank (e.g.
 * ADMIN→ADMIN) is NOT manageable, matching the principle that you cannot
 * create or control peers.
 */
function canManageRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (actorRole === OrgRole.OWNER) return true;
  const hierarchy: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.DEVELOPER, OrgRole.MEMBER, OrgRole.VIEWER];
  const actorIndex = hierarchy.indexOf(actorRole);
  const targetIndex = hierarchy.indexOf(targetRole);
  return actorIndex < targetIndex;
}
