import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { formatCurrency } from '@/lib/utils';
import {
  Loader2,
  AlertTriangle,
  Info,
  Users,
  MessageSquare,
  Package,
  Minus,
  Plus,
} from 'lucide-react';

// Shape of GET /api/addons/status, per the API contract this component is built against.
// `autoRenew`/`nearestExpiresAt` are aggregates across whatever addon_purchases rows are
// currently active for this addon — toggling auto-renew (below) acts on all of them at once,
// scoped by addonKey rather than by an individual purchase id.
interface AddonStatus {
  key: string;
  name: string;
  unitPrice: number;
  currency: 'EUR' | 'USD';
  activeQuantity: number;
  nearestExpiresAt: string | null;
  autoRenew: boolean;
}

interface AddonsStatusResponse {
  addons: AddonStatus[];
  /** Session CSRF token, required as `x-csrf-token` on the two state-changing calls below —
   * these move real money / enroll the company in recurring off-session charges, so (unlike most
   * read-only company routes) they're behind the same session CSRF check the admin add-on
   * catalog routes already use (see server/routes/addon-routes.ts). */
  csrfToken: string;
}

const MAX_QUANTITY = 20;
const MIN_QUANTITY = 1;

const ADDON_ICONS: Record<string, typeof Users> = {
  extra_user: Users,
  extra_whatsapp_connection: MessageSquare,
};

