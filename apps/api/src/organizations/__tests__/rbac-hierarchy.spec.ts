import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { prisma, OrgRole } from '@myplatform/database';
import { OrganizationsService } from '../organizations.service.js';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      membership: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    },
  };
});

function chain(mocks: any[], ...returns: any[]) {
  returns.forEach((r, i) => mocks[i].mockResolvedValueOnce(r));
}

describe('Organization RBAC adversarial tests (RULE 33)', () => {
  let svc: OrganizationsService;
  let mockAudit: { log: jest.Mock };

  beforeEach(() => {
    mockAudit = { log: jest.fn() };
    svc = new OrganizationsService(mockAudit as any);
    jest.clearAllMocks();
  });

  describe('updateMemberRole', () => {
    const orgId = 'org-1';

    it('ADMIN can promote a MEMBER to DEVELOPER', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.ADMIN }, // actor
        { role: OrgRole.MEMBER }, // target
      );
      (prisma.membership.update as jest.Mock).mockResolvedValue({
        id: 'm-1', role: OrgRole.DEVELOPER,
      });

      const result = await svc.updateMemberRole(orgId, 'admin-1', 'member-1', OrgRole.DEVELOPER);
      expect(result.role).toBe(OrgRole.DEVELOPER);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member.role_changed' }),
      );
    });

    it('ADMIN cannot promote a MEMBER to ADMIN (equal to own rank)', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.ADMIN },
        { role: OrgRole.MEMBER },
      );

      await expect(
        svc.updateMemberRole(orgId, 'admin-1', 'member-1', OrgRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it('DEVELOPER cannot modify another DEVELOPER (equal rank)', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.DEVELOPER },
        { role: OrgRole.DEVELOPER },
      );

      await expect(
        svc.updateMemberRole(orgId, 'dev-1', 'dev-2', OrgRole.MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('last OWNER cannot be demoted (last-owner protection)', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.OWNER }, // actor is the owner
        { role: OrgRole.OWNER }, // target is themself
      );
      (prisma.membership.count as jest.Mock).mockResolvedValue(1);

      await expect(
        svc.updateMemberRole(orgId, 'owner-1', 'owner-1', OrgRole.ADMIN),
      ).rejects.toThrow(ConflictException);
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it('OWNER can demote themself when another OWNER exists', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.OWNER },
        { role: OrgRole.OWNER },
      );
      (prisma.membership.count as jest.Mock).mockResolvedValue(2);
      (prisma.membership.update as jest.Mock).mockResolvedValue({ id: 'm-1', role: OrgRole.ADMIN });

      await svc.updateMemberRole(orgId, 'owner-1', 'owner-1', OrgRole.ADMIN);
      expect(prisma.membership.update).toHaveBeenCalled();
    });

    it('throws 404 for a target that is not a member', async () => {
      chain([prisma.membership.findUnique, prisma.membership.findUnique], { role: OrgRole.ADMIN }, null);

      await expect(
        svc.updateMemberRole(orgId, 'admin-1', 'stranger', OrgRole.MEMBER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember last-owner protection', () => {
    const orgId = 'org-1';

    it('the only OWNER cannot be removed, even by themself', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.OWNER },
        { role: OrgRole.OWNER },
      );
      (prisma.membership.count as jest.Mock).mockResolvedValue(1);

      await expect(
        svc.removeMember(orgId, 'owner-1', 'owner-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.membership.delete).not.toHaveBeenCalled();
    });

    it('OWNER can be removed when a second OWNER exists', async () => {
      chain(
        [prisma.membership.findUnique, prisma.membership.findUnique],
        { role: OrgRole.OWNER },
        { role: OrgRole.OWNER },
      );
      (prisma.membership.count as jest.Mock).mockResolvedValue(2);
      (prisma.membership.delete as jest.Mock).mockResolvedValue({});

      await svc.removeMember(orgId, 'owner-2', 'owner-1');
      expect(prisma.membership.delete).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member.removed' }),
      );
    });
  });

  describe('update (org settings)', () => {
    it('non-members get 403, not the org', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        svc.update('org-1', 'outsider', { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('OWNER can rename and the change is audited', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ role: OrgRole.OWNER });
      (prisma.organization.update as jest.Mock).mockResolvedValue({ id: 'org-1', name: 'New Name' });

      await svc.update('org-1', 'owner-1', { name: 'New Name' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization.updated' }),
      );
    });
  });
});
