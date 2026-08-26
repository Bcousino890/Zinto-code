import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { launchInstagramSignup } from '@/lib/facebook-sdk';
import { useMetaChannelsOnboarding } from '@/hooks/useMetaChannelsOnboarding';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InstagramEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [connectionName, setConnectionName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const {
    sdkInitialized,
    loading,
    setLoading,
    configValid,
    devFallback,
    configError,
    configGuidance,
    configLoading,
    onboardingSessionId,
    instagramAccounts,
    discoveryError,
    discoveryCode,
    loginConfigId,
    loadPartnerConfiguration,
    refreshConfiguration,
    resetDiscovery,
    handleDiscoveryResponse,
    diagnosticMessage,
  } = useMetaChannelsOnboarding('instagram');

  useEffect(() => {
    if (isOpen) {
      loadPartnerConfiguration();
      resetDiscovery();
      setSelectedAccountId('');
    }
  }, [isOpen, loadPartnerConfiguration, resetDiscovery]);

  const canLaunchSignup = configValid && (Boolean(loginConfigId) || devFallback);

  const launchSignup = () => {
    if (!connectionName.trim()) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_connection_name_required', 'Connection Name Required'),
        description: t(
          'settings.instagramEmbeddedSignup.toast_connection_name_required_desc',
          'Please enter a connection name to continue.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!canLaunchSignup) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_configuration_error', 'Configuration Error'),
        description: configError || diagnosticMessage(configGuidance as any),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    if (!sdkInitialized) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_please_wait', 'Please Wait'),
        description: t(
          'settings.instagramEmbeddedSignup.toast_please_wait_desc',
          'The signup process is still initializing. Please try again in a moment.'
        ),
      });
      setLoading(false);
      return;
    }

    try {
      launchInstagramSignup(
        loginConfigId,
        (response) => handleDiscoveryResponse(response, 'fetch_accounts')
      );
    } catch (error: any) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_launch_error', 'Launch Error'),
        description:
          error.message ||
          t(
            'settings.instagramEmbeddedSignup.toast_launch_error_desc',
            'Failed to launch Instagram signup flow.'
          ),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleConnectAccount = async () => {
    const selectedAccount = instagramAccounts.find((a) => a.id === selectedAccountId);
    if (!selectedAccount?.linkedPageId) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_account_required', 'Account Required'),
        description: t(
          'settings.instagramEmbeddedSignup.toast_account_required_desc',
          'Select an Instagram account linked to a Facebook Page.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!onboardingSessionId) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_session_expired', 'Session Expired'),
        description: t(
          'settings.instagramEmbeddedSignup.toast_session_expired_desc',
          'Your login session expired. Log in again and retry.'
        ),
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/channel-connections/meta-instagram-embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionName: connectionName.trim() || `Instagram - ${selectedAccount.username}`,
          instagramAccountId: selectedAccount.id,
          username: selectedAccount.username,
          linkedPageId: selectedAccount.linkedPageId,
          onboardingSessionId,
          action: 'create_connection',
        }),
      });

      const result = await response.json();
      if (response.ok) {
        if (result.webhookSubscriptionStatus && !result.webhookSubscriptionStatus.success) {
          toast({
            title: t('settings.instagramEmbeddedSignup.toast_connected_with_warnings', 'Connected with warnings'),
            description: diagnosticMessage('webhook_subscription_failed'),
            variant: 'destructive',
          });
        } else {
          toast({
            title: t('settings.instagramEmbeddedSignup.toast_connection_successful', 'Connection Successful'),
            description: t(
              'settings.instagramEmbeddedSignup.toast_connection_successful_desc',
              'Instagram connection for "@{{username}}" has been created successfully.',
              { username: selectedAccount.username }
            ),
          });
        }
        onSuccess();
        onClose();
      } else {
        throw new Error(
          result.message ||
            result.error ||
            t('settings.instagramEmbeddedSignup.toast_connection_error_desc', 'Failed to create Instagram connection.')
        );
      }
    } catch (error: any) {
      toast({
        title: t('settings.instagramEmbeddedSignup.toast_connection_error', 'Connection Error'),
        description:
          error.message ||
          t(
            'settings.instagramEmbeddedSignup.toast_connection_error_desc',
            'Failed to create Instagram connection.'
          ),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const statusBanner = () => {
    if (configLoading) return null;

    if (devFallback) {
      return (
        <div className="mt-3 flex rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="text-xs">
            {t(
              'settings.instagramEmbeddedSignup.development_fallback',
              'Development fallback: launching with manual Facebook scopes because no Login for Business configuration ID is set.'
            )}
          </p>
        </div>
      );
    }

    if (!configValid && configError) {
      return (
        <div className="mt-3 flex flex-col rounded border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 [&_strong]:text-red-950 dark:[&_strong]:text-red-100">
          <p className="text-xs font-medium">
            <strong>
              {configGuidance === 'configuration_missing'
                ? t('settings.instagramEmbeddedSignup.configuration_missing_label', 'Configuration missing:')
                : t('settings.instagramEmbeddedSignup.configuration_error_label', 'Configuration error:')}
            </strong>{' '}
            {configError}
          </p>
          <p className="text-xs mt-1">{diagnosticMessage(configGuidance as any)}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 text-xs" onClick={refreshConfiguration}>
            {t('settings.instagramEmbeddedSignup.refresh_configuration', 'Refresh Configuration')}
          </Button>
        </div>
      );
    }

    if (discoveryError) {
      return (
        <div className="mt-3 flex flex-col rounded border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 [&_strong]:text-red-950 dark:[&_strong]:text-red-100">
          <p className="text-xs font-medium">
            <strong>{t('settings.instagramEmbeddedSignup.discovery_issue_label', 'Discovery issue:')}</strong>{' '}
            {discoveryError}
          </p>
          {discoveryCode === 'permission_restricted' || discoveryCode === 'app_review_pending' ? (
            <p className="text-xs mt-1">
              {t(
                'settings.instagramEmbeddedSignup.app_review_required',
                'Complete Meta App Review and Advanced Access for Instagram messaging permissions before external users can connect.'
              )}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="mt-3 flex rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="text-xs">
          {t(
            'settings.instagramEmbeddedSignup.professional_account_note',
            'Uses Facebook Login for Business with Page-linked Instagram discovery. Instagram must be a professional account linked to a Facebook Page.'
          )}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('settings.instagramEmbeddedSignup.title', 'Instagram - Easy Setup')}</DialogTitle>
          <DialogDescription>
            {t(
              'settings.instagramEmbeddedSignup.description',
              'Connect your Instagram Business account to enable Instagram Direct messages via Facebook Login for Business.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              {t('settings.instagramEmbeddedSignup.how_it_works', 'How it works:')}
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                {t(
                  'settings.instagramEmbeddedSignup.step_login',
                  'Log in with Facebook using your configured Login for Business flow'
                )}
              </li>
              <li>
                {t(
                  'settings.instagramEmbeddedSignup.step_select_account',
                  'Select a Page-linked Instagram professional account'
                )}
              </li>
              <li>
                {t(
                  'settings.instagramEmbeddedSignup.step_subscribe_webhooks',
                  'We subscribe webhooks on the linked Page and store the correct Page token'
                )}
              </li>
            </ol>
            {statusBanner()}
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="connectionName">
                {t('settings.instagramEmbeddedSignup.connection_name', 'Connection Name')}
              </Label>
              <Input
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder={t(
                  'settings.instagramEmbeddedSignup.connection_name_placeholder',
                  'e.g. My Instagram Account'
                )}
                className="mt-1"
                required
              />
            </div>

            {instagramAccounts.length > 0 && (
              <div>
                <Label>{t('settings.instagramEmbeddedSignup.select_instagram_account', 'Select Instagram Account')}</Label>
                <div className="mt-2 space-y-2">
                  {instagramAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedAccountId === account.id
                          ? 'border-[#E4405F] bg-pink-50 dark:border-pink-700 dark:bg-pink-950/20'
                          : 'border-input hover:bg-muted/50'
                      }`}
                    >
                      {account.profile_picture_url ? (
                        <img src={account.profile_picture_url} alt={account.username} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <i className="ri-instagram-line text-lg" style={{ color: '#E4405F' }}></i>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {account.name && <p className="truncate text-sm font-medium text-foreground">{account.name}</p>}
                        <p className="truncate text-sm text-muted-foreground">@{account.username}</p>
                        {account.linkedPageName && (
                          <p className="truncate text-xs text-muted-foreground/70">
                            {t('settings.instagramEmbeddedSignup.page_label', 'Page:')} {account.linkedPageName}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('settings.instagramEmbeddedSignup.cancel', 'Cancel')}
          </Button>
          {instagramAccounts.length === 0 ? (
            <Button
              onClick={launchSignup}
              disabled={loading || !sdkInitialized || !canLaunchSignup || configLoading || !connectionName.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.instagramEmbeddedSignup.connecting', 'Connecting...')}
                </>
              ) : (
                <>
                  <i className="ri-facebook-fill w-4 h-4 mr-2"></i>
                  {t('settings.instagramEmbeddedSignup.connect_with_facebook', 'Connect with Facebook')}
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleConnectAccount} disabled={loading || !selectedAccountId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.instagramEmbeddedSignup.connecting', 'Connecting...')}
                </>
              ) : (
                <>
                  <i className="ri-check-line w-4 h-4 mr-2"></i>
                  {t('settings.instagramEmbeddedSignup.connect_account', 'Connect Account')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
