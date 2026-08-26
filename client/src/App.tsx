import React from "react";
import { Switch, Route, useLocation } from "wouter";
import Sidebar from "@/components/layout/Sidebar";
import { needsPersistentSidebar } from "@/lib/main-app-sidebar-routes";
import { AppSidebarChromeProvider, useAppSidebarChrome } from "@/contexts/AppSidebarChromeContext";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Inbox from "@/pages/Inbox";
import Flows from "@/pages/flows";
import FlowBuilder from "@/pages/flow-builder";
import Contacts from "@/pages/contacts";
import Tasks from "@/pages/tasks";
import Calendar from "@/pages/calendar";
import MyCalendarSettings from "@/pages/my-calendar-settings";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import SubscriptionGuard from "@/components/plan-expiration/SubscriptionGuard";
import { suppressAuthErrors } from "@/utils/suppress-auth-errors";

declare global {
  interface Window {
    isEmbedded?: boolean;
  }
}
import CampaignsPage from "@/pages/campaigns";
import CampaignBuilderPage from "@/pages/campaign-builder";
const EmailCampaignBuilderPage = React.lazy(() => import("@/pages/email-campaign-builder"));
import PipelineView from "@/pages/pipeline-view";
import AuthPage from "@/pages/auth-page";
import CompanyRegistrationPage from "@/pages/company-registration";
import AdminLoginPage from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import CompanyDetailPage from "@/pages/admin/companies/[id]";
import NewCompanyPage from "@/pages/admin/companies/new";
import { FacebookSDKLoader } from "@/components/FacebookSDKLoader";
import { ConversationProvider } from "./context/ConversationContext";
import { AuthProvider } from "@/hooks/use-auth";
import { TranslationProvider } from "@/hooks/use-translation";
import { BrandingProvider } from "@/contexts/branding-context";
import { CurrencyProvider } from "@/contexts/currency-context";
import { SubdomainProvider } from "@/contexts/subdomain-context";
import { PlanUpdatesProvider } from "@/components/PlanUpdatesProvider";
import { ActiveChannelProvider } from "@/contexts/ActiveChannelContext";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminProtectedRoute } from "@/lib/admin-protected-route";
import {
  SettingsRoute,
  AnalyticsRoute,
  FlowsRoute,
  ContactsRoute,
  TasksRoute,
  PipelineRoute,
  CalendarRoute,
  CampaignsRoute,
  PagesRoute,
  TemplatesRoute,
  CallLogsRoute,
  ReportsRoute,
  CapturedDataRoute,
  ERPProductsRoute,
  ERPInventoryRoute,
  ERPSalesOrdersRoute,
  ERPSuppliersRoute,
  ERPPurchaseOrdersRoute,
  ERPInvoicesRoute,
  ERPAccountingRoute,
  ERPEmployeesRoute,
  ERPHRRoute,
  ERPPayrollRoute,
  ERPSettingsRoute,
  ERPDashboardRoute,
  ERPReportsRoute,
  RestaurantFloorRoute,
  RestaurantPOSRoute,
  RestaurantReservationsRoute,
  RestaurantDeliveryRoute,
  RestaurantKitchenRoute,
  RestaurantDispatchRoute,
  RestaurantTableFloorsRoute,
  DentalPatientsRoute,
  DentalScheduleRoute,
  DentalChartRoute,
  DentalTreatmentPlansRoute,
} from "@/components/auth/ProtectedRoute";
import AccessDenied from "@/pages/AccessDenied";

import { Loader2 } from "lucide-react";
import PagesPage from "./pages/pages";
import LandingPage from "./pages/landing";
import ProtectedLandingPage from "./components/ProtectedLandingPage";
import Templates from "./pages/templates";
import CallLogsPage from "./pages/call-logs";
import ReportsPage from "@/pages/reports";
import RootRedirect from "./components/RootRedirect";
import { CustomScriptsProvider } from "@/components/CustomScriptsProvider";
import { CustomCssProvider } from "@/components/CustomCssProvider";
import { CompanyCustomJsProvider } from "@/components/CompanyCustomJsProvider";
import { ManualRenewalProvider } from "@/contexts/manual-renewal-context";
import { initializeGoogleTranslateCompatibility } from "@/utils/google-translate-compatibility";
import { initializeEmbedContext, preserveEmbedParam } from "@/utils/embed-context";

const CapturedDataPage = React.lazy(() => import("@/pages/captured-data"));
const ERPProductsPage = React.lazy(() => import("@/pages/erp/products"));
const ERPInventoryPage = React.lazy(() => import("@/pages/erp/inventory"));
const ERPSalesOrdersPage = React.lazy(() => import("@/pages/erp/sales-orders"));
const ERPSuppliersPage = React.lazy(() => import("@/pages/erp/suppliers"));
const ERPPurchaseOrdersPage = React.lazy(() => import("@/pages/erp/purchase-orders"));
const ERPInvoicesPage = React.lazy(() => import("@/pages/erp/invoices"));
const ERPAccountingPage = React.lazy(() => import("@/pages/erp/accounting"));
const ERPEmployeesPage = React.lazy(() => import("@/pages/erp/employees"));
const ERPHRPage = React.lazy(() => import("@/pages/erp/hr"));
const ERPPayrollPage = React.lazy(() => import("@/pages/erp/payroll"));
const ERPSettingsPage = React.lazy(() => import("@/pages/erp/settings"));
const ERPDashboardPage = React.lazy(() => import("@/pages/erp/dashboard"));
const ERPReportsPage = React.lazy(() => import("@/pages/erp/reports"));
const RestaurantFloorPage = React.lazy(() => import("@/pages/erp/restaurant/floor.tsx"));
const RestaurantPOSPage = React.lazy(() => import("@/pages/erp/restaurant/pos.tsx"));
const RestaurantReservationsPage = React.lazy(() => import("@/pages/erp/restaurant/reservations.tsx"));
const RestaurantDeliveryPage = React.lazy(() => import("@/pages/erp/restaurant/delivery.tsx"));
const RestaurantKitchenPage = React.lazy(() => import("@/pages/erp/restaurant/kitchen"));
const RestaurantDispatchPage = React.lazy(() => import("@/pages/erp/restaurant/dispatch"));
const RestaurantTableFloorsPage = React.lazy(() => import("@/pages/erp/restaurant/table-floors"));
const RestaurantQROrderPage = React.lazy(() => import("@/pages/erp/restaurant/qr-order.tsx"));
const DentalPatientsPage = React.lazy(() => import("@/pages/erp/dental/patients"));
const DentalPatientDetailPage = React.lazy(() => import("@/pages/erp/dental/patient-detail"));
const DentalSchedulePage = React.lazy(() => import("@/pages/erp/dental/schedule"));
const DentalBookingSettingsPage = React.lazy(() => import("@/pages/erp/dental/booking-settings"));
const DentalChartPage = React.lazy(() => import("@/pages/erp/dental/chart"));
const DentalTreatmentPlansPage = React.lazy(() => import("@/pages/erp/dental/treatment-plans"));

const EmailInterfacePage = React.lazy(() => import("@/pages/EmailInterface"));
const ForgotPasswordPage = React.lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = React.lazy(() => import("@/pages/reset-password"));
const AffiliateApplicationPage = React.lazy(() => import("@/pages/affiliate-application"));
const AdminIndexPage = React.lazy(() => import("@/pages/admin/index"));
const AdminForgotPasswordPage = React.lazy(() => import("@/pages/admin/forgot-password"));
const AdminResetPasswordPage = React.lazy(() => import("@/pages/admin/reset-password"));
const AdminCompaniesPage = React.lazy(() => import("@/pages/admin/companies"));
const AdminUsersPage = React.lazy(() => import("@/pages/admin/users"));
const AdminUsersNewPage = React.lazy(() => import("@/pages/admin/users/new"));
const AdminUserDetailPage = React.lazy(() => import("@/pages/admin/users/[id]"));
const AdminPlansPage = React.lazy(() => import("@/pages/admin/plans"));
const AdminCouponsPage = React.lazy(() => import("@/pages/admin/coupons"));
const AdminPaymentsPage = React.lazy(() => import("@/pages/admin/payments"));
const AdminAnalyticsPage = React.lazy(() => import("@/pages/admin/analytics"));
const AdminSettingsPage = React.lazy(() => import("@/pages/admin/settings"));
const AdminTranslationsPage = React.lazy(() => import("@/pages/admin/translations"));
const AdminWebsiteBuilderPage = React.lazy(() => import("@/pages/admin/website-builder/index"));
const AdminWebsiteBuilderNewPage = React.lazy(() => import("@/pages/admin/website-builder/new"));
const AdminWebsiteBuilderEditPage = React.lazy(() => import("@/pages/admin/website-builder/edit/[id]"));
const AdminAffiliatePage = React.lazy(() => import("@/pages/admin/affiliate"));
const PaymentSuccessPage = React.lazy(() => import("@/pages/payment/success"));
const PaymentCancelPage = React.lazy(() => import("@/pages/payment/cancel"));
const PaymentPendingPage = React.lazy(() => import("@/pages/payment/pending"));
const PublicWebsitePage = React.lazy(() => import("@/pages/public-website"));

const LazyLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function AppRoutesWithLayout() {
  const [location] = useLocation();
  const { hideMainSidebar, setHideMainSidebar } = useAppSidebarChrome();
  const showSidebarChrome = needsPersistentSidebar(location) && !hideMainSidebar;
  const isInboxRoute = location === "/inbox" || location === "/inbox/embed" || /^\/[^/]+\/inbox\/embed$/.test(location);

  useEffect(() => {
    if (!isInboxRoute) {
      setHideMainSidebar(false);
    }
  }, [isInboxRoute, setHideMainSidebar]);

  const switchEl = (
    <Switch>
        <Route path="/" component={RootRedirect} />
        <ProtectedRoute path="/:companySlug/inbox/embed" component={Inbox} />
        <ProtectedRoute path="/inbox/embed" component={Inbox} />
        <ProtectedRoute path="/inbox" component={Inbox} />
        <ProtectedRoute path="/email/:channelId" component={EmailInterfacePage} />


        <Route path="/flows">
          <FlowsRoute>
            <Flows />
          </FlowsRoute>
        </Route>
        <Route path="/flows/new">
          <FlowsRoute>
            <FlowBuilder />
          </FlowsRoute>
        </Route>
        <Route path="/flows/:id">
          <FlowsRoute>
            <FlowBuilder />
          </FlowsRoute>
        </Route>
        <Route path="/contacts">
          <ContactsRoute>
            <Contacts />
          </ContactsRoute>
        </Route>

        <Route path="/tasks">
          <TasksRoute>
            <Tasks />
          </TasksRoute>
        </Route>

        <Route path="/pipeline">
          <PipelineRoute>
            <PipelineView />
          </PipelineRoute>
        </Route>

        <Route path="/calendar">
          <CalendarRoute>
            <Calendar />
          </CalendarRoute>
        </Route>

        <Route path="/my-calendar">
          <CalendarRoute>
            <MyCalendarSettings />
          </CalendarRoute>
        </Route>

        <Route path="/campaigns">
          <CampaignsRoute>
            <CampaignsPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/new">
          <CampaignsRoute>
            <CampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/:id/edit">
          <CampaignsRoute>
            <CampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/email/new">
          <CampaignsRoute>
            <EmailCampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/email/:id/edit">
          <CampaignsRoute>
            <EmailCampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/:id">
          <CampaignsRoute>
            <CampaignsPage />
          </CampaignsRoute>
        </Route>

        <Route path="/call-logs">
          <CallLogsRoute>
            <CallLogsPage />
          </CallLogsRoute>
        </Route>

        <Route path="/templates">
          <TemplatesRoute>
            <Templates />
          </TemplatesRoute>
        </Route>

        <Route path="/analytics">
          <AnalyticsRoute>
            <Analytics />
          </AnalyticsRoute>
        </Route>

        <Route path="/reports">
          <ReportsRoute>
            <ReportsPage />
          </ReportsRoute>
        </Route>

        <Route path="/captured-data">
          <CapturedDataRoute>
            <CapturedDataPage />
          </CapturedDataRoute>
        </Route>

        <Route path="/erp/dashboard">
          <ERPDashboardRoute>
            <ERPDashboardPage />
          </ERPDashboardRoute>
        </Route>

        <Route path="/erp/reports">
          <ERPReportsRoute>
            <ERPReportsPage />
          </ERPReportsRoute>
        </Route>

        <Route path="/erp/products">
          <ERPProductsRoute>
            <ERPProductsPage />
          </ERPProductsRoute>
        </Route>

        <Route path="/erp/sales-orders">
          <ERPSalesOrdersRoute>
            <ERPSalesOrdersPage />
          </ERPSalesOrdersRoute>
        </Route>

        <Route path="/erp/restaurant/floor">
          <RestaurantFloorRoute>
            <RestaurantFloorPage />
          </RestaurantFloorRoute>
        </Route>

        <Route path="/erp/restaurant/pos">
          <RestaurantPOSRoute>
            <RestaurantPOSPage />
          </RestaurantPOSRoute>
        </Route>

        <Route path="/erp/restaurant/reservations">
          <RestaurantReservationsRoute>
            <RestaurantReservationsPage />
          </RestaurantReservationsRoute>
        </Route>

        <Route path="/erp/restaurant/delivery">
          <RestaurantDeliveryRoute>
            <RestaurantDeliveryPage />
          </RestaurantDeliveryRoute>
        </Route>

        <Route path="/erp/restaurant/kitchen">
          <RestaurantKitchenRoute>
            <RestaurantKitchenPage />
          </RestaurantKitchenRoute>
        </Route>

        <Route path="/erp/restaurant/dispatch">
          <RestaurantDispatchRoute>
            <RestaurantDispatchPage />
          </RestaurantDispatchRoute>
        </Route>
        <Route path="/erp/restaurant/table-floors">
          <RestaurantTableFloorsRoute>
            <RestaurantTableFloorsPage />
          </RestaurantTableFloorsRoute>
        </Route>

        <Route path="/erp/dental/patients/:contactId">
          <DentalPatientsRoute>
            <DentalPatientDetailPage />
          </DentalPatientsRoute>
        </Route>
        <Route path="/erp/dental/patients">
          <DentalPatientsRoute>
            <DentalPatientsPage />
          </DentalPatientsRoute>
        </Route>
        <Route path="/erp/dental/schedule">
          <DentalScheduleRoute>
            <DentalSchedulePage />
          </DentalScheduleRoute>
        </Route>
        <Route path="/erp/dental/booking-settings">
          <DentalScheduleRoute>
            <DentalBookingSettingsPage />
          </DentalScheduleRoute>
        </Route>
        <Route path="/erp/dental/chart">
          <DentalChartRoute>
            <DentalChartPage />
          </DentalChartRoute>
        </Route>
        <Route path="/erp/dental/treatment-plans">
          <DentalTreatmentPlansRoute>
            <DentalTreatmentPlansPage />
          </DentalTreatmentPlansRoute>
        </Route>

        <Route path="/erp/inventory">
          <ERPInventoryRoute>
            <ERPInventoryPage />
          </ERPInventoryRoute>
        </Route>

        <Route path="/erp/suppliers">
          <ERPSuppliersRoute>
            <ERPSuppliersPage />
          </ERPSuppliersRoute>
        </Route>
        <Route path="/erp/purchase-orders">
          <ERPPurchaseOrdersRoute>
            <ERPPurchaseOrdersPage />
          </ERPPurchaseOrdersRoute>
        </Route>

        <Route path="/erp/invoices">
          <ERPInvoicesRoute>
            <ERPInvoicesPage />
          </ERPInvoicesRoute>
        </Route>

        <Route path="/erp/accounting">
          <ERPAccountingRoute>
            <ERPAccountingPage />
          </ERPAccountingRoute>
        </Route>

        <Route path="/erp/employees">
          <ERPEmployeesRoute>
            <ERPEmployeesPage />
          </ERPEmployeesRoute>
        </Route>

        <Route path="/erp/hr">
          <ERPHRRoute>
            <ERPHRPage />
          </ERPHRRoute>
        </Route>

        <Route path="/erp/payroll">
          <ERPPayrollRoute>
            <ERPPayrollPage />
          </ERPPayrollRoute>
        </Route>

        <Route path="/erp/settings">
          <ERPSettingsRoute>
            <ERPSettingsPage />
          </ERPSettingsRoute>
        </Route>

        <Route path="/settings">
          <SettingsRoute>
            <Settings />
          </SettingsRoute>
        </Route>

        <Route path="/pages">
          <PagesRoute>
            <PagesPage />
          </PagesRoute>
        </Route>


        <ProtectedRoute path="/profile" component={ProfilePage} />

        <Route path="/access-denied" component={AccessDenied} />

        {/* Public landing page */}
        <Route path="/landing" component={ProtectedLandingPage} />

        <Route path="/auth" component={AuthPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/register" component={CompanyRegistrationPage} />
        <Route path="/signup" component={CompanyRegistrationPage} />
        <Route path="/affiliate-apply" component={AffiliateApplicationPage} />
        <Route path="/become-partner" component={AffiliateApplicationPage} />
        <Route path="/admin" component={AdminIndexPage} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin/forgot-password" component={AdminForgotPasswordPage} />
        <Route path="/admin/reset-password" component={AdminResetPasswordPage} />

        <AdminProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
        <AdminProtectedRoute path="/admin/companies" component={AdminCompaniesPage} />
        <AdminProtectedRoute path="/admin/companies/new" component={NewCompanyPage} />
        <AdminProtectedRoute path="/admin/companies/:id" component={CompanyDetailPage} />
        <AdminProtectedRoute path="/admin/users" component={AdminUsersPage} />
        <AdminProtectedRoute path="/admin/users/new" component={AdminUsersNewPage} />
        <AdminProtectedRoute path="/admin/users/:id" component={AdminUserDetailPage} />
        <AdminProtectedRoute path="/admin/plans" component={AdminPlansPage} />
        <AdminProtectedRoute path="/admin/coupons" component={AdminCouponsPage} />
        <AdminProtectedRoute path="/admin/payments" component={AdminPaymentsPage} />
        <AdminProtectedRoute path="/admin/analytics" component={AdminAnalyticsPage} />
        <AdminProtectedRoute path="/admin/settings" component={AdminSettingsPage} />
        <AdminProtectedRoute path="/admin/translations" component={AdminTranslationsPage} />
        <AdminProtectedRoute path="/admin/website-builder" component={AdminWebsiteBuilderPage} />
        <AdminProtectedRoute path="/admin/website-builder/new" component={AdminWebsiteBuilderNewPage} />
        <AdminProtectedRoute path="/admin/website-builder/edit/:id" component={AdminWebsiteBuilderEditPage} />

        <AdminProtectedRoute path="/admin/affiliate" component={AdminAffiliatePage} />

        <Route path="/payment/success" component={PaymentSuccessPage} />
        <Route path="/payment/cancel" component={PaymentCancelPage} />
        <Route path="/payment/pending" component={PaymentPendingPage} />
        <Route path="/restaurant/order/:token" component={RestaurantQROrderPage} />

        {/* Legacy public publishing (GrapesJS websites, company pages) — use when frontend website owns root slugs */}
        <Route path="/legacy-public/:slug" component={PublicWebsitePage} />

        {/* Frontend website managed pages at root slugs */}
        <Route path="/:slug" component={PublicWebsitePage} />

        <Route component={NotFound} />
      </Switch>
  );

  if (!showSidebarChrome) {
    // Mobile inbox hides the sidebar chrome but still needs a viewport-height
    // shell so the messages pane can scroll (iOS Safari / iPhone Pro Max).
    if (isInboxRoute) {
      return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
          {switchEl}
        </div>
      );
    }
    return switchEl;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {switchEl}
      </div>
    </div>
  );
}

