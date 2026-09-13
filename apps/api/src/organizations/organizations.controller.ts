import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator.js';

@UseGuards(SessionGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.organizations.create(dto, user.id);
  }

  @Get()
  findMany(@CurrentUser() user: CurrentUserType) {
    return this.organizations.findManyForUser(user.id);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.organizations.findOneBySlug(slug);
  }

  @Post(':organizationId/members')
  addMember(
    @Param('organizationId') organizationId: string,
    @Body() dto: { email: string; role: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.organizations.addMember(
      organizationId,
      user.id,
      dto.email,
      dto.role as any,
    );
  }

  @Delete(':organizationId/members/:userId')
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.organizations.removeMember(
      organizationId,
      user.id,
      targetUserId,
    );
  }
}
