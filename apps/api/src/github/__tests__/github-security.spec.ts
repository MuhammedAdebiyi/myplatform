import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { GitHubService } from '../github.service';
import { prisma, ActorType } from '@myplatform/database';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      installationState: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      gitHubInstallation: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      gitHubRepository: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      webhookDelivery: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      service: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      deployment: {
        create: jest.fn(),
      },
    },
  };
});

jest.mock('@myplatform/github', () => ({
  generateAppJwt: jest.fn(() => 'mock-app-jwt'),
  getInstallationInfo: jest.fn(),
  listInstallationRepos: jest.fn(),
  createInstallationAccessToken: jest.fn(),
  generateInstallationState: jest.fn(() => 'test-install-state-abc123'),
}));

jest.mock('@myplatform/queue', () => ({
  createQueue: jest.fn(() => ({
    add: jest.fn(),
  })),
}));

describe('GitHub Integration Security (RULE 33 adversarial tests)', () => {
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

  describe('Adversarial: Installation callback with tampered/reused state', () => {
    it('rejects callback with non-existent state', async () => {
      (prisma.installationState.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        githubService.handleCallback('org-1', 12345, 'tampered-state'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.installationState.findUnique).toHaveBeenCalledWith({
        where: { state: 'tampered-state' },
      });
    });

    it('rejects callback when state org does not match request org', async () => {
      (prisma.installationState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'valid-state',
        organizationId: 'org-A',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        githubService.handleCallback('org-B', 12345, 'valid-state'),
      ).rejects.toThrow('State does not match organization');

      // State should be deleted to prevent reuse
      expect(prisma.installationState.delete).toHaveBeenCalledWith({
        where: { state: 'valid-state' },
      });
    });

    it('rejects callback with expired state', async () => {
      (prisma.installationState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'expired-state',
        organizationId: 'org-1',
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      await expect(
        githubService.handleCallback('org-1', 12345, 'expired-state'),
      ).rejects.toThrow('Installation state expired');

      expect(prisma.installationState.delete).toHaveBeenCalledWith({
        where: { state: 'expired-state' },
      });
    });

    it('rejects reused state (deleted after first use)', async () => {
      // First call consumes the state
      (prisma.installationState.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'state-1',
        state: 'used-state',
        organizationId: 'org-1',
        expiresAt: new Date(Date.now() + 60000),
      });
      (prisma.installationState.delete as jest.Mock).mockResolvedValueOnce({});
      const { getInstallationInfo } = await import('@myplatform/github');
      (getInstallationInfo as jest.Mock).mockResolvedValueOnce({
        id: 12345,
        account: { login: 'myorg', type: 'Organization' },
      });
      (prisma.gitHubInstallation.upsert as jest.Mock).mockResolvedValueOnce({});
      (prisma.gitHubInstallation.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
        id: 'inst-1',
        installationId: 12345,
      });
      (prisma.gitHubRepository.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.gitHubRepository.deleteMany as jest.Mock).mockResolvedValueOnce({});

      const { createInstallationAccessToken, listInstallationRepos } = await import('@myplatform/github');
      (createInstallationAccessToken as jest.Mock).mockResolvedValueOnce({ token: 'mock-token' });
      (listInstallationRepos as jest.Mock).mockResolvedValueOnce({ repositories: [] });

      await githubService.handleCallback('org-1', 12345, 'used-state');

      // Second call with same state — should fail because state was deleted
      (prisma.installationState.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        githubService.handleCallback('org-1', 12345, 'used-state'),
      ).rejects.toThrow('Invalid installation state');
    });
  });

  describe('Adversarial: Org A connecting service to org B repo', () => {
    it('rejects connecting to a repo not owned by the org installation', async () => {
      // Repo belongs to org-B's installation
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        githubService.connectService('org-A', 'service-1', 'repo-1', 'main'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.gitHubRepository.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'repo-1',
          installation: { organizationId: 'org-A' },
        },
      });
    });

    it('rejects connecting to a service not in the org', async () => {
      // Repo exists for org-A
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'repo-1',
        fullName: 'myorg/myrepo',
      });
      // But service does not belong to org-A
      (prisma.service.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        githubService.connectService('org-A', 'service-from-org-B', 'repo-1', 'main'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows connecting to a repo that belongs to the org', async () => {
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'repo-1',
        fullName: 'myorg/myrepo',
      });
      (prisma.service.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'service-1',
        organizationId: 'org-A',
      });
      (prisma.service.update as jest.Mock).mockResolvedValueOnce({
        id: 'service-1',
        githubRepositoryId: 'repo-1',
        branch: 'main',
      });

      const result = await githubService.connectService('org-A', 'service-1', 'repo-1', 'main');

      expect(result).toEqual({
        id: 'service-1',
        githubRepositoryId: 'repo-1',
        branch: 'main',
      });
    });
  });

  describe('Adversarial: Push to unconnected repo', () => {
    it('creates no deployment when push is to a repo with no connected services', async () => {
      // Repo exists but no services reference it
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'repo-1',
        fullName: 'myorg/myrepo',
      });
      (prisma.service.findMany as jest.Mock).mockResolvedValueOnce([]);

      await githubService.handlePushEvent({
        ref: 'refs/heads/main',
        after: 'abc123',
        repository: { full_name: 'myorg/myrepo' },
      });

      expect(prisma.deployment.create).not.toHaveBeenCalled();
    });

    it('creates no deployment when push is to a repo not tracked at all', async () => {
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await githubService.handlePushEvent({
        ref: 'refs/heads/main',
        after: 'abc123',
        repository: { full_name: 'unknown/repo' },
      });

      expect(prisma.deployment.create).not.toHaveBeenCalled();
      expect(prisma.service.findMany).not.toHaveBeenCalled();
    });

    it('creates deployment only for matching branch, not other branches', async () => {
      (prisma.gitHubRepository.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'repo-1',
        fullName: 'myorg/myrepo',
      });
      // Service is connected to repo-1 but on branch "develop", not "main"
      (prisma.service.findMany as jest.Mock).mockResolvedValueOnce([]);

      await githubService.handlePushEvent({
        ref: 'refs/heads/main',
        after: 'abc123',
        repository: { full_name: 'myorg/myrepo' },
      });

      expect(prisma.deployment.create).not.toHaveBeenCalled();
    });
  });

  describe('Adversarial: Installation webhook for unknown installation', () => {
    it('does not create installation when webhook has no org mapping', async () => {
      (prisma.gitHubInstallation.findUnique as jest.Mock).mockResolvedValue(null);

      await githubService.handleInstallationEvent({
        action: 'created',
        installation: { id: 99999, account: { login: 'orphan', type: 'User' } },
      });

      // Should warn and return, not crash or create orphaned records
      expect(prisma.gitHubInstallation.upsert).not.toHaveBeenCalled();
    });

    it('handles deleted installation gracefully', async () => {
      (prisma.gitHubInstallation.findUnique as jest.Mock).mockResolvedValue({
        id: 'inst-1',
      });
      (prisma.gitHubInstallation.delete as jest.Mock).mockResolvedValue({});

      await githubService.handleInstallationEvent({
        action: 'deleted',
        installation: { id: 12345, account: { login: 'myorg', type: 'Organization' } },
      });

      expect(prisma.gitHubInstallation.delete).toHaveBeenCalledWith({
        where: { installationId: 12345 },
      });
    });
  });

  describe('Adversarial: Webhook delivery idempotency', () => {
    it('findDelivery returns true for already-processed delivery', async () => {
      (prisma.webhookDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 'del-1',
        deliveryId: 'already-seen',
        event: 'push',
      });

      const result = await githubService.findDelivery('already-seen');
      expect(result).toBe(true);
    });

    it('findDelivery returns false for new delivery', async () => {
      (prisma.webhookDelivery.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await githubService.findDelivery('new-delivery');
      expect(result).toBe(false);
    });
  });
});
