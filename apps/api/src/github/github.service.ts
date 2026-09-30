import { Injectable, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import {
  generateAppJwt,
  getInstallationInfo,
  listInstallationRepos,
  createInstallationAccessToken,
  type GitHubAppConfig,
} from '@myplatform/github';
import { AuditService } from '../audit/audit.service.js';
import { createQueue } from '@myplatform/queue';

// ─── Webhook payload shapes (subset of fields we actually read) ───

interface WebhookInstallation {
  id: number;
  account: { login: string; type: string };
}

interface InstallationEventPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: WebhookInstallation;
}

interface InstallationReposEventPayload {
  installation: WebhookInstallation;
}

interface PushEventPayload {
  ref: string;
  after: string;
  repository: { full_name: string };
}

function getGitHubAppConfig(): GitHubAppConfig {
  const appId = parseInt(process.env.GITHUB_APP_ID!, 10);
  const privateKey = Buffer.from(
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64!,
    'base64',
  ).toString('utf8');
  return { appId, privateKey };
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private buildQueue = createQueue<{ deploymentId: string; serviceId: string }>('build');

  constructor(private readonly audit: AuditService) {}

  async createInstallUrl(organizationId: string): Promise<{ url: string; state: string }> {
    const { generateInstallationState } = await import('@myplatform/github');
    const state = generateInstallationState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.installationState.create({
      data: { state, organizationId, expiresAt },
    });

    const params = new URLSearchParams({ state });
    const url = `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new?${params.toString()}`;

    return { url, state };
  }

  async handleCallback(
    organizationId: string,
    installationId: number,
    state: string,
  ): Promise<void> {
    const installationState = await prisma.installationState.findUnique({
      where: { state },
    });

    if (!installationState) {
      throw new UnauthorizedException('Invalid installation state');
    }

    if (installationState.organizationId !== organizationId) {
      await prisma.installationState.delete({ where: { state } });
      throw new UnauthorizedException('State does not match organization');
    }

    if (installationState.expiresAt < new Date()) {
      await prisma.installationState.delete({ where: { state } });
      throw new UnauthorizedException('Installation state expired');
    }

    await prisma.installationState.delete({ where: { state } });

    const config = getGitHubAppConfig();
    const appJwt = generateAppJwt(config);

    let installationInfo;
    try {
      installationInfo = await getInstallationInfo(appJwt, installationId);
    } catch (err) {
      this.logger.error({ err, installationId }, 'Failed to fetch installation info from GitHub');
      throw new UnauthorizedException('Failed to verify installation with GitHub');
    }

    await prisma.gitHubInstallation.upsert({
      where: { installationId },
      create: {
        organizationId,
        installationId,
        accountLogin: installationInfo.account.login,
        accountType: installationInfo.account.type,
      },
      update: {
        organizationId,
        accountLogin: installationInfo.account.login,
        accountType: installationInfo.account.type,
        suspendedAt: null,
      },
    });

    await this.syncRepos(installationId);

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      action: 'github.installation.create',
      resourceType: 'GitHubInstallation',
      resourceId: undefined,
      metadata: { installationId, accountLogin: installationInfo.account.login },
    });
  }

  async syncRepos(installationId: number): Promise<void> {
    const config = getGitHubAppConfig();
    const appJwt = generateAppJwt(config);
    const token = await createInstallationAccessToken(appJwt, installationId);

    const repos = await listInstallationRepos(token.token);

    const installation = await prisma.gitHubInstallation.findUniqueOrThrow({
      where: { installationId },
    });

    const githubRepoIds = repos.repositories.map((r) => BigInt(r.id));

    await prisma.gitHubRepository.deleteMany({
      where: {
        installationId: installation.id,
        githubRepoId: { notIn: githubRepoIds },
      },
    });

    if (repos.repositories.length === 0) return;

    // Batched upsert (RULE 12 write-side): one transaction instead of N
    // sequential round trips. createMany can't upsert in Prisma, so group by
    // existence and issue one createMany + one batched update via transaction.
    const existingIds = await prisma.gitHubRepository.findMany({
      where: { installationId: installation.id, githubRepoId: { in: githubRepoIds } },
      select: { githubRepoId: true },
    });
    const existingSet = new Set(existingIds.map((r) => r.githubRepoId.toString()));

    const toCreate = repos.repositories.filter((r) => !existingSet.has(String(r.id)));
    const toUpdate = repos.repositories.filter((r) => existingSet.has(String(r.id)));

    await prisma.$transaction([
      ...(toCreate.length
        ? [
            prisma.gitHubRepository.createMany({
              data: toCreate.map((repo) => ({
                installationId: installation.id,
                githubRepoId: BigInt(repo.id),
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
                defaultBranch: repo.default_branch,
              })),
            }),
          ]
        : []),
      ...toUpdate.map((repo) =>
        prisma.gitHubRepository.update({
          where: { githubRepoId: BigInt(repo.id) },
          data: {
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            defaultBranch: repo.default_branch,
          },
        }),
      ),
    ]);
  }

  /**
   * Atomic delivery claim (RULE 21): a single INSERT against the deliveryId
   * unique constraint. Returns false when the delivery was already recorded
   * (P2002), closing the concurrent-delivery race in the old
   * findDelivery/recordDelivery pair.
   */
  async claimDelivery(deliveryId: string, event: string): Promise<boolean> {
    try {
      await prisma.webhookDelivery.create({
        data: { deliveryId, event },
      });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2002') return false;
      throw err;
    }
  }

  async listRepositories(organizationId: string) {
    return prisma.gitHubRepository.findMany({
      where: {
        installation: { organizationId },
      },
      include: { installation: { select: { accountLogin: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async connectService(
    organizationId: string,
    serviceId: string,
    githubRepositoryId: string,
    branch: string,
  ) {
    const repo = await prisma.gitHubRepository.findFirst({
      where: {
        id: githubRepositoryId,
        installation: { organizationId },
      },
    });

    if (!repo) {
      throw new NotFoundException('GitHub repository not found for this organization');
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });

    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }

    return prisma.service.update({
      where: { id: serviceId },
      data: { githubRepositoryId, branch },
    });
  }

  async handleInstallationEvent(payload: InstallationEventPayload) {
    const { action, installation } = payload;
    const installationId = installation.id;

    if (action === 'created') {
      const existing = await prisma.gitHubInstallation.findUnique({
        where: { installationId },
        select: { organizationId: true },
      });

      if (existing) {
        await prisma.gitHubInstallation.update({
          where: { installationId },
          data: {
            accountLogin: installation.account.login,
            accountType: installation.account.type,
            suspendedAt: null,
          },
        });
      } else {
        this.logger.warn(
          { installationId },
          'Installation webhook for unknown installation — no org mapping yet',
        );
        return;
      }

      await this.syncRepos(installationId);
    } else if (action === 'deleted') {
      const existing = await prisma.gitHubInstallation.findUnique({
        where: { installationId },
        select: { id: true },
      });

      if (existing) {
        await prisma.gitHubInstallation.delete({ where: { installationId } });
      }
    }
  }

  async handleInstallationReposEvent(payload: InstallationReposEventPayload) {
    const { installation } = payload;
    await this.syncRepos(installation.id);
  }

  async handlePushEvent(payload: PushEventPayload) {
    const repoFullName = payload.repository.full_name;
    const ref: string = payload.ref;
    const branch = ref.replace('refs/heads/', '');
    const commitSha = payload.after;

    const repo = await prisma.gitHubRepository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repo) return;

    const services = await prisma.service.findMany({
      where: {
        githubRepositoryId: repo.id,
        branch,
      },
    });

    for (const service of services) {
      // Outbox (RULE 23): deployment row + event commit together; the queue
      // enqueue is done by the outbox pump, so a Redis blip between commit
      // and add can no longer strand a push-triggered deployment.
      const [, outboxEvent] = await prisma.$transaction(async (tx) => {
        const deployment = await tx.deployment.create({
          data: {
            serviceId: service.id,
            status: 'PENDING',
            commitSha,
          },
        });
        const event = await tx.outboxEvent.create({
          data: {
            aggregate: 'Deployment',
            aggregateId: deployment.id,
            eventType: 'deployment.created',
            payload: { deploymentId: deployment.id, serviceId: service.id, commitSha },
          },
        });
        return [deployment, event] as const;
      });

      this.audit.log({
        organizationId: service.organizationId,
        actorType: ActorType.SYSTEM,
        action: 'deployment.enqueue',
        resourceType: 'Deployment',
        resourceId: outboxEvent.aggregateId,
        metadata: { serviceId: service.id, commitSha, branch, via: 'outbox' },
      });
    }
  }
}
