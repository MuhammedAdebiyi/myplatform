import { Module } from '@nestjs/common';
import { OrganizationGuard } from './guards/organization.guard.js';

@Module({
  providers: [OrganizationGuard],
  exports: [OrganizationGuard],
})
export class RbacModule {}
