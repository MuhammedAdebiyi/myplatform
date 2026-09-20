import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { SessionGuard } from '../auth/guards/session.guard.js';
import { CurrentUser, CurrentSessionId } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUser as CurrentUserType } from '../auth/decorators/current-user.decorator.js';
import type { CursorPaginationQuery } from '../common/pagination.js';

@UseGuards(SessionGuard)
@Controller('users/me/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserType,
    @CurrentSessionId() sessionId: string,
    @Query() query: CursorPaginationQuery,
  ) {
    return this.sessions.list(user.id, sessionId, query.limit, query.cursor);
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: CurrentUserType,
    @CurrentSessionId() sessionId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.sessions.revoke(user.id, id, sessionId, req.ip, req.headers['user-agent']);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  revokeAll(
    @CurrentUser() user: CurrentUserType,
    @CurrentSessionId() sessionId: string,
    @Query('includeCurrent') includeCurrent: string,
    @Req() req: any,
  ) {
    return this.sessions.revokeAll(
      user.id,
      sessionId,
      includeCurrent === 'true',
      req.ip,
      req.headers['user-agent'],
    );
  }
}
