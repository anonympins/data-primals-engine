// ModelContext.jsx
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import useLocalStorage from "../hooks/useLocalStorage.js";

const UIContext = createContext(null);

export const UIProvider = ({ children }) => {

    const [tourStepIndex, setTourStepIndex] = useState(0);
    const [currentTourSteps, setCurrentTourSteps] = useState([]);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [allTourSteps, setAllTourSteps] = useState({});

    const [chartToAdd, setChartToAdd] = useState(null);
    const [flexViewToAdd, setFlexViewToAdd] = useState(null);
    const [htmlViewToAdd, setHtmlViewToAdd] = useState(null);

    const [currentTour, setCurrentTour] = useLocalStorage("spotlight-tour", null);
// This is the single source of truth for tours that have been launched.
    // It correctly reads from localStorage on initial load and persists any changes.
    const [launchedTours, setLaunchedTours] = useLocalStorage('launchedTours', []);

    // A stable helper function to add a tour to the list without overwriting.
    const addLaunchedTour = useCallback((tourName) => {
        setLaunchedTours(prevTours => {
            // Ensure we're working with an array, even if localStorage is empty/corrupted.
            const currentTours = Array.isArray(prevTours) ? prevTours : [];
            if (!currentTours.includes(tourName)) {
                return [...currentTours, tourName];
            }
            return currentTours; // Return unchanged if already present
        });
    }, [setLaunchedTours]); // setLaunchedTours from useLocalStorage is stable

    const [assistantConfig, setAssistantConfig] = useState(null);
    const [isLocked, setLocked] = useState(false);
    const contextValue = useMemo(() => ({
        isLocked,
        setLocked,
        currentTourSteps, setCurrentTourSteps,
        launchedTours, setLaunchedTours, addLaunchedTour,
        currentTour, setCurrentTour,
        isTourOpen, setIsTourOpen, setAllTourSteps, allTourSteps,
        tourStepIndex, setTourStepIndex,
        chartToAdd, setChartToAdd,
        flexViewToAdd, setFlexViewToAdd,
        htmlViewToAdd, setHtmlViewToAdd,
        assistantConfig, setAssistantConfig
    }), [isLocked,
        setLocked,
        currentTourSteps, setCurrentTourSteps,
        launchedTours,setLaunchedTours,
        currentTour, setCurrentTour,
        isTourOpen, setIsTourOpen, setAllTourSteps, allTourSteps,
        tourStepIndex, setTourStepIndex, addLaunchedTour, chartToAdd, setChartToAdd,
        flexViewToAdd, setFlexViewToAdd, htmlViewToAdd, setHtmlViewToAdd,
        assistantConfig, setAssistantConfig
    ]);

    return (
        <UIContext.Provider value={contextValue}>
            <div id={"ui"} className={`${isLocked ? 'ui-locked' : ''}`}>{children}</div>
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (context === null) {
        throw new Error('useUI doit être utilisé dans un UIProvider');
    }
    return context;
};