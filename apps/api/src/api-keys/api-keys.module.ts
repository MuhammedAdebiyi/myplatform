import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
