import React, { useState, useRef, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { UserData, Notification, Page } from '../../types';
import NotificationPanel from '../NotificationPanel.tsx';

interface HeaderProps {
  publicKey: string | null;
  userData: UserData;
  notifications: Notification[];
  onMarkNotificationAsRead: (id: string) => void;
  onMarkAllNotificationsAsRead: () => void;
  setPage: (page: Page) => void;
  onOpenAssistant: () => void;
}

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const BellIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

const ChatBubbleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);


const Header: React.FC<HeaderProps> = ({ 
    publicKey, 
    userData,
    notifications,
    onMarkNotificationAsRead,
    onMarkAllNotificationsAsRead,
    setPage,
    onOpenAssistant
}) => {
    const [isProfileOpen, setProfileOpen] = useState(false);
    const [isNotificationsOpen, setNotificationsOpen] = useState(false);
    
    const profileRef = useRef<HTMLDivElement>(null);
    const notificationsRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
                setNotificationsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleProfile = () => {
        setProfileOpen(!isProfileOpen);
        if (isNotificationsOpen) setNotificationsOpen(false);
    };
    
    const toggleNotifications = () => {
        setNotificationsOpen(!isNotificationsOpen);
        if (isProfileOpen) setProfileOpen(false);
    };

  return (
    <header className="bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <span className="ml-3 text-xl font-bold tracking-wider text-white">Echelon</span>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            {publicKey && (
                <>
                    {/* Notifications Button */}
                    <div className="relative" ref={notificationsRef}>
                        <button onClick={toggleNotifications} className="relative p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition text-gray-300 hover:text-white">
                            <BellIcon />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-xs items-center justify-center">{unreadCount}</span>
                                </span>
                            )}
                        </button>
                        {isNotificationsOpen && (
                            <NotificationPanel 
                                notifications={notifications}
                                onMarkAsRead={onMarkNotificationAsRead}
                                onMarkAllAsRead={onMarkAllNotificationsAsRead}
                            />
                        )}
                    </div>
                    
                    {/* Profile Button */}
                    <div className="relative" ref={profileRef}>
                        <button onClick={toggleProfile} className="flex items-center p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition">
                           <UserIcon/>
                        </button>
                        {isProfileOpen && (
                             <div className="absolute right-0 mt-2 w-screen max-w-xs sm:w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl origin-top-right transform-gpu transition-all duration-200 ease-out scale-100 opacity-100">
                                <div className="p-4">
                                    <p className="text-sm text-gray-400">Connected as</p>
                                    <p className="font-mono text-sm text-purple-400 truncate mt-1">{publicKey}</p>
                                </div>
                                <div className="border-t border-slate-700 p-4 space-y-2 text-sm">
                                    <p><span className="font-semibold">Subscription:</span> {userData.subscription}</p>
                                    <p><span className="font-semibold">RTD Balance:</span> {userData.rtdBalance.toLocaleString()}</p>
                                    <p><span className="font-semibold">Staked:</span> {userData.staked} RTD</p>
                                    <p><span className="font-semibold">Referrals:</span> {userData.referrals}</p>
                                    <div className="pt-2">
                                        <button 
                                            onClick={() => {
                                                setPage('wallet');
                                                setProfileOpen(false); // close dropdown
                                            }} 
                                            className="w-full text-center px-4 py-2 bg-purple-600/80 text-white font-semibold rounded-lg hover:bg-purple-600 transition"
                                        >
                                            Manage Assets
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
            <button onClick={onOpenAssistant} title="Open Network Assistant" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition text-gray-300 hover:text-white">
                <ChatBubbleIcon />
            </button>
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;