function Router() {
  return (
    <AppSidebarChromeProvider>
      <React.Suspense fallback={<LazyLoadingFallback />}>
        <AppRoutesWithLayout />
      </React.Suspense>
    </AppSidebarChromeProvider>
  );
}

function App() {

  React.useEffect(() => {
    const cleanupAuthErrorSuppression = suppressAuthErrors();
    return cleanupAuthErrorSuppression;
  }, []);

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {

    initializeGoogleTranslateCompatibility();


    initializeEmbedContext();

    setTimeout(() => {
      setIsInitializing(false);
    }, 500);
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center font-poppins">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing...</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <CustomScriptsProvider>
        <SubdomainProvider>
          <AuthProvider>
            <CustomCssProvider>
              <CompanyCustomJsProvider>
                <BrandingProvider>
                  <CurrencyProvider>
                    <TranslationProvider>
                      <ActiveChannelProvider>
                        <ConversationProvider>
                          <PlanUpdatesProvider>
                            <ManualRenewalProvider>
                              <TooltipProvider>
                                <SubscriptionGuard>
                                <div className="font-poppins">
                                  <Toaster />
                                  <FacebookSDKLoader />
                                  <Router />
                                </div>
                                </SubscriptionGuard>
                              </TooltipProvider>
                            </ManualRenewalProvider>
                          </PlanUpdatesProvider>
                        </ConversationProvider>
                      </ActiveChannelProvider>
                    </TranslationProvider>
                  </CurrencyProvider>
                </BrandingProvider>
              </CompanyCustomJsProvider>
            </CustomCssProvider>
          </AuthProvider>
        </SubdomainProvider>
      </CustomScriptsProvider>
    </QueryClientProvider>
  );
}

export default App;
