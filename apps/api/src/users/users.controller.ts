import { Controller, Get, UseGuards } from '@nestjs/common';
import { prisma } from '@myplatform/database';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator.js';

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  organizations: { id: string; name: string; slug: string; role: string }[];
}

@UseGuards(SessionGuard)
@Controller('users/me')
export class UsersController {
  @Get()
  async me(@CurrentUser() user: CurrentUserType): Promise<MeResponse> {
    const [memberships, account] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: user.id },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerified: true },
      }),
    ]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: account?.emailVerified ?? false,
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }
}
