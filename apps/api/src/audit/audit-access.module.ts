import { Module, forwardRef } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from './audit.module.js';

/**
 * The audit-log read endpoint. Kept separate from AuditModule (the service)
 * because it needs SessionGuard via AuthModule — which itself imports
 * AuditModule. See AuditModule's doc comment for the cycle this avoids.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => ApiKeysModule),
    RbacModule,
    AuditModule,
  ],
  controllers: [AuditController],
})
export class AuditAccessModule {}
