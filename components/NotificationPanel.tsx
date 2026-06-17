import React from 'react';
import type { Notification, NotificationType } from '../types';

interface NotificationPanelProps {
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
}

// -- Icons for different notification types --
const SuccessIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const WarningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);
const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const NOTIFICATION_ICONS: { [key in NotificationType]: React.ReactNode } = {
    success: <SuccessIcon />,
    error: <ErrorIcon />,
    warning: <WarningIcon />,
    info: <InfoIcon />,
};

// -- Time formatting utility --
const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};


const NotificationPanel: React.FC<NotificationPanelProps> = ({ notifications, onMarkAsRead, onMarkAllAsRead }) => {
    return (
        <div className="absolute right-0 mt-2 w-screen max-w-sm sm:w-96 bg-slate-800 border border-slate-700 rounded-lg shadow-xl origin-top-right transform-gpu transition-all duration-200 ease-out scale-100 opacity-100 flex flex-col">
            {/* Panel Header */}
            <div className="flex-shrink-0 p-3 border-b border-slate-700 flex items-center justify-between">
                <h3 className="font-semibold text-white">Notifications</h3>
                <button 
                    onClick={onMarkAllAsRead}
                    className="text-sm text-purple-400 hover:text-purple-300 font-semibold"
                >
                    Mark all as read
                </button>
            </div>
            
            {/* Notifications List */}
            <div className="flex-grow overflow-y-auto max-h-[60vh]">
                {notifications.length > 0 ? (
                    notifications.map(notification => (
                        <div 
                            key={notification.id}
                            onClick={() => onMarkAsRead(notification.id)}
                            className="flex items-start gap-3 p-3 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors cursor-pointer"
                        >
                            {!notification.read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>}
                            <div className={`flex-shrink-0 ${notification.read ? 'ml-5' : ''}`}>{NOTIFICATION_ICONS[notification.type]}</div>
                            <div className="flex-1">
                                <p className={`text-sm ${notification.read ? 'text-gray-400' : 'text-gray-200'}`}>
                                    {notification.message}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">{timeSince(notification.timestamp)}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center p-8 text-gray-500">
                        <p>You have no new notifications.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPanel;