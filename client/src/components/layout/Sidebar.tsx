import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions, PermissionGate, ERP_ACCESS_PERMISSIONS, ERP_DASHBOARD_ROUTE_PERMISSIONS, ERP_REPORTS_ROUTE_PERMISSIONS, type Permission } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useManualRenewal } from '@/contexts/manual-renewal-context';
import useSocket from '@/hooks/useSocket';
import TrialStatus from '@/components/TrialStatus';
import { isLifetimePlan } from '@/utils/plan-duration';
import { apiRequest } from '@/lib/queryClient';
import { useTheme } from 'next-themes';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useBranding } from '@/contexts/branding-context';
import { useConversations } from '@/context/ConversationContext';

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { setActiveChannelId, activeChannelId } = useActiveChannel();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [erpExpanded, setErpExpanded] = useState(false);
  const [utilityExpanded, setUtilityExpanded] = useState(false);
  const [, setIsMobile] = useState(false);
  const { company } = useAuth();
  const { branding } = useBranding();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { totalUnreadCount } = useConversations();
  const { data: subscriptionStatus } = useSubscriptionStatus();
  const { requestManualRenewal } = useManualRenewal();
  

  const { data: renewalStatus } = useQuery({
    queryKey: ['/api/plan-renewal/status'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plan-renewal/status");
      if (!res.ok) throw new Error("Failed to fetch renewal status");
      return res.json();
    },
    enabled: !!company, // Only run when company is available
  });


  const { data: helpSupportData } = useQuery({
    queryKey: ['/api/help-support-url'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/help-support-url");
      if (!res.ok) throw new Error("Failed to fetch help support URL");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });


  const getHelpSupportUrl = () => {
    if (helpSupportData?.helpSupportUrl) {
      return helpSupportData.helpSupportUrl;
    }

    return `https://docs.${window.location.hostname.replace(/^www\./, '')}`;
  };

  const {
    PERMISSIONS,
    hasAnyPermission,
  } = usePermissions();

  const canOpenErpDashboard = hasAnyPermission(ERP_DASHBOARD_ROUTE_PERMISSIONS);
  const { businessType: erpBusinessType } = useErpBusinessType();

  type ErpMenuItem = {
    href: string;
    icon: string;
    label: string;
    permissions: Permission[];
  };

  const standardErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const restaurantErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/restaurant/table-floors', icon: 'ri-layout-5-line', label: t('erp.restaurant.tableFloors.menuLabel', 'Table/Floors'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
      { href: '/erp/restaurant/floor', icon: 'ri-layout-grid-line', label: t('erp.restaurant.floorPlan', 'Floor Plan'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/kitchen', icon: 'ri-restaurant-2-line', label: t('erp.restaurant.kitchenDisplay', 'Kitchen Display'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/dispatch', icon: 'ri-truck-line', label: t('erp.restaurant.dispatch', 'Dispatch'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/pos', icon: 'ri-store-2-line', label: t('erp.restaurant.pos', 'POS / Cashier'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/restaurant/reservations', icon: 'ri-calendar-check-line', label: t('erp.restaurant.reservations', 'Reservations'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/restaurant/delivery', icon: 'ri-e-bike-2-line', label: t('erp.restaurant.delivery', 'Delivery'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const dentalErpMenuItems = useMemo<ErpMenuItem[]>(
    () => [
      { href: '/erp/dashboard', icon: 'ri-dashboard-line', label: t('erp.dashboard.title', 'Dashboard'), permissions: ERP_DASHBOARD_ROUTE_PERMISSIONS },
      { href: '/erp/dental/patients', icon: 'ri-user-heart-line', label: t('erp.dental.patients.menuLabel', 'Patients'), permissions: [PERMISSIONS.VIEW_DENTAL_PATIENTS, PERMISSIONS.MANAGE_DENTAL_PATIENTS] },
      { href: '/erp/dental/schedule', icon: 'ri-calendar-check-line', label: t('erp.dental.schedule.menuLabel', 'Schedule'), permissions: [PERMISSIONS.VIEW_DENTAL_SCHEDULE, PERMISSIONS.MANAGE_DENTAL_SCHEDULE] },
      { href: '/erp/dental/treatment-plans', icon: 'ri-file-list-3-line', label: t('erp.dental.treatmentPlans.menuLabel', 'Treatment plans'), permissions: [PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS, PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS, PERMISSIONS.CREATE_QUOTATIONS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.VIEW_INVOICES] },
      { href: '/erp/sales-orders', icon: 'ri-file-list-2-line', label: t('erp.salesOrders.title', 'Sales Orders'), permissions: [PERMISSIONS.VIEW_SALES_ORDERS, PERMISSIONS.MANAGE_SALES_ORDERS, PERMISSIONS.CREATE_QUOTATIONS] },
      { href: '/erp/invoices', icon: 'ri-file-text-line', label: t('erp.invoices.title', 'Invoices'), permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES, PERMISSIONS.RECORD_PAYMENTS] },
      { href: '/erp/products', icon: 'ri-shopping-bag-line', label: t('erp.products.title', 'Products'), permissions: [PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS] },
      { href: '/erp/inventory', icon: 'ri-archive-line', label: t('erp.inventory.title', 'Inventory'), permissions: [PERMISSIONS.VIEW_INVENTORY, PERMISSIONS.MANAGE_INVENTORY] },
      { href: '/erp/suppliers', icon: 'ri-user-star-line', label: t('erp.suppliers.title', 'Suppliers'), permissions: [PERMISSIONS.VIEW_SUPPLIERS, PERMISSIONS.MANAGE_SUPPLIERS] },
      { href: '/erp/purchase-orders', icon: 'ri-shopping-cart-line', label: t('erp.purchaseOrders.title', 'Purchase Orders'), permissions: [PERMISSIONS.VIEW_PURCHASE_ORDERS, PERMISSIONS.MANAGE_PURCHASE_ORDERS] },
      { href: '/erp/accounting', icon: 'ri-calculator-line', label: t('erp.accounting.title', 'Accounting'), permissions: [PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING, PERMISSIONS.POST_JOURNAL_ENTRIES, PERMISSIONS.CLOSE_FISCAL_YEAR] },
      { href: '/erp/employees', icon: 'ri-team-line', label: t('erp.employees.title', 'Employees'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR] },
      { href: '/erp/hr', icon: 'ri-user-heart-line', label: t('erp.hr.title', 'HR'), permissions: [PERMISSIONS.VIEW_HR, PERMISSIONS.MANAGE_HR, PERMISSIONS.APPROVE_LEAVE] },
      { href: '/erp/payroll', icon: 'ri-money-dollar-circle-line', label: t('erp.payroll.title', 'Payroll'), permissions: [PERMISSIONS.VIEW_PAYROLL, PERMISSIONS.MANAGE_PAYROLL] },
      { href: '/erp/reports', icon: 'ri-bar-chart-box-line', label: t('erp.reports.title', 'Reports'), permissions: ERP_REPORTS_ROUTE_PERMISSIONS },
      { href: '/erp/dental/booking-settings', icon: 'ri-calendar-event-line', label: t('erp.dental.booking.settings.menuLabel', 'Booking settings (Specialists)'), permissions: [PERMISSIONS.VIEW_DENTAL_SCHEDULE, PERMISSIONS.MANAGE_DENTAL_SCHEDULE] },
      { href: '/erp/settings', icon: 'ri-settings-3-line', label: t('erp.settings.title', 'ERP Settings'), permissions: [PERMISSIONS.VIEW_ERP_SETTINGS, PERMISSIONS.MANAGE_ERP_SETTINGS] },
    ],
    [PERMISSIONS, t]
  );

  const currentErpMenuItems =
    erpBusinessType === 'restaurant'
      ? restaurantErpMenuItems
      : erpBusinessType === 'dental'
        ? dentalErpMenuItems
        : standardErpMenuItems;

  const erpExpandedMenuItems = useMemo(
    () => currentErpMenuItems.filter((item) => hasAnyPermission(item.permissions)),
    [currentErpMenuItems, hasAnyPermission],
  );

  const erpModuleFallbackHref = useMemo(() => {
    const currentAllowedRoute = erpExpandedMenuItems.find((item) => location.startsWith(item.href));
    return currentAllowedRoute?.href ?? erpExpandedMenuItems[0]?.href ?? '/erp/dashboard';
  }, [location, erpExpandedMenuItems]);

  const erpCollapsedHref = useMemo(() => {
    if (erpBusinessType !== 'restaurant' && canOpenErpDashboard) return '/erp/dashboard';
    return erpModuleFallbackHref;
  }, [erpBusinessType, canOpenErpDashboard, erpModuleFallbackHref]);

  const erpTopLevelHref =
    erpBusinessType !== 'restaurant' && canOpenErpDashboard ? '/erp/dashboard' : erpModuleFallbackHref;

  const queryClient = useQueryClient();

  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    const unsubscribeChannelCreated = onMessage('channelConnectionCreated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelUpdated = onMessage('channelConnectionUpdated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelDeleted = onMessage('channelConnectionDeleted', (data) => {
      if (data.data?.id === activeChannelId) {
        setActiveChannelId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });


    const unsubscribeWhatsAppStatus = onMessage('whatsappConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeInstagramStatus = onMessage('instagramConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeMessengerStatus = onMessage('messengerConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });


    const unsubscribeSubscriptionStatus = onMessage('subscription_status_changed', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
    });


    const unsubscribePlanUpdated = onMessage('plan_updated', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
    });

    return () => {
      unsubscribeChannelCreated();
      unsubscribeChannelUpdated();
      unsubscribeChannelDeleted();
      unsubscribeWhatsAppStatus();
      unsubscribeInstagramStatus();
      unsubscribeMessengerStatus();
      unsubscribeSubscriptionStatus();
      unsubscribePlanUpdated();
    };
  }, [onMessage, queryClient, company?.id, activeChannelId, setActiveChannelId]);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    checkIfMobile();

    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Give the odontogram maximum width when the dental chart page opens.
  useEffect(() => {
    if (location.startsWith('/erp/dental/chart')) {
      setIsCollapsed(true);
    }
  }, [location]);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const { data: channelConnections = [] } = useQuery<any[]>({
    queryKey: ['/api/channel-connections', company?.id],
    refetchOnWindowFocus: false, // Disable to prevent excessive refetching
    refetchOnReconnect: false, // Disable to prevent excessive refetching
    staleTime: 1000 * 60 * 5, // Increase stale time to 5 minutes
    enabled: !!company
  });

  const handleChannelClick = (channelId: number) => {

    const connection = channelConnections?.find((conn: any) => conn.id === channelId);

    if (connection?.channelType === 'email') {

      setLocation(`/email/${channelId}`);
      setActiveChannelId(channelId);
    } else {

      if (activeChannelId === channelId) {
        setActiveChannelId(null);
      } else {
        setActiveChannelId(channelId);
      }

      if (location !== '/inbox') {
        setLocation('/inbox');
      }
    }
  };

  const companyStyle = isDark
    ? {
        sidebarBg: { backgroundColor: 'hsl(var(--card))' },
        sidebarHover: { backgroundColor: 'hsl(var(--accent))' },
        activeItem: { backgroundColor: 'hsl(var(--accent))' },
        toggleButton: { backgroundColor: 'hsl(var(--accent))' },
        toggleButtonHover: { backgroundColor: 'hsl(var(--accent))' },
        toggleButtonBorder: { borderColor: 'hsl(var(--border))' },
        textColor: 'text-white',
        mutedText: 'text-white/65'
      }
    : {
        sidebarBg: { backgroundColor: '#f8fafc' },
        sidebarHover: { backgroundColor: '#e2e8f0' },
        activeItem: { backgroundColor: '#e3ecff', color: '#0f172a' },
        toggleButton: { backgroundColor: '#ffffff', color: '#0f172a' },
        toggleButtonHover: { backgroundColor: '#eff4ff' },
        toggleButtonBorder: { borderColor: '#cbd5f5' },
        textColor: 'text-gray-900',
        mutedText: 'text-gray-600'
      };

  function adjustColor(color: string, amount: number): string {
    try {
      color = color.replace('#', '');

      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);

      r = Math.max(0, Math.min(255, r + amount));
      g = Math.max(0, Math.min(255, g + amount));
      b = Math.max(0, Math.min(255, b + amount));

      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (error) {
      return '#1f2937';
    }
  }


  const getDaysRemaining = () => {
    if (!subscriptionStatus) return null;

    const { daysUntilExpiry, nextBillingDate, gracePeriodActive, gracePeriodDaysRemaining, isActive } = subscriptionStatus;


    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return gracePeriodDaysRemaining;
    }


    if (!isActive) {
      return 0;
    }


    if (daysUntilExpiry !== undefined) {
      return daysUntilExpiry;
    }


    if (nextBillingDate) {
      const renewalDate = new Date(nextBillingDate);
      const today = new Date();
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    }

    return null;
  };

  const getRenewalDisplayInfo = () => {
    if (!subscriptionStatus) return null;


    if (renewalStatus && !renewalStatus.expirationStatus.renewalRequired) {
      return null;
    }

    const { daysUntilExpiry, nextBillingDate, gracePeriodActive, gracePeriodDaysRemaining, isActive } = subscriptionStatus;
    

    const isLifetime = company?.plan && isLifetimePlan(company.plan);
    

    if (isLifetime) {
      return {
        text: t('nav.lifetime_plan', 'Lifetime plan'),
        color: 'text-green-400',
        icon: 'ri-infinity-line'
      };
    }

    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return {
        text: `${t('nav.grace_period', 'Grace period')}: ${gracePeriodDaysRemaining} ${gracePeriodDaysRemaining === 1 ? 'day' : 'days'}`,
        color: 'text-amber-400',
        icon: 'ri-time-line'
      };
    }

    if (!isActive) {
      return {
        text: t('nav.subscription_expired', 'Subscription expired'),
        color: 'text-red-400',
        icon: 'ri-alert-line'
      };
    }

    if (daysUntilExpiry !== undefined) {
      if (daysUntilExpiry <= 7) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (daysUntilExpiry <= 30) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    if (nextBillingDate) {
      const renewalDate = new Date(nextBillingDate);
      const today = new Date();
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return {
          text: t('nav.renewal_due', 'Renewal due'),
          color: 'text-red-400',
          icon: 'ri-alert-line'
        };
      } else if (diffDays <= 7) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (diffDays <= 30) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    return null;
  };

  const handleManualRenewal = () => {
    requestManualRenewal();
  };

  const isSubscriptionExpired = () => {
    return subscriptionStatus &&
           !subscriptionStatus.isActive &&
           (subscriptionStatus.status === 'expired' ||
            subscriptionStatus.status === 'cancelled' ||
            subscriptionStatus.status === 'past_due');
  };

  const navItemClass = (active: boolean, nested = false) =>
    `group relative flex h-9 w-full items-center rounded-lg border border-transparent text-sm font-medium transition-colors ${
      isCollapsed ? 'justify-center px-0' : nested ? 'px-2 ps-8' : 'px-2'
    } ${
      active
        ? isDark
          ? 'text-white shadow-sm'
          : 'text-gray-900 shadow-sm bg-white/70'
        : isDark
          ? 'text-white/65 hover:border-white/5 hover:bg-white/[0.07] hover:text-white'
          : 'text-gray-600 hover:bg-white hover:text-gray-900'
    }`;

  const navLabelClass = `min-w-0 flex-1 truncate ms-2.5 ${isCollapsed ? 'sr-only' : 'block'}`;
  const unreadBadgeClass = `ml-auto flex items-center justify-center rounded-full text-[11px] font-bold bg-[#21c063] text-white w-5 h-5`;

  const collapsedTitle = (label: string) => (isCollapsed ? label : undefined);

  const channelItemClass = (active: boolean) =>
    `group relative flex ${isCollapsed ? 'h-12 w-12' : 'h-14 w-full'} items-center rounded-xl border transition-all duration-200 ${
      isCollapsed ? 'justify-center' : 'px-3 gap-3'
    } ${
      active
        ? isDark
          ? 'border-[#0ea5e9] bg-[#0ea5e9]/10 text-white shadow-[0_0_15px_rgba(14,165,233,0.1)]'
          : 'border-[#0ea5e9] bg-[#e0f2fe] text-[#0f172a] shadow-sm'
        : isDark
          ? 'border-transparent text-white/70 hover:bg-white/[0.05] hover:text-white'
          : 'border-transparent text-gray-600 hover:bg-white hover:text-gray-900'
    }`;

  const utilityItemClass = (active: boolean) =>
    `group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 transition-all ${
      isDark ? 'hover:bg-white/[0.05]' : 'hover:bg-white'
    } ${
      active ? (isDark ? 'text-white' : 'text-gray-900') : isDark ? 'text-white/70' : 'text-gray-600'
    }`;

  const utilitySectionActive = location === '/pages' || location === '/settings' || location.startsWith('/settings?');

  return (
    <nav
      className={`relative flex h-screen flex-shrink-0 flex-col overflow-hidden border-e ${
        companyStyle.textColor ?? 'text-white'
      } shadow-xl transition-[width] duration-300 ease-in-out ${isCollapsed ? 'w-[4.75rem]' : 'w-72'}`}
      style={companyStyle.sidebarBg}
    >
      <div className={`flex h-14 shrink-0 items-center border-b ${isDark ? 'border-white/10' : 'border-slate-200'} ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-3'}`}>
        <button
          type="button"
          onClick={toggleSidebar}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            isDark
              ? 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              : 'border-slate-200 text-gray-600 hover:bg-white hover:shadow-sm'
          }`}
          style={{
            ...companyStyle.toggleButton,
            ...(isDark ? {} : { borderColor: '#cbd5f5' })
          }}
          aria-label={isCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
          title={isCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
        >
          <i className={`ri-${isCollapsed ? 'menu-unfold' : 'menu-fold'}-line text-lg`} />
        </button>
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {company?.logo || branding.logoUrl ? (
              <img
                src={company?.logo || branding.logoUrl}
                alt={company?.name || branding.appName}
                className="h-8 max-w-[150px] object-contain object-left"
              />
            ) : (
              <>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}
                  style={{ backgroundColor: company?.primaryColor || branding.primaryColor }}
                >
                  {(company?.name || branding.appName || 'P').charAt(0).toUpperCase()}
                </span>
             <span className={`truncate text-sm font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>{company?.name || branding.appName}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        <div className="flex flex-col space-y-0.5">
          <Link
            href="/inbox"
            data-tour="sidebar-inbox"
            className={`${navItemClass(location === '/inbox')} relative`}
            style={location === '/inbox' ? companyStyle.activeItem : {}}
            title={collapsedTitle(t('nav.inbox', 'Inbox'))}
          >
            <i className="ri-chat-4-fill text-xl"></i>
            <span className={navLabelClass}>{t('nav.inbox', 'Inbox')}</span>
            {totalUnreadCount > 0 && (
              <span className={`${unreadBadgeClass} ${isCollapsed ? '' : 'ml-2'}`}>
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </Link>

          <PermissionGate permissions={[PERMISSIONS.VIEW_FLOWS, PERMISSIONS.MANAGE_FLOWS]}>
            <Link
              href="/flows"
              className={navItemClass(location === '/flows')}
              style={location === '/flows' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.flow_builder', 'Flow Builder'))}
            >
              <i className="ri-node-tree text-xl"></i>
              <span className={navLabelClass}>{t('nav.flow_builder', 'Flow Builder')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CONTACTS, PERMISSIONS.MANAGE_CONTACTS]}>
            <Link
              href="/contacts"
              data-tour="sidebar-contacts"
              className={navItemClass(location === '/contacts')}
              style={location === '/contacts' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.contacts', 'Contacts'))}
            >
              <i className="ri-contacts-book-2-line text-xl"></i>
              <span className={navLabelClass}>{t('nav.contacts', 'Contacts')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE]}>
            <Link
              href="/pipeline"
              data-tour="sidebar-pipeline"
              className={navItemClass(location === '/pipeline')}
              style={location === '/pipeline' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.pipeline', 'Pipeline'))}
            >
              <i className="ri-route-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.pipeline', 'Pipeline')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]}>
            <Link
              href="/tasks"
              data-tour="sidebar-tasks"
              className={navItemClass(location === '/tasks')}
              style={location === '/tasks' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.tasks', 'Tasks'))}
            >
              <i className="ri-checkbox-circle-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.tasks', 'Tasks')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CALENDAR, PERMISSIONS.MANAGE_CALENDAR]}>
            <Link
              href="/calendar"
              className={navItemClass(location === '/calendar')}
              style={location === '/calendar' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.calendar', 'Calendar'))}
            >
              <i className="ri-calendar-event-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.calendar', 'Calendar')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[
            PERMISSIONS.VIEW_CAMPAIGNS,
            PERMISSIONS.CREATE_CAMPAIGNS,
            PERMISSIONS.EDIT_CAMPAIGNS,
            PERMISSIONS.DELETE_CAMPAIGNS,
            PERMISSIONS.MANAGE_TEMPLATES,
            PERMISSIONS.MANAGE_SEGMENTS,
            PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS,
            PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS,
            PERMISSIONS.CONFIGURE_CHANNELS
          ]}>
            <Link
              href="/campaigns"
              className={navItemClass(location.startsWith('/campaigns'))}
              style={location.startsWith('/campaigns') ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.campaigns', 'Campaigns'))}
            >
              <i className="ri-advertisement-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.campaigns', 'Campaigns')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]}>
            <Link
              href="/call-logs"
              className={navItemClass(location.startsWith('/call-logs'))}
              style={location.startsWith('/call-logs') ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.call_logs', 'Call Logs'))}
            >
              <i className="ri-phone-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.call_logs', 'Call Logs')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.MANAGE_TEMPLATES]}>
            <Link
              href="/templates"
              className={navItemClass(location === '/templates')}
              style={location === '/templates' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.templates', 'Templates'))}
            >
              <i className="ri-draft-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.templates', 'Templates')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.VIEW_DETAILED_ANALYTICS]}>
            <Link
              href="/analytics"
              className={navItemClass(location === '/analytics')}
              style={location === '/analytics' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.analytics', 'Analytics'))}
            >
              <i className="ri-bar-chart-2-line text-xl"></i>
              <span className={navLabelClass}>{t('nav.analytics', 'Analytics')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS, PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]}>
            <Link
              href="/reports"
              className={navItemClass(location === '/reports')}
              style={location === '/reports' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.reports', 'Reports'))}
            >
              <i className="ri-pie-chart-2-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.reports', 'Reports')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]}>
            <Link
              href="/captured-data"
              className={navItemClass(location === '/captured-data')}
              style={location === '/captured-data' ? companyStyle.activeItem : {}}
              title={collapsedTitle(t('nav.captured_data', 'Captured Data'))}
            >
              <i className="ri-database-2-fill text-xl"></i>
              <span className={navLabelClass}>{t('nav.captured_data', 'Captured Data')}</span>
            </Link>
          </PermissionGate>

          {/* Uncomment for ERP Menu */}


          {<PermissionGate permissions={ERP_ACCESS_PERMISSIONS}>
            {isCollapsed ? (
              <Link
                href={erpCollapsedHref}
                className={navItemClass(location.startsWith('/erp'))}
                style={location.startsWith('/erp') ? companyStyle.activeItem : {}}
                title={collapsedTitle(t('erp.nav.title', 'ERP'))}
              >
                <i className="ri-building-line text-xl"></i>
              </Link>
            ) : (
              <div className="flex flex-col space-y-0.5">
                <div
                  className={`flex h-9 w-full items-stretch overflow-hidden rounded-lg border border-transparent transition-colors ${
                    location.startsWith('/erp')
                      ? isDark ? 'text-white shadow-sm' : 'text-gray-900 shadow-sm bg-white/70'
                      : isDark
                        ? 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                  style={location.startsWith('/erp') ? companyStyle.activeItem : {}}
                >
                  <Link
                    href={erpTopLevelHref}
                    onClick={() => setErpExpanded(true)}
                    className="flex min-w-0 flex-1 items-center px-2 text-left"
                  >
                    <i className="ri-building-3-fill text-xl shrink-0"></i>
                    <span className="ms-2.5 flex-1 truncate">{t('erp.nav.title', 'ERP')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setErpExpanded(!erpExpanded)}
            className={`flex shrink-0 items-center px-2 ${
              erpExpanded
                ? isDark ? 'text-white' : 'text-gray-900'
                : isDark
                  ? 'text-white/60 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
                    aria-expanded={erpExpanded}
                    aria-label={erpExpanded ? t('erp.nav.collapseMenu', 'Collapse ERP menu') : t('erp.nav.expandMenu', 'Expand ERP menu')}
                  >
                    <i className={`ri-arrow-down-s-line text-lg transition-transform ${erpExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>



                {erpExpanded && (
                  <>
                    {erpExpandedMenuItems.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={navItemClass(location.startsWith(item.href), true)}
                            style={location.startsWith(item.href) ? companyStyle.activeItem : {}}
                            title={collapsedTitle(item.label)}
                          >
                          <i className={`${item.icon.includes('-line') ? item.icon.replace('-line', '-fill') : item.icon} text-xl`}></i>
                        <span className={navLabelClass}>{item.label}</span>
                      </Link>
                    ))}
                  </>
                )}

                
              </div>
            )}
          </PermissionGate>}
        </div>

        <PermissionGate permissions={[PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]}>
          <div data-tour="sidebar-channels" className={`mt-5 border-t ${isDark ? 'border-white/10' : 'border-slate-200'} pt-4`}>
            <h3 className={`mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${
              isDark ? 'text-white/35' : 'text-gray-500'
            } ${isCollapsed ? 'hidden' : 'block'}`}>
              {t('nav.channels', 'Channels')}
            </h3>
            <div className="flex flex-col space-y-0.5">
              {channelConnections.map((connection: any) => {
                let icon: string | React.ComponentType<any>;
                let color: string;
                let isComponent = false;

                switch(connection.channelType) {
                  case 'whatsapp_official':
                    icon = "ri-whatsapp-line";
                    color = "#25D366";
                    break;
                  case 'whatsapp_unofficial':
                    icon = "ri-whatsapp-line";
                    color = "#25D366";
                    break;
                  case 'messenger':
                    icon = "ri-messenger-line";
                    color = "#1877F2";
                    break;
                  case 'instagram':
                    icon = "ri-instagram-line";
                    color = "#E4405F";
                    break;
                  case 'tiktok':
                    icon = "ri-tiktok-line";
                    color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                    break;
                  case 'telegram':
                    icon = "ri-telegram-line";
                    color = "#0088CC";
                    break;
                  case 'email':
                    icon = "ri-mail-line";
                    color = "#0078D4";
                    break;
                  case 'twilio_sms':
                  case 'twilio_voice':
                    icon = TwilioIcon;
                    isComponent = true;
                    color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                    break;
                  case 'webchat':
                    icon = "ri-message-3-line";
                    color = "#6366f1";
                    break;
                  
                  default:
                    icon = "ri-message-3-line";
                    color = "#a1f15bff";
                }

                const isActive = activeChannelId === connection.id;
                const IconComponent = isComponent ? icon as React.ComponentType<any> : null;

                const statusDotColor = connection.status === 'active'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]'
                  : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]';

                return (
                  <button
                    key={connection.id}
                    className={`${navItemClass(isActive)} relative`}
                    style={isActive ? companyStyle.activeItem : {}}
                    onClick={() => handleChannelClick(connection.id)}
                    title={isCollapsed ? connection.accountName : undefined}
                  >
                    {connection.channelType === 'webchat' ? (
                      <img
                        src="https://cdn-icons-png.flaticon.com/128/16921/16921613.png"
                        alt={t('nav.webchat', 'Web chat')}
                        className="h-4 w-4 rounded"
                      />
                    ) : isComponent && IconComponent ? (
                      <IconComponent className="h-4 w-4" />
                    ) : (
                      <i className={`${icon} text-xl`} style={{ color: isActive ? 'white' : color }}></i>
                    )}
                    {isCollapsed ? null : (
                      <span className={`${navLabelClass} text-left`}> {connection.accountName?.length > 20 ? `${connection.accountName.slice(0, 20)}…` : connection.accountName}</span>
                    )}
                    <span
                      className={`absolute rounded-full ${statusDotColor}`}
                      style={{
                        width: isCollapsed ? '0.3rem' : '0.55rem',
                        height: isCollapsed ? '0.3rem' : '0.55rem',
                        right: isCollapsed ? '0.35rem' : '0.6rem',
                        top: '50%',
                        transform: 'translateY(-50%)'
                      }}
                    ></span>
                  </button>
                );
              })}
            </div>
          </div>
        </PermissionGate>
        </div>

        <div className={`shrink-0 border-t ${isDark ? 'border-white/10 bg-black/5' : 'border-slate-200 bg-white/70'} ${isCollapsed ? 'p-2' : 'p-3'}`}>
          <TrialStatus isCollapsed={isCollapsed} />

          <div className="flex flex-col space-y-0.5">
            <div
              className={`${navItemClass(utilitySectionActive)} items-center`}
              style={utilitySectionActive ? companyStyle.activeItem : {}}
            >
              {!isCollapsed && (
                <Link
                  href="/settings"
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    isDark
                      ? 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                      : 'border-slate-200 text-gray-600 hover:bg-white'
                  }`}
                  onClick={(event) => event.stopPropagation()}
                  title={collapsedTitle(t('nav.settings', 'Settings'))}
                >
                  <i className="ri-settings-3-line text-lg"></i>
                </Link>
              )}
              <button
                type="button"
                className={`${!isCollapsed ? 'ml-2 flex flex-1 items-center justify-between text-left' : 'flex w-full items-center justify-center text-left'}`}
                onClick={() => setUtilityExpanded((expanded) => !expanded)}
                aria-expanded={utilityExpanded}
                aria-label={utilityExpanded ? t('nav.utility_collapse', 'Collapse utility menu') : t('nav.utility_expand', 'Expand utility menu')}
                title={collapsedTitle(t('nav.utility_menu', 'Utility menu'))}
              >
            <span className={`${navLabelClass} ${isCollapsed ? 'sr-only' : ''}`}>{t('nav.utility_menu', 'More')}</span>
                {isCollapsed ? (
                  <i className="ri-more-2-line text-xl"></i>
                ) : (
                  <i className={`ri-arrow-down-s-line text-lg transition-transform ${utilityExpanded ? 'rotate-180' : ''}`} />
                )}
              </button>
            </div>

            {utilityExpanded && (
              <div className="flex flex-col space-y-0.5">
                <PermissionGate permissions={[PERMISSIONS.VIEW_PAGES, PERMISSIONS.MANAGE_PAGES]}>
                  <Link
                    href="/pages"
                    className={navItemClass(location === '/pages', !isCollapsed)}
                    style={location === '/pages' ? companyStyle.activeItem : {}}
                    title={collapsedTitle(t('nav.pages', 'Pages'))}
                  >
                    <i className="ri-book-2-fill text-xl"></i>
                    <span className={navLabelClass}>{t('nav.pages', 'Pages')}</span>
                  </Link>
                </PermissionGate>

                <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
                  <Link
                    href="/settings"
                    className={navItemClass(location === '/settings', !isCollapsed)}
                    style={location === '/settings' ? companyStyle.activeItem : {}}
                    title={collapsedTitle(t('nav.settings', 'Settings'))}
                  >
                    <i className="ri-settings-4-line text-xl"></i>
                    <span className={navLabelClass}>{t('nav.settings', 'Settings')}</span>
                  </Link>
                </PermissionGate>
                <a
                  href={getHelpSupportUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={navItemClass(false, !isCollapsed)}
                  title={collapsedTitle(t('nav.help_support', 'Help & Support'))}
                >
                  <i className="ri-question-answer-line text-xl"></i>
                  <span className={navLabelClass}>{t('nav.help_support', 'Help & Support')}</span>
                </a>

                <Link
                  href="/settings?tab=billing"
                  className={navItemClass(location === '/settings?tab=billing', !isCollapsed)}
                  title={collapsedTitle(t('nav.billing', 'Billing & Subscription'))}
                >
                  <i className="ri-cash-line text-xl"></i>
                  <span className={navLabelClass}>{t('nav.billing', 'Billing & Subscription')}</span>
                </Link>
                {company && !isCollapsed && (
                  <div
                    className={`mt-3 rounded-xl border p-3 text-xs ${
                      isDark
                        ? 'border-white/10 bg-white/[0.05] text-white/55'
                        : 'border-slate-200 bg-white text-gray-600 shadow-sm'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className={`truncate font-medium ${isDark ? 'text-white/85' : 'text-gray-900'}`}>{company.name}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t('nav.plan', 'Plan')}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 capitalize ${
                            isDark ? 'border-white/10 bg-white/[0.06] text-white/75' : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}
                        >
                          {company.plan}
                        </span>
                      </div>

                      {(() => {
                        const renewalInfo = getRenewalDisplayInfo();
                        return renewalInfo ? (
                          <div
                            className={`flex items-center gap-1.5 border-t pt-1.5 ${
                              isDark ? 'border-white/10' : 'border-slate-200'
                            } ${renewalInfo.color}`}
                          >
                            <i className={`${renewalInfo.icon} text-xs`}></i>
                            <span>{renewalInfo.text}</span>
                          </div>
                        ) : null;
                      })()}

                      {isSubscriptionExpired() && (
                        <button
                          onClick={handleManualRenewal}
                          className={`mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            isDark ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          <i className="ri-refresh-line text-sm"></i>
                          <span>{t('nav.renew_subscription', 'Renew Subscription')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
