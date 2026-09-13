export const Permission = {
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  SERVICE_CREATE: 'service:create',
  SERVICE_READ: 'service:read',
  SERVICE_UPDATE: 'service:update',
  SERVICE_DELETE: 'service:delete',

  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  MEMBER_LIST: 'member:list',

  API_KEY_CREATE: 'api_key:create',
  API_KEY_LIST: 'api_key:list',
  API_KEY_REVOKE: 'api_key:revoke',

  AUDIT_READ: 'audit:read',

  ORG_SETTINGS: 'org:settings',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

import { OrgRole } from '@myplatform/database';

const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  [OrgRole.OWNER]: Object.values(Permission),
  [OrgRole.ADMIN]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.SERVICE_CREATE,
    Permission.SERVICE_READ,
    Permission.SERVICE_UPDATE,
    Permission.SERVICE_DELETE,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_LIST,
    Permission.API_KEY_CREATE,
    Permission.API_KEY_LIST,
    Permission.API_KEY_REVOKE,
    Permission.AUDIT_READ,
  ],
  [OrgRole.DEVELOPER]: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.SERVICE_CREATE,
    Permission.SERVICE_READ,
    Permission.SERVICE_UPDATE,
    Permission.MEMBER_LIST,
  ],
  [OrgRole.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.SERVICE_READ,
    Permission.MEMBER_LIST,
  ],
  [OrgRole.VIEWER]: [
    Permission.PROJECT_READ,
    Permission.SERVICE_READ,
  ],
};

export function getPermissionsForRole(role: OrgRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
