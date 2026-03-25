//request-with-user.type.ts
import { CurrentUserJwt } from './current-user-jwt.type';

export type RequestWithUser = {
  user: CurrentUserJwt;
  companyId?: number;
  headers: Record<string, string>;
};
