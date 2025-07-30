import React, {useState, useEffect, useRef, useCallback, forwardRef} from 'react';
import { FaCheck, FaSpinner, FaExclamationTriangle, FaBell, FaTimes, FaTrash } from 'react-icons/fa'; // Example icons
import { useNotificationContext } from './NotificationProvider.jsx'; // Import the context
import './Notification.scss';

/*
    const { addNotification } = useNotificationContext();
const notificationData = {
                title: 'New Notification',
                message: 'This is a new notification message.',
                icon: <FaBell />,
                status: ['ongoing','completed','error'][Math.floor(Math.random()*3)]
            };
 */
// Helper function to generate a unique ID
const generateNotificationId = () => {
    return Math.random().toString(36).substring(2, 9);
};

const Notification = ({ notification, onClick }) => {
    const { markAsRead, removeNotification } = useNotificationContext();
    const [dismissTimer, setDismissTimer] = useState(null);
    const notificationRef = useRef(null);
    const isMounted = useRef(false)

    const handleMarkAsRead = useCallback(() => {
        markAsRead(notification.id);
    }, [markAsRead, notification.id]);

    useEffect(() => {
        const t = setTimeout(()=>{
            markAsRead(notification.id);
        }, notification.timeout || 12000);
        return () => {
            clearTimeout(t);
        }
    }, [notification]);

    useEffect(() => {
        if (notification.isRead) {
            const timer = setTimeout(() => {
                removeNotification(notification.id);
            }, 30000);

            return () => {
                clearTimeout(timer);
            };
        }
    }, [notification.isRead, notification.id, removeNotification]);

    let statusIcon;
    switch (notification.status) {
        case 'ongoing':
            statusIcon = <FaSpinner className="spinner" />;
            break;
        case 'completed':
            statusIcon = <FaCheck />;
            break;
        case 'error':
            statusIcon = <FaExclamationTriangle />;
            break;
        default:
            statusIcon = null;
    }

    const removeBtn = notification.isRead ? <button onClick={() => {
        removeNotification(notification.id);
    }}><FaTrash /></button> : <></>
    return (
        <div ref={notificationRef} onClick={onClick} className={`notification ${notification.isExpanded ? 'expanded' : 'collapsed'} ${notification.status}`}>
            <div className="notification-header">
                {notification.icon && <span className="notification-icon">{notification.icon}</span>}
                <span className="notification-title">{notification.title}</span>
                {statusIcon && <span className="notification-status">{statusIcon}</span>}
                {removeBtn}
            </div>
            {<div className="notification-content">
            <p className="notification-message">{notification.message}</p>
            </div>}
        </div>
    );
};

const NotificationList = forwardRef((props, ref) => {
    const { notifications, markAsRead, removeNotification, addNotification, unreadCount } = useNotificationContext();
    const [showBubble, setShowBubble] = useState(false);


    const toggleBubble = useCallback(() => {
        setShowBubble(!showBubble)
    }, [showBubble]);

    useEffect(() => {
        if( unreadCount > 0 ){
            if (!showBubble)
                setShowBubble(true);
        }else{
            if (showBubble)
                setShowBubble(false);
        }
    }, [unreadCount]);

    const readNotifications = notifications.filter(n => n.isRead) || [];
    const unreadNotifications = notifications.filter(n => !n.isRead) || [];
    return (
        <div className="notification-container">
            <div className="notifications-right">
                {unreadNotifications.map(notification => (
                    <Notification
                        onClick={() => {
                            markAsRead(notification.id)
                        }}
                        key={notification.id}
                        notification={notification}
                    />
                ))}
                {unreadCount > 0 && <div className={"notification-bubble-count"}>{unreadCount}</div>}
            </div>
            <div className={`notification-bubble ${showBubble ? 'visible' : ''}`}>
                <button onClick={toggleBubble} className="notification-bubble-btn">
                    <FaBell/>
                    {unreadCount > 0 && <span className="notification-bubble-count">{unreadCount}</span>}
                </button>
                {showBubble && <div className='notifications-bubble-content'>
                    {readNotifications.map(notification => (
                        <Notification
                            key={notification.id}
                            notification={notification}
                        />
                    ))}
                </div>}
            </div>
        </div>
    );
});
NotificationList.displayName = "NotificationList";
export {NotificationList, generateNotificationId}; // Export for use elsewherex