import { Module, forwardRef } from '@nestjs/common';
import { DeploymentsController } from './deployments.controller.js';
import { DeploymentsService } from './deployments.service.js';
import { DomainsController, DomainsService } from './domains.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, forwardRef(() => ApiKeysModule), RbacModule, AuditModule],
  controllers: [DeploymentsController, DomainsController],
  providers: [DeploymentsService, DomainsService],
})
export class DeploymentsModule {}
