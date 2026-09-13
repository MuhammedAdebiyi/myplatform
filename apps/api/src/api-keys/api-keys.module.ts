import { Module, forwardRef } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysThrottlerGuard } from './api-keys-throttler.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [forwardRef(() => AuthModule), RbacModule, AuditModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysThrottlerGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
