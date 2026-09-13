import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
