import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  id?: string;
  email: string;
  workspaceId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return null;
    }

    if (data === 'id' || data === 'userId') {
      return user.userId ?? user.id;
    }

    return data ? user[data] : user;
  },
);

