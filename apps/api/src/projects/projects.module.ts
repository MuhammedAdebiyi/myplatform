import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
