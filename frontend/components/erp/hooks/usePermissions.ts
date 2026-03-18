import { createContext, useContext } from 'react';
import type { ERPPermissionLevel, ERPPermissions } from '../lib/api';

export interface PermissionsContextValue {
  permissions: ERPPermissions;
  isSuperuser: boolean;
  hasAccess: (section: string, minLevel?: ERPPermissionLevel) => boolean;
  canEdit: (section: string) => boolean;
}

export const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: {},
  isSuperuser: false,
  hasAccess: () => true,
  canEdit: () => true,
});

export const usePermissions = (): PermissionsContextValue => {
  return useContext(PermissionsContext);
};

/**
 * Разрешает уровень доступа с fallback на родительский раздел.
 * "settings.personnel" -> ищем "settings.personnel", fallback -> "settings"
 */
const resolveLevel = (permissions: ERPPermissions, section: string): ERPPermissionLevel => {
  const direct = permissions[section];
  if (direct !== undefined) return direct;
  if (section.includes('.')) {
    const parent = section.split('.')[0];
    return permissions[parent] ?? 'none';
  }
  return 'none';
};

export const buildPermissionsValue = (
  user: { is_superuser?: boolean; is_staff?: boolean; erp_permissions?: ERPPermissions } | null,
): PermissionsContextValue => {
  const isSuperuser = !!user?.is_superuser;
  const permissions = user?.erp_permissions || {};

  const hasAccess = (section: string, minLevel: ERPPermissionLevel = 'read'): boolean => {
    if (isSuperuser) return true;
    if (!Object.keys(permissions).length) return true;
    const level = resolveLevel(permissions, section);
    if (minLevel === 'read') return level === 'read' || level === 'edit';
    if (minLevel === 'edit') return level === 'edit';
    return level !== 'none';
  };

  const canEdit = (section: string): boolean => hasAccess(section, 'edit');

  return { permissions, isSuperuser, hasAccess, canEdit };
};
