import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlans } from "@/hooks/use-plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/contexts/currency-context";

const companySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  logo: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  planId: z.number().int().min(1, "Plan is required"),
  maxUsers: z.number().int().min(1, "Must have at least 1 user")
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function NewCompanyPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { plans, isLoading: isLoadingPlans } = usePlans();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    if (!isLoadingAuth && user && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, isLoadingAuth, navigate]);

  const defaultPlan = plans.find(p => p.name.toLowerCase() === 'free') || plans[0];

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      slug: "",
      logo: "",
      primaryColor: "#333235",
      planId: defaultPlan?.id || 0,
      maxUsers: defaultPlan?.maxUsers || 5
    }
  });

  useEffect(() => {
    if (plans.length > 0 && !form.getValues().planId) {
      const defaultPlan = plans.find(p => p.name.toLowerCase() === 'free') || plans[0];
      form.setValue('planId', defaultPlan.id);
      form.setValue('maxUsers', defaultPlan.maxUsers);
    }
  }, [plans, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      const res = await apiRequest("POST", "/api/admin/companies", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create company");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const selectedPlan = plans.find(p => p.id === form.getValues().planId);
      const planName = selectedPlan?.name || 'Unknown';

      toast({
        title: "Company created",
        description: `The company has been created successfully with ${planName} plan. Subscription is now ${data.subscriptionStatus || 'active'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      navigate(`/admin/companies/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: CompanyFormValues) => {
    createMutation.mutate(data);
  };

  if (isLoadingAuth) {
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
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/admin/dashboard")} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl">Create New Company</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>
              Enter the details for the new company
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormDescription>
                          Used for URL and identification
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="logo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo URL</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-8 h-8 rounded-full border cursor-pointer"
                            style={{ backgroundColor: field.value }}
                            onClick={() => {
                              const colorInput = document.getElementById('primaryColorPicker') as HTMLInputElement;
                              if (colorInput) colorInput.click();
                            }}
                            title="Pick a color"
                          />
                          <FormControl>
                            <Input
                              id="primaryColorPicker"
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="w-12 h-10 p-1 border rounded cursor-pointer"
                              style={{ minWidth: 0, padding: 0 }}
                              tabIndex={-1}
                            />
                          </FormControl>
                          <FormControl>
                            <Input
                              {...field}
                              type="text"
                              placeholder="#333235"
                              className="w-28"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="planId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(parseInt(value));
                            const selectedPlan = plans.find(p => p.id === parseInt(value));
                            if (selectedPlan) {
                              form.setValue('maxUsers', selectedPlan.maxUsers);
                            }
                          }}
                          value={field.value?.toString() || ""}
                          disabled={isLoadingPlans || plans.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPlans ? (
                              <SelectItem value="loading" disabled>
                                <div className="flex items-center">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Loading plans...
                                </div>
                              </SelectItem>
                            ) : plans.length === 0 ? (
                              <SelectItem value="none" disabled>No plans available</SelectItem>
                            ) : (
                              plans.filter(plan => plan.isActive).map((plan) => (
                                <SelectItem key={plan.id} value={plan.id.toString()}>
                                  {plan.name} ({formatCurrency(plan.price)}/month)
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {field.value ? (
                            <>
                              {plans.find(p => p.id === field.value)?.description || ""}
                            </>
                          ) : "Select a subscription plan for this company"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxUsers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Users</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Create Company
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