export function AddonsSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [autoRenewOnPurchase, setAutoRenewOnPurchase] = useState<Record<string, boolean>>({});

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<AddonsStatusResponse>({
    queryKey: ['/api/addons/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/addons/status');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t('settings.addons.fetch_error', 'Failed to load add-ons'));
      }
      return res.json();
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async (vars: { addonKey: string; quantity: number; autoRenew: boolean }) => {
      const res = await apiRequest('POST', '/api/addons/purchase', vars, {
        'x-csrf-token': data?.csrfToken ?? '',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t('settings.addons.purchase_error', 'Failed to start checkout'));
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (result) => {
      if (result?.url) {
        // Same redirect pattern as CheckoutDialog's plan-change checkout
        // (window.location.href = data.checkoutUrl) and useSubscriptionRenewal's
        // initiate-renewal flow: hand the browser to the Stripe Checkout URL.
        window.location.href = result.url;
      } else {
        toast({
          title: t('settings.addons.error_title', 'Error'),
          description: t('settings.addons.no_checkout_url', 'No checkout URL was returned by the server.'),
          variant: 'destructive',
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: t('settings.addons.error_title', 'Error'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Scoped by (company, addonKey) — applies to every currently-active purchase batch for that
  // add-on, not one purchase id (there is no single id the aggregate status view could expose
  // unambiguously; see server/services/addon-purchase-service.ts's setAddonAutoRenew).
  const autoRenewMutation = useMutation({
    mutationFn: async (vars: { addonKey: string; autoRenew: boolean }) => {
      const res = await apiRequest(
        'POST',
        `/api/addons/${vars.addonKey}/auto-renew`,
        { autoRenew: vars.autoRenew },
        { 'x-csrf-token': data?.csrfToken ?? '' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t('settings.addons.auto_renew_error', 'Failed to update auto-renew'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addons/status'] });
    },
    onError: (err: Error) => {
      toast({
        title: t('settings.addons.error_title', 'Error'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const getQuantity = (key: string) => quantities[key] ?? MIN_QUANTITY;
  const setQuantity = (key: string, next: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, next)) }));
  };
  const getAutoRenew = (key: string) => autoRenewOnPurchase[key] ?? false;
  const setAutoRenew = (key: string, next: boolean) => {
    setAutoRenewOnPurchase((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <div className="space-y-4" id="addons">
      <div>
        <h3 className="text-base sm:text-lg font-medium text-foreground">
          {t('settings.addons.title', 'Extras')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.addons.description',
            'Add extra capacity on top of your plan: extra user seats or WhatsApp connections.'
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('settings.addons.error_title', 'Error')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{(error as Error)?.message || t('settings.addons.fetch_error', 'Failed to load add-ons')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {t('common.retry', 'Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : !data?.addons?.length ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t('settings.addons.none_available', 'No add-ons available at the moment.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.addons.map((addon) => {
            const Icon = ADDON_ICONS[addon.key] ?? Package;
            const qty = getQuantity(addon.key);
            const wantsAutoRenew = getAutoRenew(addon.key);
            const isThisPurchasePending =
              purchaseMutation.isPending && purchaseMutation.variables?.addonKey === addon.key;

            return (
              <Card key={addon.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5 text-foreground" />
                    {addon.name}
                  </CardTitle>
                  <CardDescription>
                    {t('settings.addons.unit_price', '{{price}} per unit / {{days}} days', {
                      price: formatCurrency(addon.unitPrice, addon.currency),
                      days: 30,
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('settings.addons.active_quantity', 'Active quantity')}
                    </span>
                    <Badge className="bg-primary/10 text-primary border border-primary/20">
                      {addon.activeQuantity}
                    </Badge>
                  </div>

                  {addon.activeQuantity > 0 && addon.nearestExpiresAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('settings.addons.nearest_expiry', 'Next unit expires on')}
                      </span>
                      <span className="font-medium text-foreground">
                        {new Date(addon.nearestExpiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('settings.addons.quantity_label', 'Quantity')}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setQuantity(addon.key, qty - 1)}
                        disabled={qty <= MIN_QUANTITY}
                        aria-label={t('settings.addons.decrease_quantity', 'Decrease quantity')}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{qty}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setQuantity(addon.key, qty + 1)}
                        disabled={qty >= MAX_QUANTITY}
                        aria-label={t('settings.addons.increase_quantity', 'Increase quantity')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('settings.addons.subtotal', 'Subtotal')}</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(addon.unitPrice * qty, addon.currency)}
                    </span>
                  </div>

                  {/* Opting in to auto-renew at purchase time needs no purchase id — the
                      server creates the addon_purchases row (with its own id) already
                      carrying this flag, per POST /api/addons/purchase's `autoRenew` field. */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5 pr-2">
                      <div className="text-sm font-medium">
                        {t('settings.addons.auto_renew_on_purchase_label', 'Auto-renovar')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          'settings.addons.auto_renew_on_purchase_description',
                          'Automatically re-purchase this quantity every 30 days using your saved payment method.'
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={wantsAutoRenew}
                      onCheckedChange={(checked) => setAutoRenew(addon.key, checked)}
                      aria-label={t('settings.addons.auto_renew_on_purchase_label', 'Auto-renovar')}
                    />
                  </div>

                  <Button
                    className="w-full btn-brand-primary"
                    onClick={() =>
                      purchaseMutation.mutate({ addonKey: addon.key, quantity: qty, autoRenew: wantsAutoRenew })
                    }
                    disabled={purchaseMutation.isPending}
                  >
                    {isThisPurchasePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('settings.addons.buy_button', 'Comprar')}
                  </Button>

                  {/* Toggle for quota that is ALREADY active. Scoped by addonKey (not a purchase
                      id — see setAddonAutoRenew): flips auto-renew on every currently-active
                      purchase batch for this add-on at once, which matches what a customer means
                      by "keep renewing my extra users" regardless of how many separate batches
                      they bought over time. */}
                  {addon.activeQuantity > 0 && (
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5 pr-2">
                        <div className="text-sm font-medium">
                          {t('settings.addons.existing_auto_renew_label', 'Auto-renew on active quota')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            'settings.addons.existing_auto_renew_description',
                            'Applies to all currently active quota for this add-on.'
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={addon.autoRenew}
                        disabled={autoRenewMutation.isPending && autoRenewMutation.variables?.addonKey === addon.key}
                        onCheckedChange={(checked) =>
                          autoRenewMutation.mutate({ addonKey: addon.key, autoRenew: checked })
                        }
                        aria-label={t('settings.addons.existing_auto_renew_label', 'Auto-renew on active quota')}
                      />
                    </div>
                  )}

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t(
                        'settings.addons.terms',
                        'Charged immediately and valid for 30 days from confirmed payment. Non-refundable: turning auto-renew off only stops the next charge — it does not refund or end the current period early.'
                      )}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AddonsSection;
