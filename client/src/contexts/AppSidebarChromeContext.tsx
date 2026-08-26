import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type AppSidebarChromeContextValue = {
  hideMainSidebar: boolean;
  setHideMainSidebar: (value: boolean) => void;
};

const AppSidebarChromeContext = createContext<AppSidebarChromeContextValue | null>(null);

export function AppSidebarChromeProvider({ children }: { children: React.ReactNode }) {
  const [hideMainSidebar, setHideMainSidebarState] = useState(false);
  const setHideMainSidebar = useCallback((value: boolean) => {
    setHideMainSidebarState(value);
  }, []);

  const value = useMemo(
    () => ({ hideMainSidebar, setHideMainSidebar }),
    [hideMainSidebar, setHideMainSidebar],
  );

  return (
    <AppSidebarChromeContext.Provider value={value}>{children}</AppSidebarChromeContext.Provider>
  );
}

export function useAppSidebarChrome(): AppSidebarChromeContextValue {
  const ctx = useContext(AppSidebarChromeContext);
  if (!ctx) {
    throw new Error('useAppSidebarChrome must be used within AppSidebarChromeProvider');
  }
  return ctx;
}
