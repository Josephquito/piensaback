export type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

export type RequestWithUser = {
  user: ReqUser;
  companyId?: number;
  headers: Record<string, any>;
};
