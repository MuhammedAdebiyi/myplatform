import { Module, forwardRef } from '@nestjs/common';
import { GitHubController } from './github.controller.js';
import { GitHubService } from './github.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, ApiKeysModule, RbacModule, AuditModule],
  controllers: [GitHubController],
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
