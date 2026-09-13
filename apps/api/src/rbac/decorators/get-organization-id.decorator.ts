import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.organizationId;
  },
);
