import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController, SessionsController],
  providers: [SessionsService],
})
export class UsersModule {}
