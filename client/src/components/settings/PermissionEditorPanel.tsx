import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/use-translation';
import {
  getPermissionGroups,
  getPermissionLabel,
  getErpPermissionSections,
  PERMISSION_GROUP_KEYS,
} from './permissionCatalog';

interface PermissionEditorPanelProps {
  permissions: Record<string, boolean>;
  onToggle: (permission: string, value: boolean) => void;
  idPrefix?: string;
  enforcedPermissions?: readonly string[];
}

export function PermissionEditorPanel({
  permissions,
  onToggle,
  idPrefix = 'perm',
  enforcedPermissions = [],
}: PermissionEditorPanelProps) {
  const isEnforced = (permission: string) => enforcedPermissions.includes(permission);
  const { t } = useTranslation();
  const permissionGroups = getPermissionGroups(t);
  const erpSections = getErpPermissionSections(t);
  const groupEntries = PERMISSION_GROUP_KEYS.map(key => [key, permissionGroups[key]] as const);

  return (
    <Tabs defaultValue={PERMISSION_GROUP_KEYS[0]} className="w-full">
      <div className="space-y-2">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1 h-auto">
          {groupEntries.slice(0, 8).map(([groupKey, group]) => (
            <TabsTrigger
              key={groupKey}
              value={groupKey}
              className="text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap"
            >
              {group.tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1 h-auto">
          {groupEntries.slice(8).map(([groupKey, group]) => (
            <TabsTrigger
              key={groupKey}
              value={groupKey}
              className="text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap"
            >
              {group.tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {groupEntries.map(([groupKey, group]) => {
        if (groupKey === 'erp') return null;

        return (
          <TabsContent key={groupKey} value={groupKey} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(group.permissions).map(([permission, label]) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${idPrefix}-${permission}`}
                        checked={permissions[permission] || isEnforced(permission)}
                        disabled={isEnforced(permission)}
                        onCheckedChange={(checked) => onToggle(permission, !!checked)}
                      />
                      <Label
                        htmlFor={`${idPrefix}-${permission}`}
                        className={`text-sm font-normal ${isEnforced(permission) ? 'text-muted-foreground' : 'cursor-pointer'}`}
                      >
                        {label}
                        {isEnforced(permission) && (
                          <span className="ml-1 text-xs">{t('roles.enforced', '(enforced)')}</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        );
      })}

      <TabsContent value="erp" className="space-y-4">
        {erpSections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.permissions.map((permission) => (
                  <div key={permission} className="flex items-center space-x-2">
                    <Checkbox
                      id={`${idPrefix}-${permission}`}
                      checked={permissions[permission] || isEnforced(permission)}
                      disabled={isEnforced(permission)}
                      onCheckedChange={(checked) => onToggle(permission, !!checked)}
                    />
                    <Label
                      htmlFor={`${idPrefix}-${permission}`}
                      className={`text-sm font-normal ${isEnforced(permission) ? 'text-muted-foreground' : 'cursor-pointer'}`}
                    >
                      {getPermissionLabel(permission, t)}
                      {isEnforced(permission) && (
                        <span className="ml-1 text-xs">{t('roles.enforced', '(enforced)')}</span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}
