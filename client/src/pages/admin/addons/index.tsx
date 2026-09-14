import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Save } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Addon {
  id: number;
  key: string;
  name: string;
  description: string | null;
  unitPriceEur: string;
  unitPriceUsd: string;
  validityDays: number;
  isActive: boolean;
  stripeProductId: string | null;
  stripePriceIdEur: string | null;
  stripePriceIdUsd: string | null;
  stripeSyncStatus: "pending" | "synced" | "failed";
  stripeSyncError: string | null;
  stripeSyncedAt: string | null;
}

type SyncAction = "create_product" | "create_price_eur" | "create_price_usd" | "archive_price" | "unchanged";

type SyncResult = {
  addonId: number;
  dryRun: boolean;
  actions: SyncAction[];
  status: "synced" | "failed";
  error?: string;
};

type AddonsResponse = { csrfToken: string; addons: Addon[] };

type Draft = { unitPriceEur: string; unitPriceUsd: string; isActive: boolean };

const ACTION_LABELS: Record<SyncAction, string> = {
  create_product: "Crear producto en Stripe",
  create_price_eur: "Crear precio EUR (pago único)",
  create_price_usd: "Crear precio USD (pago único)",
  archive_price: "Archivar un precio anterior en Stripe",
  unchanged: "Sin cambios",
};

async function requestJson(method: string, url: string, csrfToken: string, data?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return body;
}

function statusBadgeVariant(status: Addon["stripeSyncStatus"]): "success" | "destructive" | "outline" {
  if (status === "synced") return "success";
  if (status === "failed") return "destructive";
  return "outline";
}

export default function AddonsPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [syncPreview, setSyncPreview] = useState<{ addonId: number; addonName: string; actions: SyncAction[] } | null>(null);

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data, isLoading: isLoadingAddons } = useQuery<AddonsResponse>({
    queryKey: ["/api/admin/addons"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/addons");
      if (!res.ok) throw new Error("Failed to fetch addons");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin,
  });

  const csrfToken = data?.csrfToken ?? "";

  useEffect(() => {
    if (!data?.addons) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const addon of data.addons) {
        if (!next[addon.id]) {
          next[addon.id] = {
            unitPriceEur: addon.unitPriceEur,
            unitPriceUsd: addon.unitPriceUsd,
            isActive: addon.isActive,
          };
        }
      }
      return next;
    });
  }, [data?.addons]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: Draft }) => {
      return requestJson("PATCH", `/api/admin/addons/${id}`, csrfToken, {
        unitPriceEur: Number(draft.unitPriceEur),
        unitPriceUsd: Number(draft.unitPriceUsd),
        isActive: draft.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addons"] });
      toast({ title: t("admin.addons.toast.saved_title", "Saved"), description: t("admin.addons.toast.saved_desc", "The add-on was updated.") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async (addon: Addon) => {
      const body = await requestJson("POST", `/api/admin/addons/${addon.id}/sync?dryRun=true`, csrfToken);
      return { addon, result: body.result as SyncResult };
    },
    onSuccess: ({ addon, result }) => {
      setSyncPreview({ addonId: addon.id, addonName: addon.name, actions: result.actions });
    },
    onError: (error: any) => {
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const body = await requestJson("POST", `/api/admin/addons/${id}/sync?dryRun=false`, csrfToken);
      return body.result as SyncResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addons"] });
      setSyncPreview(null);
      if (result.status === "failed") {
        toast({
          title: t("admin.addons.toast.sync_failed_title", "Sync failed"),
          description: result.error || t("admin.addons.toast.sync_failed_desc", "Stripe rejected the synchronization."),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("admin.addons.toast.synced_title", "Synced"),
          description: t("admin.addons.toast.synced_desc", "The Stripe catalog was updated."),
        });
      }
    },
    onError: (error: any) => {
      setSyncPreview(null);
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const updateDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">{t("admin.addons.title", "Add-ons")}</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("admin.addons.manage_title", "Manage Add-ons")}</CardTitle>
            <CardDescription>
              {t(
                "admin.addons.manage_description",
                "Edit add-on pricing and keep the Stripe catalog (products and one-time prices) in sync.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAddons ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.addons.col.name", "Add-on")}</TableHead>
                      <TableHead>{t("admin.addons.col.price_eur", "Price (EUR)")}</TableHead>
                      <TableHead>{t("admin.addons.col.price_usd", "Price (USD)")}</TableHead>
                      <TableHead>{t("admin.addons.col.active", "Active")}</TableHead>
                      <TableHead>{t("admin.addons.col.sync_status", "Stripe sync")}</TableHead>
                      <TableHead className="text-right">{t("admin.addons.col.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.addons ?? []).map((addon) => {
                      const draft = drafts[addon.id] ?? {
                        unitPriceEur: addon.unitPriceEur,
                        unitPriceUsd: addon.unitPriceUsd,
                        isActive: addon.isActive,
                      };
                      const isSavingThis = saveMutation.isPending && saveMutation.variables?.id === addon.id;
                      const isSyncingThis =
                        (dryRunMutation.isPending && dryRunMutation.variables?.id === addon.id) ||
                        (syncMutation.isPending && syncMutation.variables === addon.id);

                      return (
                        <TableRow key={addon.id}>
                          <TableCell>
                            <div className="font-medium">{addon.name}</div>
                            {addon.description && (
                              <div className="text-xs text-muted-foreground">{addon.description}</div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">{addon.key}</div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-28"
                              value={draft.unitPriceEur}
                              onChange={(e) => updateDraft(addon.id, { unitPriceEur: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-28"
                              value={draft.unitPriceUsd}
                              onChange={(e) => updateDraft(addon.id, { unitPriceUsd: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={draft.isActive}
                              onCheckedChange={(checked) => updateDraft(addon.id, { isActive: checked })}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(addon.stripeSyncStatus)}>
                              {addon.stripeSyncStatus}
                            </Badge>
                            {addon.stripeSyncStatus === "failed" && addon.stripeSyncError && (
                              <div className="text-xs text-destructive mt-1 max-w-[220px]">{addon.stripeSyncError}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSavingThis || !csrfToken}
                                onClick={() => saveMutation.mutate({ id: addon.id, draft })}
                              >
                                {isSavingThis ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                                <span className="ml-2">{t("admin.addons.save", "Guardar")}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="brand"
                                className="btn-brand-primary"
                                disabled={isSyncingThis || !csrfToken}
                                onClick={() => dryRunMutation.mutate(addon)}
                              >
                                {isSyncingThis ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                                <span className="ml-2">{t("admin.addons.sync", "Sincronizar con Stripe")}</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={syncPreview !== null} onOpenChange={(open) => !open && setSyncPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin.addons.sync_confirm_title", "Confirm Stripe sync for {{name}}", { name: syncPreview?.addonName ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">
                  {t("admin.addons.sync_confirm_desc", "This will make the following changes in Stripe:")}
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {(syncPreview?.actions ?? []).map((action, index) => (
                    <li key={`${action}-${index}`}>{ACTION_LABELS[action] ?? action}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.addons.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={syncMutation.isPending}
              onClick={() => syncPreview && syncMutation.mutate(syncPreview.addonId)}
            >
              {syncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("admin.addons.confirm_sync", "Sincronizar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
