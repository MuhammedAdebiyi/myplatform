import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Project, ActorType } from '@myplatform/database';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly audit: AuditService) {}

  findAll(organizationId: string): Promise<Project[]> {
    return prisma.project.findMany({
      where: { organizationId },
      include: { services: true },
    });
  }

  async findOne(organizationId: string, id: string): Promise<Project> {
    const project = await prisma.project.findFirst({
      where: { id, organizationId },
      include: { services: true },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
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
      action: 'project.create',
      resourceType: 'Project',
      resourceId: project.id,
      metadata: { name: project.name, slug: project.slug },
    });

    return project;
  }

  async remove(
    organizationId: string,
    id: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Project> {
    await this.findOne(organizationId, id);
    const project = await prisma.project.delete({ where: { id } });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'project.delete',
      resourceType: 'Project',
      resourceId: id,
      metadata: { name: project.name, slug: project.slug },
    });

    return project;
  }
}
