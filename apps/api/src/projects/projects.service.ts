import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Project, ActorType } from '@myplatform/database';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { paginateQuery, parseLimit, type CursorPaginationResult } from '../common/pagination.js';
import { enqueueOutboxEvent } from '../common/outbox.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly audit: AuditService) {}

  // Select only what the list view needs (RULE 13) — no include monsters (§25).
  findAll(
    organizationId: string,
    limit?: number,
    cursor?: string,
  ): Promise<CursorPaginationResult<Project>> {
    return paginateQuery(
      (args) =>
        prisma.project.findMany({
          ...args,
          select: {
            id: true,
            organizationId: true,
            name: true,
            slug: true,
            lifecycle: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      { organizationId, lifecycle: 'ACTIVE' },
      parseLimit(limit),
      cursor,
      { id: 'asc' },
    );
  }

  async findOne(organizationId: string, id: string): Promise<Project> {
    const project = await prisma.project.findFirst({
      where: { id, organizationId, lifecycle: 'ACTIVE' },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        lifecycle: true,
        createdAt: true,
        updatedAt: true,
        services: {
          where: { lifecycle: 'ACTIVE' },
          select: {
            id: true,
            projectId: true,
            organizationId: true,
            name: true,
            type: true,
            region: true,
            lifecycle: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project as Project;
  }

  async create(
    organizationId: string,
    dto: CreateProjectDto,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Project> {
    const project = await prisma.project.create({
      data: { ...dto, organizationId },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'project.created',
      resourceType: 'Project',
      resourceId: project.id,
      metadata: { name: project.name, slug: project.slug },
    });

    return project;
  }

  /**
   * Async lifecycle delete (scope §32 / RULE 24): mark DELETING + enqueue
   * cleanup via the outbox — the HTTP request never tears infrastructure down
   * synchronously. The cleanup worker finalizes to DELETED.
   */
  async remove(
    organizationId: string,
    id: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Project> {
    const existing = await prisma.project.findFirst({
      where: { id, organizationId, lifecycle: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
    });
    if (!existing) throw new NotFoundException(`Project ${id} not found`);

    const [project] = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { lifecycle: 'DELETING' },
      });
      await enqueueOutboxEvent(tx, {
        aggregate: 'Project',
        aggregateId: id,
        eventType: 'project.cleanup',
        payload: { projectId: id, organizationId },
      });
      return [updated];
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'project.deleted',
      resourceType: 'Project',
      resourceId: id,
      metadata: { name: existing.name, slug: existing.slug, mode: 'async_lifecycle' },
    });

    return project;
  }
}
