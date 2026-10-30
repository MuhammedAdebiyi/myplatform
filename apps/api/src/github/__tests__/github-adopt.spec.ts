import { UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { GitHubService } from '../github.service';
import { prisma, ActorType } from '@myplatform/database';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      accountIdentity: { findFirst: jest.fn() },
      membership: { findUnique: jest.fn() },
      installationState: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      gitHubInstallation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      gitHubRepository: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
      },
      webhookDelivery: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
      service: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      deployment: { create: jest.fn() },
    },
  };
});

jest.mock('@myplatform/github', () => ({
  generateAppJwt: jest.fn(() => 'mock-app-jwt'),
  getInstallationInfo: jest.fn(),
  listInstallationRepos: jest.fn(),
  listAppInstallations: jest.fn(),
  createInstallationAccessToken: jest.fn(),
  generateInstallationState: jest.fn(() => 'test-state'),
  listBranches: jest.fn(),
}));

jest.mock('@myplatform/queue', () => ({
  createQueue: jest.fn(() => ({ add: jest.fn() })),
}));

describe('GitHub connect-existing (adopt flow)', () => {
  let githubService: GitHubService;
  let mockAudit: { log: jest.Mock };

  const originalEnv = process.env;

  beforeEach(() => {
    mockAudit = { log: jest.fn() };
    githubService = new GitHubService(mockAudit as any);
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from('test-key').toString('base64');
    process.env.GITHUB_APP_SLUG = 'myplatform-deploy';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('listInstallationCandidates', () => {
    it('returns [] when the caller has no GitHub identity', async () => {
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await githubService.listInstallationCandidates('org-1', 'user-1');
      expect(result).toEqual([]);
    });

    it('returns only non-suspended installs owned by the caller GitHub identity', async () => {
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { listAppInstallations } = await import('@myplatform/github');
      (listAppInstallations as jest.Mock).mockResolvedValue([
        { id: 111, account: { id: 140236418, login: 'me', type: 'User' }, suspended_at: null },
        { id: 222, account: { id: 999999, login: 'someone-else', type: 'User' }, suspended_at: null },
        { id: 333, account: { id: 140236418, login: 'me', type: 'User' }, suspended_at: '2026-01-01T00:00:00Z' },
      ]);
      (prisma.gitHubInstallation.findMany as jest.Mock).mockResolvedValue([]);

      const result = await githubService.listInstallationCandidates('org-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        installationId: 111,
        accountLogin: 'me',
        accountType: 'User',
        linkedOrganizationId: null,
        linkedOrganizationName: null,
      });
    });

    it('reports which organization an install is already linked to', async () => {
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { listAppInstallations } = await import('@myplatform/github');
      (listAppInstallations as jest.Mock).mockResolvedValue([
        { id: 111, account: { id: 140236418, login: 'me', type: 'User' }, suspended_at: null },
      ]);
      (prisma.gitHubInstallation.findMany as jest.Mock).mockResolvedValue([
        { installationId: 111, organization: { id: 'org-old', name: 'Old Org' } },
      ]);

      const result = await githubService.listInstallationCandidates('org-new', 'user-1');

      expect(result[0].linkedOrganizationId).toBe('org-old');
      expect(result[0].linkedOrganizationName).toBe('Old Org');
    });
  });

  describe('adoptInstallation', () => {
    it('rejects callers who are not members of the org', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        githubService.adoptInstallation('org-1', 'user-1', 111),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects callers without a linked GitHub identity', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        githubService.adoptInstallation('org-1', 'user-1', 111),
      ).rejects.toThrow('No GitHub account is linked');
    });

    it('rejects installations owned by a different GitHub account', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { getInstallationInfo } = await import('@myplatform/github');
      (getInstallationInfo as jest.Mock).mockResolvedValue({
        id: 111,
        account: { id: 424242, login: 'stranger', type: 'User' },
        suspended_at: null,
      });

      await expect(
        githubService.adoptInstallation('org-1', 'user-1', 111),
      ).rejects.toThrow('different GitHub account');
      expect(prisma.gitHubInstallation.upsert).not.toHaveBeenCalled();
    });

    it('rejects suspended installations', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { getInstallationInfo } = await import('@myplatform/github');
      (getInstallationInfo as jest.Mock).mockResolvedValue({
        id: 111,
        account: { id: 140236418, login: 'me', type: 'User' },
        suspended_at: '2026-01-01T00:00:00Z',
      });

      await expect(
        githubService.adoptInstallation('org-1', 'user-1', 111),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.gitHubInstallation.upsert).not.toHaveBeenCalled();
    });

    it('404s when the installation does not exist on GitHub', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { getInstallationInfo } = await import('@myplatform/github');
      (getInstallationInfo as jest.Mock).mockRejectedValue(new Error('404'));

      await expect(
        githubService.adoptInstallation('org-1', 'user-1', 111),
      ).rejects.toThrow(NotFoundException);
    });

    it('links the install with the composite key, syncs repos, and audits', async () => {
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      (prisma.accountIdentity.findFirst as jest.Mock).mockResolvedValue({
        providerAccountId: '140236418',
      });
      const { getInstallationInfo, createInstallationAccessToken, listInstallationRepos } =
        await import('@myplatform/github');
      (getInstallationInfo as jest.Mock).mockResolvedValue({
        id: 111,
        account: { id: 140236418, login: 'me', type: 'User' },
        suspended_at: null,
      });
      (prisma.gitHubInstallation.upsert as jest.Mock).mockResolvedValue({});
      (createInstallationAccessToken as jest.Mock).mockResolvedValue({ token: 'tok' });
      (listInstallationRepos as jest.Mock).mockResolvedValue({ repositories: [] });
      (prisma.gitHubInstallation.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'inst-row-1',
        installationId: 111,
      });
      (prisma.gitHubRepository.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gitHubRepository.deleteMany as jest.Mock).mockResolvedValue({});

      const result = await githubService.adoptInstallation('org-1', 'user-1', 111);

      expect(result).toEqual({ organizationId: 'org-1', accountLogin: 'me' });
      expect(prisma.gitHubInstallation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_installationId: { organizationId: 'org-1', installationId: 111 } },
          create: expect.objectContaining({ accountLogin: 'me', accountType: 'User' }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'github.installation.adopt',
          organizationId: 'org-1',
          actorUserId: 'user-1',
          metadata: expect.objectContaining({ installationId: 111, via: 'existing-installation' }),
        }),
      );
      expect(mockAudit.log.mock.calls[0][0].actorType).toBe(ActorType.USER);
    });
  });
});
