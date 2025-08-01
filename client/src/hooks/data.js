import {useQuery} from "react-query";
import {getObjectHash} from "data-primals-engine/core";
import {useAuthContext} from "../contexts/AuthContext.jsx";
import {getUserHash, getUserId} from "../../../src/data";
import {useTranslation} from "react-i18next";
import {useEffect, useState} from "react";
import {useUI} from "../contexts/UIContext.jsx";
import {useNotificationContext} from "../NotificationProvider.jsx";

export const useData = (model, filter, options) => {
    const { me } = useAuthContext();
    const { i18n, t } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    return useQuery([options.queryKey || model, filter, me], () => {
        return fetch('/api/data/search?limit='+(options.limit||1)+'&lang='+(options.lang||lang)+'&_user=' + encodeURIComponent(getUserId(me)) + '&model='+model, {
            method: 'POST',
            body: JSON.stringify({filter}),
            headers: { "Content-Type": "application/json"}}
        )
            .then(e => e.json())
            .then(e => e.data);
    }, {...options, enabled: typeof(options.enabled) === "undefined" ? !!getUserId(me) : options.enabled });
}


export const useAlerts = () => {
    // 2. Supprimer l'état local 'alerts', il sera géré par le UIContext
    // const [alerts, setAlerts] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const { me } = useAuthContext();
    const { addNotification } = useNotificationContext(); // 3. Récupérer la fonction addNotification du contexte

    useEffect(() => {
        if (!me?.username || !addNotification) { // S'assurer que addNotification est disponible
            if (isConnected) setIsConnected(false);
            return;
        }

        console.log("Attempting to connect to SSE for alerts...");
        const eventSource = new EventSource('/api/alerts/subscribe');

        eventSource.onopen = () => {
            console.log('SSE connection established for alerts.');
            setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const newAlert = JSON.parse(event.data);

                if (newAlert.type === 'connection_established') {
                    console.log(`SSE Status: ${newAlert.message}`);
                    return;
                }

                // 4. Remplacer setAlerts par addNotification
                // On crée un objet notification standard que votre système peut afficher.
                if (newAlert.type === 'cron_alert') {
                    addNotification({
                        type: 'info', // ou 'success', 'warning' selon ce que votre système supporte
                        title: 'Alerte planifiée',
                        message: newAlert.message,
                        duration: 10000 // Durée d'affichage en ms (10 secondes)
                    });
                }

                // La notification native du navigateur peut rester si vous le souhaitez
                /*if (Notification.permission === "granted") {
                    new Notification("Nouvelle Alerte", {
                        body: newAlert.message,
                        icon: "/logo.png"
                    });
                }*/

            } catch (error) {
                console.error("Failed to parse SSE data:", error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            setIsConnected(false);
            eventSource.close();
        };

        return () => {
            console.log("Closing SSE connection.");
            eventSource.close();
            setIsConnected(false);
        };
    }, [me?.username, addNotification]); // Ajouter addNotification aux dépendances

    useEffect(() => {
        /*if ("Notification" in window && Notification.permission !== "denied") {
            Notification.requestPermission();
        }*/
    }, []);

    // 5. Mettre à jour la valeur de retour. Le hook n'a plus besoin de retourner la liste des alertes.
    return { isConnected };
};