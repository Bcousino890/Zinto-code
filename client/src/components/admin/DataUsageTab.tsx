import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useCompanyUsage, useOverrideCompanyUsage, useResetBandwidthUsage, useRecalculateCompanyUsage } from '@/hooks/use-company-usage';
import { 
  formatStorageSize, 
  getUsageStatusColor, 
  getUsageStatusText,
  getStorageRecommendations
} from '@/utils/storage';
import { 
  HardDrive, 
  Wifi, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  RefreshCw,
  TrendingUp,
  Calendar
} from 'lucide-react';

interface DataUsageTabProps {
  companyId: number;
}

type OverrideUsagePayload = {
  currentStorageUsed?: number;
  currentBandwidthUsed?: number;
  filesCount?: number;
  reason: string;
};

const emptyOverrideValues = {
  currentStorageUsed: '',
  currentBandwidthUsed: '',
  filesCount: '',
  reason: ''
};

type Translate = (key: string, fallback?: string, vars?: Record<string, any>) => string;

const formatLimitSize = (limit: number, unlimitedLabel: string) => limit > 0 ? formatStorageSize(limit) : unlimitedLabel;
const formatLimitCount = (limit: number, unlimitedLabel: string) => limit > 0 ? limit.toLocaleString() : unlimitedLabel;
const formatPercentage = (percentage: number) => `${Math.round(percentage)}%`;

const getStatusBadgeVariant = (
  isExceeded: boolean,
  isNearLimit: boolean
): 'destructive' | 'warning' | 'success' => {
  if (isExceeded) return 'destructive';
  if (isNearLimit) return 'warning';
  return 'success';
};

const parseUsageMbInput = (value: string, label: string, t: Translate) => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(t('admin.data_usage.non_negative_number_error', '{{label}} must be a non-negative number.', { label }));
  }

  return parsed === 0 ? 0 : Math.ceil(parsed);
};

const parseFilesInput = (value: string, t: Translate) => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(t('admin.data_usage.files_count_error', 'Files count must be a non-negative whole number.'));
  }

  return parsed;
};

