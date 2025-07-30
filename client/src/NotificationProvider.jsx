import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { generateNotificationId } from './Notification.jsx'; // Adjust path if needed

const NotificationContext = createContext();

export const useNotificationContext = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        setUnreadCount(notifications.filter(n => !n.isRead).length);
    }, [notifications]);

    const getNotification = (notificationId) => {
        return notifications.find(notification => notification.id === notificationId);
    }

    const addNotification = useCallback((newNotification) => {
        setNotifications((prevNotifications) => {
            if( newNotification.id && prevNotifications.find(m => m.id === newNotification.id)){
                return prevNotifications.map(m => m.id === newNotification.id ? { ...m, ...newNotification } : m);
            }
            const id = newNotification.id ?? generateNotificationId();
            const timestamp = new Date().getTime();
            const updatedNotifications = [{ id, ...newNotification, isExpanded: false, isRead: false, timestamp }, ...prevNotifications];
            return updatedNotifications;
        });
    }, []); // Remove notifications from the dependency array

    const markAsRead = useCallback((notificationId) => {
        setNotifications(prevNotifications =>
            prevNotifications.map(notification => {
                if (notification.id === notificationId) {
                    return { ...notification, isExpanded: false, isRead: true };
                }
                return notification;
            })
        );
    }, []);

    const removeNotification = useCallback((notificationId) => {
        setNotifications((prevNotifications) => prevNotifications.filter((notification) => notification.id !== notificationId));
    }, []);

    const toggleExpand = useCallback((notificationId) => {
        setNotifications(prevNotifications =>
            prevNotifications.map(notification => {
                if (notification.id === notificationId) {
                    return { ...notification, isExpanded: !notification.isExpanded };
                }
                return notification;
            })
        );
    }, []);

    const contextValue = {
        notifications,
        addNotification,
        getNotification,
        markAsRead,
        removeNotification,
        toggleExpand,
        unreadCount
    };

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}
        </NotificationContext.Provider>
    );
};