import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Service, ActorType } from '@myplatform/database';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { paginateQuery, parseLimit, type CursorPaginationResult } from '../common/pagination.js';

@Injectable()
export class ServicesService {
  constructor(private readonly audit: AuditService) {}

  findAllForProject(
    organizationId: string,
    projectId: string,
    limit?: number,
    cursor?: string,
  ): Promise<CursorPaginationResult<Service>> {
    return paginateQuery(
      (args) => prisma.service.findMany(args),
      { projectId, organizationId },
      parseLimit(limit),
      cursor,
      { id: 'asc' },
    );
  }

  async findOne(organizationId: string, id: string): Promise<Service> {
    const service = await prisma.service.findFirst({
      where: { id, organizationId },
      include: { envVars: true, domains: true, healthCheck: true, deployments: true },
    });
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    return service;
  }

  async create(
    organizationId: string,
    projectId: string,
    dto: CreateServiceDto,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Service> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { organizationId: true },
    });

    const service = await prisma.service.create({
      data: { ...dto, projectId, organizationId: project.organizationId },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.create',
      resourceType: 'Service',
      resourceId: service.id,
      metadata: { name: service.name, type: service.type },
    });

    return service;
  }

  async remove(
    organizationId: string,
    id: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Service> {
    await this.findOne(organizationId, id);
    const service = await prisma.service.delete({ where: { id } });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.delete',
      resourceType: 'Service',
      resourceId: id,
      metadata: { name: service.name, type: service.type },
    });

    return service;
  }
}
