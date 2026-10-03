import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import {
  generateAppJwt,
  getInstallationInfo,
  listInstallationRepos,
  listBranches,
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
  deleted?: boolean;
  created?: boolean;
  forced?: boolean;
  repository: { full_name: string };
}

interface PullRequestEventPayload {
  action: 'opened' | 'synchronize' | 'reopened' | 'closed';
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { ref: string };
    merged: boolean;
    draft: boolean;
  };
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

  /**
   * Resolve which organization an InstallationState belongs to, WITHOUT
   * consuming it. Used by the static GitHub App Setup URL (/github/setup),
   * which cannot carry an organizationId in its path — the state does.
   */
  async resolveOrganizationByState(state: string): Promise<string> {
    const installationState = await prisma.installationState.findUnique({
      where: { state },
      select: { organizationId: true, expiresAt: true },
    });
    if (!installationState || installationState.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired installation state');
    }
    return installationState.organizationId;
  }

  /**
   * Complete an installation started via createInstallUrl, keyed by state
   * instead of an org path param. Verifies the caller is a member of the org
   * that started the install, then runs the same validate+upsert+sync as the
   * browser callback.
   */
  async completeInstallation(
    state: string,
    installationId: number,
    callerUserId: string,
  ): Promise<{ organizationId: string; accountLogin: string }> {
    const organizationId = await this.resolveOrganizationByState(state);

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: callerUserId, organizationId } },
      select: { id: true },
    });
    if (!membership) {
      throw new UnauthorizedException('You are not a member of the organization that started this installation');
    }

    const config = getGitHubAppConfig();
    const appJwt = generateAppJwt(config);
    const installationInfo = await getInstallationInfo(appJwt, installationId);

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
    await prisma.installationState.delete({ where: { state } });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId: callerUserId,
      action: 'github.installation.create',
      resourceType: 'GitHubInstallation',
      resourceId: undefined,
      metadata: { installationId, accountLogin: installationInfo.account.login, via: 'setup-url' },
    });

    return { organizationId, accountLogin: installationInfo.account.login };
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
    // Select only JSON-safe columns: githubRepoId is a BigInt in the DB and
    // JSON.stringify throws on BigInt, which 500'd this endpoint the moment a
    // real installation had synced repos (found via live install, RULE 31).
    return prisma.gitHubRepository.findMany({
      where: {
        installation: { organizationId },
      },
      select: {
        id: true,
        name: true,
        fullName: true,
        private: true,
        defaultBranch: true,
        installation: { select: { accountLogin: true } },
      },
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

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: { githubRepositoryId, branch, repoUrl: `https://github.com/${repo.fullName}` },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      action: 'github.service.connect',
      resourceType: 'Service',
      resourceId: serviceId,
      metadata: { repoFullName: repo.fullName, branch },
    });

    // Vercel-style auto-deploy: when enabled, connecting (or reconnecting)
    // immediately kicks off a deploy of the new connection's default state.
    // Best-effort: a failed deploy enqueue must NOT fail the connect itself.
    if (updated.autoDeployOnConnect) {
      try {
        await this.createPushDeployment(serviceId, organizationId, null as unknown as string, branch);
      } catch (err) {
        this.logger.error({ err, serviceId }, 'Auto-deploy after connect failed to enqueue');
      }
    }

    return updated;
  }

  /**
   * Installation status for the settings UI: connected, account, repo count.
   */
  async getInstallationStatus(organizationId: string) {
    const installation = await prisma.gitHubInstallation.findFirst({
      where: { organizationId },
      include: { repositories: { select: { id: true } } },
    });
    if (!installation) return { connected: false as const };
    return {
      connected: true as const,
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      suspended: installation.suspendedAt !== null,
      repositoryCount: installation.repositories.length,
    };
  }

  /**
   * Live branches of a connected repo, fetched fresh from GitHub using the
   * installation token. Default branch sorts first.
   */
  async listRepoBranches(organizationId: string, githubRepositoryId: string) {
    const repo = await prisma.gitHubRepository.findFirst({
      where: { id: githubRepositoryId, installation: { organizationId } },
      include: { installation: { select: { installationId: true, suspendedAt: true } } },
    });
    if (!repo) {
      throw new NotFoundException('GitHub repository not found for this organization');
    }
    if (repo.installation.suspendedAt) {
      throw new UnauthorizedException('GitHub App installation is suspended');
    }

    const config = getGitHubAppConfig();
    const appJwt = generateAppJwt(config);
    const token = await createInstallationAccessToken(appJwt, repo.installation.installationId);
    const branches = await listBranches(token.token, repo.fullName);

    return branches
      .sort((a, b) => {
        if (a.name === repo.defaultBranch) return -1;
        if (b.name === repo.defaultBranch) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((b) => ({ name: b.name, commitSha: b.commit.sha, isDefault: b.name === repo.defaultBranch }));
  }

  /**
   * Branch mappings for a service (Vercel-style): the production branch
   * deploys to live domains; preview branches deploy off-production.
   */
  async listBranchMappings(organizationId: string, serviceId: string) {
    await this.requireService(organizationId, serviceId);
    return prisma.serviceBranchMapping.findMany({
      where: { serviceId },
      orderBy: [{ target: 'desc' }, { branch: 'asc' }],
      select: { id: true, branch: true, target: true, createdAt: true },
    });
  }

  /**
   * Replace ALL mappings for a service in one transaction. Exactly one
   * PRODUCTION mapping is enforced. Passing no production mapping means the
   * service's connected branch stays implicit production (legacy compat).
   */
  async setBranchMappings(
    organizationId: string,
    serviceId: string,
    mappings: Array<{ branch: string; target: 'PRODUCTION' | 'PREVIEW' }>,
  ) {
    const service = await this.requireService(organizationId, serviceId);

    const productionCount = mappings.filter((m) => m.target === 'PRODUCTION').length;
    if (productionCount > 1) {
      throw new BadRequestException('Only one production branch mapping is allowed per service');
    }

    const branches = mappings.map((m) => m.branch);
    if (new Set(branches).size !== branches.length) {
      throw new BadRequestException('Duplicate branch in mappings');
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceBranchMapping.deleteMany({ where: { serviceId } });
      if (mappings.length) {
        await tx.serviceBranchMapping.createMany({
          data: mappings.map((m) => ({
            serviceId,
            branch: m.branch,
            target: m.target,
          })),
        });
      }
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      action: 'github.service.branch_mappings.set',
      resourceType: 'Service',
      resourceId: serviceId,
      metadata: { serviceName: service.name, mappings },
    });

    return this.listBranchMappings(organizationId, serviceId);
  }

  private async requireService(organizationId: string, serviceId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, organizationId, lifecycle: 'ACTIVE' },
      select: { id: true, name: true },
    });
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);
    return service;
  }

  async handlePullRequestEvent(payload: PullRequestEventPayload) {
    const pr = payload.pull_request;
    // Draft PRs and non-code actions never deploy.
    if (pr.draft) return;
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) return;

    const repo = await prisma.gitHubRepository.findFirst({
      where: { fullName: payload.repository.full_name },
    });
    if (!repo) return;

    const services = await prisma.service.findMany({
      where: { githubRepositoryId: repo.id, deployPullRequests: true, branch: pr.base.ref },
    });

    for (const service of services) {
      await this.createPushDeployment(
        service.id,
        service.organizationId,
        pr.head.sha,
        `pr-${payload.number}`,
        'preview',
      );
    }
  }

  /**
   * Shared deployment creation for push and PR events: Deployment row +
   * outbox event in one transaction (RULE 23), then audit.
   * commitSha may be null (auto-deploy on connect builds HEAD).
   * deploymentTarget distinguishes production vs preview (branch mappings).
   */
  private async createPushDeployment(
    serviceId: string,
    organizationId: string,
    commitSha: string | null,
    branch: string,
    deploymentTarget: 'production' | 'preview' = 'production',
  ): Promise<void> {
    // Best-effort commit metadata (message + author) — a GitHub hiccup must
    // never block a deploy, so failure just leaves the fields null.
    const commitMeta = commitSha
      ? await this.fetchCommitMeta(serviceId, commitSha).catch(() => null)
      : null;

    const [, outboxEvent] = await prisma.$transaction(async (tx) => {
      const deployment = await tx.deployment.create({
        data: {
          serviceId,
          status: 'PENDING',
          commitSha,
          commitMessage: commitMeta?.message ?? null,
          commitAuthor: commitMeta?.author ?? null,
          branch,
          deploymentTarget,
        },
      });
      const event = await tx.outboxEvent.create({
        data: {
          aggregate: 'Deployment',
          aggregateId: deployment.id,
          eventType: 'deployment.created',
          payload: { deploymentId: deployment.id, serviceId, commitSha },
        },
      });
      return [deployment, event] as const;
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.SYSTEM,
      action: 'deployment.enqueue',
      resourceType: 'Deployment',
      resourceId: outboxEvent.aggregateId,
      metadata: { serviceId, commitSha, branch, deploymentTarget, via: 'outbox' },
    });
  }

  /**
   * Fetch commit message + author login from GitHub for the deploy list.
   * Uses the service's repo installation token; null on any failure.
   */
  private async fetchCommitMeta(
    serviceId: string,
    commitSha: string,
  ): Promise<{ message: string; author: string } | null> {
    try {
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: {
          githubRepository: {
            select: { fullName: true, installation: { select: { installationId: true } } },
          },
        },
      });
      const repo = service?.githubRepository;
      if (!repo) return null;

      const config = getGitHubAppConfig();
      const appJwt = generateAppJwt(config);
      const token = await createInstallationAccessToken(appJwt, repo.installation.installationId);

      const res = await fetch(
        `https://api.github.com/repos/${repo.fullName}/commits/${commitSha}`,
        {
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (!res.ok) return null;

      const data = (await res.json()) as {
        commit?: { message?: string };
        author?: { login?: string } | null;
      };
      const message = data.commit?.message?.split('\n')[0]?.slice(0, 200) ?? null;
      const author = data.author?.login ?? null;
      if (!message && !author) return null;
      return { message: message ?? '', author: author ?? '' };
    } catch {
      return null;
    }
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
    } else if (action === 'suspend' || action === 'unsuspend') {
      const suspendedAt = action === 'suspend' ? new Date() : null;
      await prisma.gitHubInstallation.updateMany({
        where: { installationId },
        data: { suspendedAt },
      });
      this.logger.log({ installationId, action }, 'Installation suspend state changed');
    }
  }

  async handleInstallationReposEvent(payload: InstallationReposEventPayload) {
    const { installation } = payload;
    await this.syncRepos(installation.id);
  }

  async handlePushEvent(payload: PushEventPayload) {
    // Branch deletion, tag pushes and empty pushes never deploy. A forced
    // push DOES deploy (the new tip is real code) — but with the new sha.
    if (payload.deleted) return;
    if (!payload.ref?.startsWith('refs/heads/')) return;
    if (!payload.after || payload.after === '0000000000000000000000000000000000000000') return;

    const repoFullName = payload.repository.full_name;
    const ref: string = payload.ref;
    const branch = ref.replace('refs/heads/', '');
    const commitSha = payload.after;

    const repo = await prisma.gitHubRepository.findFirst({
      where: { fullName: repoFullName },
      include: { installation: { select: { suspendedAt: true } } },
    });

    if (!repo) return;
    // Suspended installations must not trigger builds — GitHub stops sending
    // webhooks on suspend, but in-flight/queued deliveries can still arrive.
    // A repo with no resolvable installation is treated as suspended too.
    if (repo.installation?.suspendedAt ?? true) return;

    const services = await prisma.service.findMany({
      where: {
        githubRepositoryId: repo.id,
        branch,
      },
      include: { branchMappings: true },
    });

    for (const service of services) {
      // Branch-mapping routing (Vercel model): if the pushed branch has an
      // explicit mapping it wins (production vs preview); otherwise the
      // service's connected branch behaves as production (legacy compat) and
      // any other branch is a preview deploy.
      const mapping = service.branchMappings.find((m) => m.branch === branch);
      const target: 'production' | 'preview' = mapping
        ? mapping.target === 'PRODUCTION'
          ? 'production'
          : 'preview'
        : service.branch === branch
          ? 'production'
          : 'preview';

      await this.createPushDeployment(
        service.id,
        service.organizationId,
        commitSha,
        branch,
        target,
      );
    }
  }
}
