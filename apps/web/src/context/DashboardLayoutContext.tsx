'use client';

import React, { createContext, useContext, useState } from 'react';

interface DashboardLayoutContextValue {
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  isMobileNavOpen: boolean;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextValue>({
  toggleMobileNav: () => {},
  closeMobileNav: () => {},
  isMobileNavOpen: false,
});

export const useDashboardLayout = () => useContext(DashboardLayoutContext);

export const DashboardLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);
  const closeMobileNav = () => setIsMobileNavOpen(false);

  return (
    <DashboardLayoutContext.Provider value={{ toggleMobileNav, closeMobileNav, isMobileNavOpen }}>
      {children}
    </DashboardLayoutContext.Provider>
  );
};
