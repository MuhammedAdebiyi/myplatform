import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
