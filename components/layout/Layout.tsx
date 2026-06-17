
import React from 'react';
import Header from './Header.tsx';
import FooterMenu, { type NavItem } from './FooterMenu.tsx';
import type { Page, UserData, Notification } from '../../types';

interface LayoutProps {
  children: React.ReactNode;
  page: Page;
  setPage: (page: Page) => void;
  publicKey: string | null;
  userData: UserData;
  notifications: Notification[];
  onMarkNotificationAsRead: (id: string) => void;
  onMarkAllNotificationsAsRead: () => void;
  onOpenAssistant: () => void;
  /** Footer nav items — supplied by App from `getFooterNav(featureFlags)`. */
  footerNavItems: ReadonlyArray<NavItem>;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  page,
  setPage,
  publicKey,
  userData,
  notifications,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onOpenAssistant,
  footerNavItems,
}) => {
  return (
    <div className="flex min-h-[100dvh] flex-col text-gray-200 bg-slate-900 font-sans">
      <Header
        publicKey={publicKey}
        userData={userData}
        notifications={notifications}
        onMarkNotificationAsRead={onMarkNotificationAsRead}
        onMarkAllNotificationsAsRead={onMarkAllNotificationsAsRead}
        setPage={setPage}
        onOpenAssistant={onOpenAssistant}
      />

      {/* Main content area — properly respects the fixed footer + iOS safe areas (Apple quality) */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 safe-bottom sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>

      <FooterMenu currentPage={page} setPage={setPage} items={footerNavItems} />
    </div>
  );
};

export default Layout;