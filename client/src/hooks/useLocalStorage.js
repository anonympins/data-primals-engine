import {useEffect, useMemo, useRef, useState} from "react";

function useLocalStorage(
    key,
    defaultValue,
    options
) {
    const opts = useMemo(() => {
        return {
            serializer: JSON.stringify,
            parser: JSON.parse,
            logger: console.log,
            syncData: true,
            ...options,
        };
    }, [options]);

    const { serializer, parser, logger, syncData } = opts;

    const rawValueRef = useRef(null);

    const [value, setValue] = useState(() => {
        if (typeof window === "undefined") return defaultValue;

        try {
            rawValueRef.current = window.localStorage.getItem(key);
            return rawValueRef.current
                ? parser(rawValueRef.current)
                : defaultValue;
        } catch (e) {
            logger(e);
            return defaultValue;
        }
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const updateLocalStorage = () => {
            // Browser ONLY dispatch storage events to other tabs, NOT current tab.
            // We need to manually dispatch storage event for current tab
            if (value !== undefined) {
                const newValue = serializer(value);
                const oldValue = rawValueRef.current;
                rawValueRef.current = newValue;
                window.localStorage.setItem(key, newValue);
                window.dispatchEvent(
                    new StorageEvent("storage", {
                        storageArea: window.localStorage,
                        url: window.location.href,
                        key,
                        newValue,
                        oldValue,
                    })
                );
            } else {
                window.localStorage.removeItem(key);
                window.dispatchEvent(
                    new StorageEvent("storage", {
                        storageArea: window.localStorage,
                        url: window.location.href,
                        key,
                    })
                );
            }
        };

        try {
            updateLocalStorage();
        } catch (e) {
            logger(e);
        }
    }, [value]);

    useEffect(() => {
        if (!syncData) return;

        const handleStorageChange = (e) => {
            if (e.key !== key || e.storageArea !== window.localStorage) return;

            try {
                if (e.newValue !== rawValueRef.current) {
                    rawValueRef.current = e.newValue;
                    setValue(e.newValue ? parser(e.newValue) : undefined);
                }
            } catch (e) {
                logger(e);
            }
        };

        if (typeof window === "undefined") return;

        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, [key, syncData]);

    return [value, setValue];
}

export default useLocalStorage;