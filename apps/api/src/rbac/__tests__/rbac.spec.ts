import { OrgRole } from '@myplatform/database';
import { Permission, hasPermission, getPermissionsForRole } from '../permissions.js';

describe('Permission matrix (scope §8)', () => {
  it('OWNER has every permission', () => {
    const owner = getPermissionsForRole(OrgRole.OWNER);
    expect(owner).toEqual(Object.values(Permission));
  });

  it('DEVELOPER can deploy and manage deployments but not members', () => {
    expect(hasPermission(OrgRole.DEVELOPER, Permission.SERVICE_DEPLOY)).toBe(true);
    expect(hasPermission(OrgRole.DEVELOPER, Permission.DEPLOYMENT_CREATE)).toBe(true);
    expect(hasPermission(OrgRole.DEVELOPER, Permission.DEPLOYMENT_ROLLBACK)).toBe(true);
    expect(hasPermission(OrgRole.DEVELOPER, Permission.MEMBER_INVITE)).toBe(false);
  });

  it('VIEWER is read-only', () => {
    const readish: Permission[] = [
      Permission.PROJECT_READ,
      Permission.SERVICE_READ,
      Permission.DEPLOYMENT_READ,
      Permission.DOMAIN_READ,
    ];
    for (const p of Object.values(Permission)) {
      if (readish.includes(p)) {
        expect(hasPermission(OrgRole.VIEWER, p)).toBe(true);
      } else {
        expect(hasPermission(OrgRole.VIEWER, p)).toBe(false);
      }
    }
  });

  it('SECRETS_MANAGE is restricted to OWNER/ADMIN', () => {
    expect(hasPermission(OrgRole.OWNER, Permission.SECRETS_MANAGE)).toBe(true);
    expect(hasPermission(OrgRole.ADMIN, Permission.SECRETS_MANAGE)).toBe(true);
    expect(hasPermission(OrgRole.DEVELOPER, Permission.SECRETS_MANAGE)).toBe(false);
  });

  it('DOMAIN_MANAGE is not grantable to API keys', async () => {
    const { API_KEY_PERMISSIONS } = await import('../permissions.js');
    expect(API_KEY_PERMISSIONS).not.toContain(Permission.DOMAIN_MANAGE);
    expect(API_KEY_PERMISSIONS).not.toContain(Permission.SECRETS_MANAGE);
    expect(API_KEY_PERMISSIONS).toContain(Permission.SERVICE_DEPLOY);
    expect(API_KEY_PERMISSIONS).toContain(Permission.DEPLOYMENT_CREATE);
  });
});
