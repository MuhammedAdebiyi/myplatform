import { ConflictException, NotFoundException } from '@nestjs/common';
import { prisma } from '@myplatform/database';
import { DeploymentsService } from '../deployments.service.js';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      service: { findFirst: jest.fn() },
      deployment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      idempotencyKey: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      outboxEvent: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    },
  };
});

describe('DeploymentsService adversarial tests (RULE 33)', () => {
  let svc: DeploymentsService;
  let mockAudit: { log: jest.Mock };

  const activeService = {
    id: 'svc-1',
    name: 'api',
    organizationId: 'org-1',
    projectId: 'proj-1',
    branch: 'main',
    githubRepository: { id: 'repo-1', fullName: 'acme/api', defaultBranch: 'main' },
  };

  beforeEach(() => {
    mockAudit = { log: jest.fn() };
    svc = new DeploymentsService(mockAudit as any);
    jest.resetAllMocks();
  });

  describe('tenant isolation (RULES 03/04/34)', () => {
    it('404 when the service does not belong to the org — never 403', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        svc.create('org-A', 'proj-1', 'svc-from-org-B', {}, 'user-1', undefined),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.service.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-A' }),
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('list is pinned to the org via the service relation', () => {
      (prisma.deployment.findMany as jest.Mock).mockResolvedValue([]);
      svc.listForService('org-1', 'proj-1', 'svc-1', 20);
      expect(prisma.deployment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            service: { id: 'svc-1', projectId: 'proj-1', organizationId: 'org-1' },
          },
          take: 21,
        }),
      );
    });
  });

  describe('create with outbox + idempotency (RULES 21/23)', () => {
    it('writes deployment + outbox event in one transaction', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          deployment: { create: jest.fn().mockResolvedValue({ id: 'dep-1', status: 'PENDING', commitSha: null, createdAt: new Date() }) },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        const result = await fn(tx);
        return result;
      });

      const { deployment } = await svc.create('org-1', 'proj-1', 'svc-1', {}, 'user-1', undefined);

      expect(deployment).toEqual(
        expect.objectContaining({ id: 'dep-1', status: 'PENDING' }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deployment.created' }),
      );
    });

    it('replays the recorded response for a COMPLETED idempotency key', async () => {
      const recorded = { id: 'dep-0', status: 'PENDING', commitSha: null, createdAt: new Date() };
      (prisma.idempotencyKey.create as jest.Mock).mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
        status: 'COMPLETED',
        responseBody: recorded,
      });

      const result = await svc.create('org-1', 'proj-1', 'svc-1', {}, 'user-1', undefined, {
        organizationId: 'org-1',
        key: 'key-1',
        endpoint: 'deployments.create',
      });

      expect(result.idempotentReplay).toBe(true);
      expect(result.deployment).toEqual(recorded);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a reused key whose first attempt never completed', async () => {
      (prisma.idempotencyKey.create as jest.Mock).mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({ status: 'PENDING' });

      await expect(
        svc.create('org-1', 'proj-1', 'svc-1', {}, 'user-1', undefined, {
          organizationId: 'org-1',
          key: 'key-2',
          endpoint: 'deployments.create',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('marks the key COMPLETED after a successful create', async () => {
      // mockRejectedValue from the previous test persists through
      // clearAllMocks — reset to a winning insert for this test.
      (prisma.idempotencyKey.create as jest.Mock).mockReset();
      (prisma.idempotencyKey.create as jest.Mock).mockResolvedValue({});
      (prisma.idempotencyKey.findUnique as jest.Mock).mockReset();
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
        fn({
          deployment: { create: jest.fn().mockResolvedValue({ id: 'dep-2', status: 'PENDING', commitSha: null, createdAt: new Date() }) },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await svc.create('org-1', 'proj-1', 'svc-1', {}, 'user-1', undefined, {
        organizationId: 'org-1',
        key: 'key-3',
        endpoint: 'deployments.create',
      });

      expect(prisma.idempotencyKey.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ key: 'key-3', status: 'PENDING' }),
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  describe('cancel — RULE 24 state machine', () => {
    it('allows cancelling a PENDING deployment', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.deployment.findFirst as jest.Mock).mockResolvedValue({ id: 'dep-1', status: 'PENDING' });
      (prisma.deployment.update as jest.Mock).mockResolvedValue({ id: 'dep-1', status: 'CANCELLED' });

      const result = await svc.cancel('org-1', 'proj-1', 'svc-1', 'dep-1', 'user-1');
      expect(result.status).toBe('CANCELLED');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deployment.cancelled' }),
      );
    });

    it('refuses to cancel a HEALTHY deployment', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.deployment.findFirst as jest.Mock).mockResolvedValue({ id: 'dep-2', status: 'HEALTHY' });

      await expect(
        svc.cancel('org-1', 'proj-1', 'svc-1', 'dep-2', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('404 for a deployment in another org', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.deployment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        svc.cancel('org-1', 'proj-1', 'svc-1', 'dep-of-org-B', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rollback', () => {
    it('404 when the target deployment is not HEALTHY or not in this org', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.deployment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        svc.rollback('org-1', 'proj-1', 'svc-1', 'dep-x', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a NEW deployment referencing the target (never mutates history)', async () => {
      (prisma.service.findFirst as jest.Mock).mockResolvedValue(activeService);
      (prisma.deployment.findFirst as jest.Mock).mockResolvedValue({
        id: 'dep-good',
        imageDigest: 'sha256:abc',
        commitSha: '1234567',
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
        fn({
          deployment: {
            create: jest.fn().mockResolvedValue({ id: 'dep-new', status: 'PENDING' }),
          },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await svc.rollback('org-1', 'proj-1', 'svc-1', 'dep-good', 'user-1');

      expect(result).toEqual(
        expect.objectContaining({ id: 'dep-new', rollbackTo: 'dep-good' }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deployment.rollback' }),
      );
    });
  });
});
