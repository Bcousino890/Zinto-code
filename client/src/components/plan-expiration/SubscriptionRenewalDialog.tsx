import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, CreditCard, Calendar, Loader2, CheckCircle, Copy, Check } from 'lucide-react';
import { PaymentMethodSelector } from '../settings/PaymentMethodSelector';
import { usePaymentMethods } from '@/hooks/use-payment-methods';

import { useAvailablePlans } from '@/hooks/use-available-plans';
import { useGeneralSettings } from '@/hooks/use-general-settings';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { getPlanBillingPeriod, formatPlanDurationForDisplay } from '@/utils/plan-duration';
import { useCurrency } from '@/contexts/currency-context';

interface SubscriptionRenewalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  expirationDate?: string;
  gracePeriodEnd?: string;
  isInGracePeriod?: boolean;
  planName?: string;
  planPrice?: number;
  currentPlanId?: number;
}

export default function SubscriptionRenewalDialog({
  isOpen,
  onClose,
  companyName,
  expirationDate,
  gracePeriodEnd,
  isInGracePeriod = false,
  planName = "Current Plan",
  planPrice = 0,
  currentPlanId
}: SubscriptionRenewalDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [enableAutoRenewal, setEnableAutoRenewal] = useState(false);
  const [showBankTransferInstructions, setShowBankTransferInstructions] = useState(false);
  const [bankTransferDetails, setBankTransferDetails] = useState<any>(null);
  const { paymentMethods, isLoading: loadingMethods } = usePaymentMethods();
  const { plans, isLoading: loadingPlans } = useAvailablePlans();
  const { settings: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();


  React.useEffect(() => {
    if (currentPlanId && !selectedPlanId) {
      setSelectedPlanId(currentPlanId);
    } else if (!currentPlanId && plans.length > 0 && !selectedPlanId) {

      setSelectedPlanId(plans[0].id);
    }
  }, [currentPlanId, plans, selectedPlanId]);


  const renewalMutation = useMutation({
    mutationFn: async ({ paymentMethod }: { paymentMethod: string }) => {
      if (!selectedPlanId) {
        throw new Error("Please select a plan to continue");
      }

      const res = await apiRequest("POST", "/api/enhanced-subscription/initiate-renewal", {
        paymentMethod,
        enableAutoRenewal,
        planId: selectedPlanId,
        originUrl: window.location.origin
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to initiate renewal");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.paymentUrl) {

        window.location.href = data.paymentUrl;
      } else if (data.success && selectedMethod === 'bank-transfer') {

        setBankTransferDetails(data);
        setShowBankTransferInstructions(true);
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('plan_expiration.subscription_renewal_dialog.renewal_failed_title', 'Renewal Failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleRenewal = () => {

    if (!generalSettings.planRenewalEnabled) {
      toast({
        title: t('plan_expiration.subscription_renewal_dialog.renewal_disabled_title', 'Plan Renewal Disabled'),
        description: t('plan_expiration.subscription_renewal_dialog.renewal_disabled_description', 'Plan renewal has been disabled by the administrator. Please contact support for assistance.'),
        variant: "destructive",
      });
      return;
    }

    if (!selectedMethod) {
      toast({
        title: t('plan_expiration.subscription_renewal_dialog.payment_method_required_title', 'Payment Method Required'),
        description: t('plan_expiration.subscription_renewal_dialog.payment_method_required_description', 'Please select a payment method to continue.'),
        variant: "destructive",
      });
      return;
    }

    renewalMutation.mutate({ paymentMethod: selectedMethod });
  };

  const handleSetupAutoRenewal = () => {

    window.location.href = '/settings/billing';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('plan_expiration.subscription_renewal_dialog.copied_to_clipboard', 'Copied to clipboard'),
      description: t('plan_expiration.subscription_renewal_dialog.information_copied', 'The information has been copied to your clipboard.'),
    });
  };

  const handleBankTransferComplete = () => {
    setShowBankTransferInstructions(false);
    setBankTransferDetails(null);
    onClose();
    toast({
      title: t('plan_expiration.subscription_renewal_dialog.payment_instructions_received', 'Payment Instructions Received'),
      description: t('plan_expiration.subscription_renewal_dialog.complete_bank_transfer', 'Please complete the bank transfer. Your subscription will be renewed once payment is confirmed.'),
    });
  };

  if (!isOpen) return null;


  if (!isLoadingSettings && !generalSettings.planRenewalEnabled) {
    return null;
  }

  if (showBankTransferInstructions && bankTransferDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              {t('plan_expiration.subscription_renewal_dialog.bank_transfer_instructions_title', 'Bank Transfer Instructions - Subscription Renewal')}
            </DialogTitle>
            <DialogDescription>
              {t('plan_expiration.subscription_renewal_dialog.bank_transfer_instructions_desc', 'Please transfer the exact amount to the following bank account. Your subscription will be renewed once we confirm the payment.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('plan_expiration.subscription_renewal_dialog.renewal_payment_details', 'Renewal Payment Details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="font-semibold">{t('plan_expiration.subscription_renewal_dialog.amount_label', 'Amount:')}</span>
                  <span className="text-lg font-bold">
                    {formatCurrency(selectedPlanId ? Number(plans.find(p => p.id === selectedPlanId)?.price || 0) : planPrice)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="font-semibold">{t('plan_expiration.subscription_renewal_dialog.plan_label', 'Plan:')}</span>
                  <span className="font-medium">
                    {selectedPlanId ? plans.find(p => p.id === selectedPlanId)?.name || planName : planName}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.account_name_label', 'Account Name')}</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm">
                      {bankTransferDetails.bankDetails?.accountName}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.accountName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.account_number_label', 'Account Number')}</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                      {bankTransferDetails.bankDetails?.accountNumber}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.accountNumber)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.bank_name_label', 'Bank Name')}</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm">
                      {bankTransferDetails.bankDetails?.bankName}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.bankName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {bankTransferDetails.bankDetails?.routingNumber && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.routing_number_label', 'Routing Number')}</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                        {bankTransferDetails.bankDetails.routingNumber}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(bankTransferDetails.bankDetails.routingNumber)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {bankTransferDetails.bankDetails?.swiftCode && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.swift_code_label', 'SWIFT Code')}</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                        {bankTransferDetails.bankDetails.swiftCode}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(bankTransferDetails.bankDetails.swiftCode)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.payment_reference_label', 'Payment Reference')}</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm font-mono">
                      {bankTransferDetails.bankDetails?.reference}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.reference)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('plan_expiration.subscription_renewal_dialog.include_reference_note', '⚠️ Please include this reference in your transfer to ensure quick processing')}
                  </p>
                </div>

                {bankTransferDetails.bankDetails?.instructions && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.additional_instructions_label', 'Additional Instructions')}</Label>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                      {bankTransferDetails.bankDetails.instructions}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-medium text-amber-800 mb-2">{t('plan_expiration.subscription_renewal_dialog.important_notes_title', 'Important Notes:')}</h4>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>{t('plan_expiration.subscription_renewal_dialog.note_transfer_exact_amount', '• Please transfer the exact amount shown above')}</li>
                <li>{t('plan_expiration.subscription_renewal_dialog.note_include_reference', '• Include the payment reference in your transfer')}</li>
                <li>{t('plan_expiration.subscription_renewal_dialog.note_processing_time', '• Processing may take 1-3 business days')}</li>
                <li>{t('plan_expiration.subscription_renewal_dialog.note_renewal_on_verify', '• Your subscription will be renewed once payment is verified')}</li>
                <li>{t('plan_expiration.subscription_renewal_dialog.note_email_confirmation', '• You\'ll receive an email confirmation once payment is processed')}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('plan_expiration.subscription_renewal_dialog.close_button', 'Close')}
            </Button>
            <Button onClick={handleBankTransferComplete}>
              {t('plan_expiration.subscription_renewal_dialog.made_transfer_button', 'I\'ve Made the Transfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className={`w-6 h-6 ${isInGracePeriod ? 'text-amber-500' : 'text-red-500'}`} />
            <div>
              <DialogTitle>
                {isInGracePeriod ? t('plan_expiration.subscription_renewal_dialog.expired_grace_title', 'Subscription Expired - Grace Period') : t('plan_expiration.subscription_renewal_dialog.expired_title', 'Subscription Expired')}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t('plan_expiration.subscription_renewal_dialog.renew_to_continue', 'Renew your subscription to continue using all features')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.subscription_status_title', 'Subscription Status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('plan_expiration.subscription_renewal_dialog.company_label', 'Company:')}</span>
                <span className="font-medium">{companyName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('plan_expiration.subscription_renewal_dialog.plan_label_status', 'Plan:')}</span>
                <span className="font-medium">{planName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('plan_expiration.subscription_renewal_dialog.expired_on_label', 'Expired on:')}</span>
                <span className="font-medium">
                  {expirationDate ? new Date(expirationDate).toLocaleDateString() : t('plan_expiration.subscription_renewal_dialog.recently', 'Recently')}
                </span>
              </div>
              {isInGracePeriod && gracePeriodEnd && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('plan_expiration.subscription_renewal_dialog.grace_period_ends_label', 'Grace period ends:')}</span>
                  <span className="font-medium text-amber-600">
                    {new Date(gracePeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Alert */}
          {isInGracePeriod ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-amber-800 text-sm">
                <strong>{t('plan_expiration.subscription_renewal_dialog.grace_period_active_label', 'Grace Period Active:')}</strong> {t('plan_expiration.subscription_renewal_dialog.grace_period_active_message', 'You have limited access until {{date}}. Renew now to restore full functionality.', { date: gracePeriodEnd ? new Date(gracePeriodEnd).toLocaleDateString() : 'soon' })}
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">
                <strong>{t('plan_expiration.subscription_renewal_dialog.access_restricted_label', 'Access Restricted:')}</strong> {t('plan_expiration.subscription_renewal_dialog.access_restricted_message', 'Most features are currently disabled. Please renew your subscription to restore access.')}
              </p>
            </div>
          )}

          {/* Plan Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('plan_expiration.subscription_renewal_dialog.select_plan_title', 'Select Subscription Plan')}</CardTitle>
              <CardDescription className="text-xs">
                {t('plan_expiration.subscription_renewal_dialog.select_plan_description', 'Choose a plan to renew your subscription. You can upgrade, downgrade, or keep your current plan.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPlans ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">{t('plan_expiration.subscription_renewal_dialog.loading_plans', 'Loading plans...')}</span>
                </div>
              ) : (
                <RadioGroup
                  value={selectedPlanId?.toString() || ""}
                  onValueChange={(value) => setSelectedPlanId(parseInt(value))}
                  className="space-y-3"
                >
                  {plans.map((plan) => {
                    const isCurrentPlan = plan.id === currentPlanId;

                    return (
                      <div key={plan.id} className="flex items-center space-x-3">
                        <RadioGroupItem value={plan.id.toString()} id={`plan-${plan.id}`} />
                        <Label
                          htmlFor={`plan-${plan.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <Card className={`transition-all ${selectedPlanId === plan.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{plan.name}</h4>
                                    {isCurrentPlan && (
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                        {t('plan_expiration.subscription_renewal_dialog.current_plan_badge', 'Current Plan')}
                                      </span>
                                    )}
                                    {selectedPlanId === plan.id && (
                                      <Check className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {plan.description}
                                  </p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    <span>{plan.maxUsers} users</span>
                                    <span>{plan.maxContacts.toLocaleString()} contacts</span>
                                    <span>{plan.maxChannels} channels</span>
                                    <span>{plan.maxFlows} flows</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xl font-bold">
                                    {formatCurrency(Number(plan.price))}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {getPlanBillingPeriod(plan)}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}

              {selectedPlanId && (() => {
                const selectedPlan = plans.find(p => p.id === selectedPlanId);
                return selectedPlan ? (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">{t('plan_expiration.subscription_renewal_dialog.selected_plan_total_label', 'Selected Plan Total:')}</span>
                      <div className="text-right">
                        <span className="font-bold">
                          {formatCurrency(Number(selectedPlan.price))}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {getPlanBillingPeriod(selectedPlan)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </CardContent>
          </Card>

          {/* Payment Method Selection */}
          <div>
            <h3 className="text-sm font-medium mb-3">{t('plan_expiration.subscription_renewal_dialog.select_payment_method_title', 'Select Payment Method')}</h3>
            {loadingMethods ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">{t('plan_expiration.subscription_renewal_dialog.loading_payment_methods', 'Loading payment methods...')}</span>
              </div>
            ) : (
              <PaymentMethodSelector
                paymentMethods={paymentMethods}
                selectedMethod={selectedMethod}
                onSelectMethod={setSelectedMethod}
              />
            )}
          </div>

          {/* Auto-renewal option */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enableAutoRenewal"
              checked={enableAutoRenewal}
              onChange={(e) => setEnableAutoRenewal(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="enableAutoRenewal" className="text-sm text-gray-700 cursor-pointer">
              {t('plan_expiration.subscription_renewal_dialog.auto_renewal_label', 'Enable automatic renewal to prevent future interruptions')}
            </label>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleSetupAutoRenewal}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            {t('plan_expiration.subscription_renewal_dialog.setup_auto_renewal_button', 'Setup Auto-Renewal')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('plan_expiration.subscription_renewal_dialog.cancel_button', 'Cancel')}
            </Button>
            <Button
              onClick={handleRenewal}
              disabled={!selectedMethod || !selectedPlanId || renewalMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {renewalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('plan_expiration.subscription_renewal_dialog.processing', 'Processing...')}
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {t('plan_expiration.subscription_renewal_dialog.renew_subscription_button', 'Renew Subscription')}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