export function DataUsageTab({ companyId }: DataUsageTabProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: usage, isLoading, error, refetch } = useCompanyUsage(companyId);
  const overrideUsageMutation = useOverrideCompanyUsage(companyId);
  const resetBandwidthMutation = useResetBandwidthUsage(companyId);
  const recalculateUsageMutation = useRecalculateCompanyUsage(companyId);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideValues, setOverrideValues] = useState(emptyOverrideValues);

  const resetOverrideValues = () => {
    setOverrideValues(emptyOverrideValues);
  };

  const handleOverrideUsage = async () => {
    try {
      const data: OverrideUsagePayload = {
        reason: overrideValues.reason || 'Admin manual override'
      };

      data.currentStorageUsed = parseUsageMbInput(overrideValues.currentStorageUsed, t('admin.data_usage.storage_used_label', 'Storage used'), t);
      data.currentBandwidthUsed = parseUsageMbInput(overrideValues.currentBandwidthUsed, t('admin.data_usage.bandwidth_used_label', 'Bandwidth used'), t);
      data.filesCount = parseFilesInput(overrideValues.filesCount, t);

      await overrideUsageMutation.mutateAsync(data);

      toast({
        title: t('admin.data_usage.override_success_title', 'Usage Updated'),
        description: t('admin.data_usage.override_success_desc', 'Company usage has been manually overridden successfully.'),
      });

      setOverrideDialogOpen(false);
      resetOverrideValues();
    } catch (error: any) {
      toast({
        title: t('admin.data_usage.override_failed_title', 'Override Failed'),
        description: error.message || t('admin.data_usage.override_failed_desc', 'Failed to override usage'),
        variant: "destructive",
      });
    }
  };

  const handleResetBandwidth = async () => {
    try {
      await resetBandwidthMutation.mutateAsync();
      toast({
        title: t('admin.data_usage.bandwidth_reset_title', 'Bandwidth Reset'),
        description: t('admin.data_usage.bandwidth_reset_desc', 'Monthly bandwidth usage has been reset to zero.'),
      });
    } catch (error: any) {
      toast({
        title: t('admin.data_usage.reset_failed_title', 'Reset Failed'),
        description: error.message || t('admin.data_usage.reset_failed_desc', 'Failed to reset bandwidth usage'),
        variant: "destructive",
      });
    }
  };

  const handleRecalculateUsage = async () => {
    try {
      await recalculateUsageMutation.mutateAsync();
      toast({
        title: t('admin.data_usage.recalculate_success_title', 'Storage Recalculated'),
        description: t('admin.data_usage.recalculate_success_desc', 'Storage usage and file count were recalculated. Bandwidth is tracked monthly and was not recalculated.'),
      });
    } catch (error: any) {
      toast({
        title: t('admin.data_usage.recalculate_failed_title', 'Storage Recalculation Failed'),
        description: error.message || t('admin.data_usage.recalculate_failed_desc', 'Failed to recalculate storage usage'),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-2 bg-muted rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-600 mb-2">{t('admin.data_usage.load_error_title', 'Failed to Load Usage Data')}</h3>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : t('admin.data_usage.load_error_generic', 'An error occurred while loading usage data')}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            {t('admin.data_usage.no_usage_data', 'No usage data available for this company.')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const recommendations = getStorageRecommendations(usage);

  return (
    <div className="space-y-6">
      {/* Usage Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Storage Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.data_usage.storage_usage_title', 'Storage Usage')}</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.storage ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.data_usage.of_limit', 'of {{limit}} limit', { limit: formatLimitSize(usage.limits.storage, t('admin.plans.unlimited', 'Unlimited')) })}
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.storage ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.storage ?? 0)}`}>
                  {formatPercentage(usage.percentages.storage ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.storageExceeded, usage.status.storageNearLimit)}>
                  {getUsageStatusText(usage.percentages.storage ?? 0)}
                </Badge>
              </div>
              {usage.limits.storage === 0 && usage.currentUsage.storage > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('admin.data_usage.no_plan_limit', 'No plan limit configured')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bandwidth Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.data_usage.bandwidth_usage_title', 'Bandwidth Usage')}</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.bandwidth ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.data_usage.of_monthly_limit', 'of {{limit}} monthly limit', { limit: formatLimitSize(usage.limits.bandwidth, t('admin.plans.unlimited', 'Unlimited')) })}
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.bandwidth ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.bandwidth ?? 0)}`}>
                  {formatPercentage(usage.percentages.bandwidth ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.bandwidthExceeded, usage.status.bandwidthNearLimit)}>
                  {getUsageStatusText(usage.percentages.bandwidth ?? 0)}
                </Badge>
              </div>
              {usage.limits.bandwidth === 0 && usage.currentUsage.bandwidth > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('admin.data_usage.no_plan_limit', 'No plan limit configured')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Files Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.data_usage.files_count_title', 'Files Count')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage.currentUsage.files ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.data_usage.of_limit', 'of {{limit}} limit', { limit: usage.limits.totalFiles > 0 ? usage.limits.totalFiles.toLocaleString() : t('admin.plans.unlimited', 'Unlimited') })}
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.files ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.files ?? 0)}`}>
                  {formatPercentage(usage.percentages.files ?? 0)}
                </span>
                <Badge variant={getStatusBadgeVariant(usage.status.filesExceeded, usage.status.filesNearLimit)}>
                  {getUsageStatusText(usage.percentages.files ?? 0)}
                </Badge>
              </div>
              {usage.limits.totalFiles === 0 && usage.currentUsage.files > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('admin.data_usage.no_plan_limit', 'No plan limit configured')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.data_usage.plan_limits_title', 'Plan Limits')}</CardTitle>
          <CardDescription>{t('admin.data_usage.current_plan', 'Current plan: {{plan}}', { plan: usage.planName })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm font-medium">{t('admin.data_usage.storage_limit_label', 'Storage Limit')}</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.storage, t('admin.plans.unlimited', 'Unlimited'))}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">{t('admin.data_usage.bandwidth_limit_label', 'Bandwidth Limit')}</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.bandwidth, t('admin.plans.unlimited', 'Unlimited'))}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">{t('admin.data_usage.file_upload_limit_label', 'File Upload Limit')}</Label>
              <p className="text-lg font-semibold">{formatLimitSize(usage.limits.fileUpload, t('admin.plans.unlimited', 'Unlimited'))}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">{t('admin.data_usage.total_files_limit_label', 'Total Files Limit')}</Label>
              <p className="text-lg font-semibold">{formatLimitCount(usage.limits.totalFiles, t('admin.plans.unlimited', 'Unlimited'))}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              {t('admin.data_usage.recommendations_title', 'Recommendations')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            {t('admin.data_usage.admin_actions_title', 'Admin Actions')}
          </CardTitle>
          <CardDescription>
            {t('admin.data_usage.admin_actions_desc', 'Administrative tools for managing company usage')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Dialog
              open={overrideDialogOpen}
              onOpenChange={(open) => {
                setOverrideDialogOpen(open);
                if (!open) {
                  resetOverrideValues();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('admin.data_usage.override_usage_button', 'Override Usage')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('admin.data_usage.override_dialog_title', 'Override Company Usage')}</DialogTitle>
                  <DialogDescription>
                    {t('admin.data_usage.override_dialog_desc', 'Manually set usage values for this company. Leave fields empty to keep current values.')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="storage">{t('admin.data_usage.storage_used_mb_label', 'Storage Used (MB)')}</Label>
                    <Input
                      id="storage"
                      type="number"
                      min="0"
                      step="any"
                      placeholder={t('admin.data_usage.current_value_placeholder', 'Current: {{value}}', { value: formatStorageSize(usage.currentUsage.storage ?? 0) })}
                      value={overrideValues.currentStorageUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentStorageUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bandwidth">{t('admin.data_usage.bandwidth_used_mb_label', 'Bandwidth Used (MB)')}</Label>
                    <Input
                      id="bandwidth"
                      type="number"
                      min="0"
                      step="any"
                      placeholder={t('admin.data_usage.current_value_placeholder', 'Current: {{value}}', { value: formatStorageSize(usage.currentUsage.bandwidth ?? 0) })}
                      value={overrideValues.currentBandwidthUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentBandwidthUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="files">{t('admin.data_usage.files_count_title', 'Files Count')}</Label>
                    <Input
                      id="files"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={t('admin.data_usage.current_value_placeholder', 'Current: {{value}}', { value: usage.currentUsage.files })}
                      value={overrideValues.filesCount}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, filesCount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">{t('admin.data_usage.reason_label', 'Reason (Optional)')}</Label>
                    <Textarea
                      id="reason"
                      placeholder={t('admin.data_usage.reason_placeholder', 'Reason for manual override...')}
                      value={overrideValues.reason}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, reason: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setOverrideDialogOpen(false);
                    resetOverrideValues();
                  }}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    onClick={handleOverrideUsage}
                    disabled={overrideUsageMutation.isPending}
                  >
                    {overrideUsageMutation.isPending ? t('common.updating', 'Updating...') : t('admin.data_usage.update_usage_button', 'Update Usage')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={handleResetBandwidth}
              disabled={resetBandwidthMutation.isPending}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {resetBandwidthMutation.isPending ? t('admin.data_usage.resetting', 'Resetting...') : t('admin.data_usage.reset_bandwidth_button', 'Reset Monthly Bandwidth')}
            </Button>

            <Button
              variant="outline"
              onClick={handleRecalculateUsage}
              disabled={recalculateUsageMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {recalculateUsageMutation.isPending ? t('admin.data_usage.recalculating', 'Recalculating...') : t('admin.data_usage.recalculate_button', 'Recalculate Storage & Files')}
            </Button>

            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('admin.data_usage.refresh_data_button', 'Refresh Data')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-sm text-muted-foreground text-center">
        {t('admin.data_usage.last_updated', 'Last updated: {{date}}', { date: usage.lastUpdated ? new Date(usage.lastUpdated).toLocaleString() : t('api.access.key.never_used', 'Never') })}
      </div>
    </div>
  );
}
