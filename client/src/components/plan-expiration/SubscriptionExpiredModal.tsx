import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CreditCard, Calendar, RefreshCw, X } from 'lucide-react';
import { useSubscriptionStatus } from '../../hooks/useSubscriptionStatus.ts';
import { useSubscriptionRenewal } from '../../hooks/useSubscriptionRenewal.ts';
import { useTranslation } from '@/hooks/use-translation';

interface SubscriptionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  expirationDate?: string;
  gracePeriodEnd?: string;
  isInGracePeriod?: boolean;
}

export default function SubscriptionExpiredModal({
  isOpen,
  onClose,
  companyName,
  expirationDate,
  gracePeriodEnd,
  isInGracePeriod = false
}: SubscriptionExpiredModalProps) {
  const { t } = useTranslation();
  const [isRenewing, setIsRenewing] = useState(false);
  const [enableAutoRenewal, setEnableAutoRenewal] = useState(false);
  const { renewSubscription } = useSubscriptionRenewal();
  const { refetch: refetchStatus } = useSubscriptionStatus();

  const handleRenewNow = async () => {
    setIsRenewing(true);
    try {

      await renewSubscription();


    } catch (error) {
      console.error('Failed to initiate subscription renewal:', error);
      setIsRenewing(false);
    }
  };

  const handleSetupAutoRenewal = () => {

    window.location.href = '/settings/billing';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-card rounded-lg shadow-xl max-w-md w-full p-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isInGracePeriod ? t('plan_expiration.subscription_expired_modal.title_grace_period', 'Subscription Expired - Grace Period') : t('plan_expiration.subscription_expired_modal.title', 'Subscription Expired')}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="mb-6">
            {isInGracePeriod ? (
              <div className="space-y-3">
                <p className="text-gray-700">
                  {t('plan_expiration.subscription_expired_modal.expired_on', 'Your subscription for {{companyName}} expired on {{date}}.', {
                    companyName,
                    date: expirationDate ? new Date(expirationDate).toLocaleDateString() : t('plan_expiration.subscription_expired_modal.recently', 'recently'),
                  })}
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <p className="text-yellow-800 text-sm">
                    <strong>{t('plan_expiration.subscription_expired_modal.grace_period_active_label', 'Grace Period Active:')}</strong>{' '}
                    {t('plan_expiration.subscription_expired_modal.grace_period_active_body', 'You have limited access until {{date}}. Renew now to restore full functionality.', {
                      date: gracePeriodEnd ? new Date(gracePeriodEnd).toLocaleDateString() : t('plan_expiration.subscription_expired_modal.soon', 'soon'),
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-700">
                  {t('plan_expiration.subscription_expired_modal.expired_body', 'Your subscription for {{companyName}} has expired. You need to renew to continue using the service.', { companyName })}
                </p>
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-800 text-sm">
                    <strong>{t('plan_expiration.subscription_expired_modal.access_restricted_label', 'Access Restricted:')}</strong>{' '}
                    {t('plan_expiration.subscription_expired_modal.access_restricted_body', 'Most features are currently disabled. Please renew your subscription to restore access.')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* Primary Action - Renew Now */}
            <button
              onClick={handleRenewNow}
              disabled={isRenewing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
            >
              {isRenewing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('plan_expiration.subscription_expired_modal.redirecting_to_payment', 'Redirecting to Payment...')}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  {t('plan_expiration.subscription_expired_modal.pay_and_renew', 'Pay & Renew Subscription')}
                </>
              )}
            </button>

            {/* Secondary Action - Setup Auto-Renewal */}
            <button
              onClick={handleSetupAutoRenewal}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              {t('plan_expiration.subscription_expired_modal.setup_auto_renewal', 'Setup Auto-Renewal')}
            </button>

            {/* Auto-renewal checkbox */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                id="enableAutoRenewal"
                checked={enableAutoRenewal}
                onChange={(e) => setEnableAutoRenewal(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="enableAutoRenewal">
                {t('plan_expiration.subscription_expired_modal.enable_auto_renewal_label', 'Enable automatic renewal to prevent future interruptions')}
              </label>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
