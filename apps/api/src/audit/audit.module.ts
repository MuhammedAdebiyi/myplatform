import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * Audit service only — zero imports, so nothing that needs AuditService can
 * form a module cycle with it. The audit-log READ endpoint lives in
 * AuditAccessModule (it needs SessionGuard from AuthModule, which imports
 * AuditModule — keeping them in one module created an Auth ⇄ Audit cycle
 * that resolved SessionGuard with an undefined AuthService and 500'd every
 * authenticated request (RULE 31: found by runtime smoke test, not tests).
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
