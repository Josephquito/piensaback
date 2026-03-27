import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getTodayUTC } from '../utils/date.utils';

/**
 * Extrae el header X-User-Date del request y retorna un Date UTC a medianoche.
 * Si el header no está presente, usa la fecha UTC actual del servidor.
 */
export const UserToday = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Date => {
    const request = ctx.switchToHttp().getRequest();
    const header = request.headers['x-user-date'] as string | undefined;
    return getTodayUTC(header);
  },
);
