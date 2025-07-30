// ModelContext.jsx
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import useLocalStorage from "../hooks/useLocalStorage.js";

const UIContext = createContext(null);

export const UIProvider = ({ children }) => {

    const [tourStepIndex, setTourStepIndex] = useState(0);
    const [currentTourSteps, setCurrentTourSteps] = useState([]);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [allTourSteps, setAllTourSteps] = useState([]);
    const [launchedTours, setLaunchedTours] = useState([]);

    const [currentTour, setCurrentTour] = useLocalStorage("spotlight-tour", null);
    const [finishedTours, setLSTours] = useLocalStorage('launchedTours', []);
useEffect(() =>{
    if( launchedTours)
    setLSTours(launchedTours);
}, [launchedTours])

    const [isLocked, setLocked] = useState(false);
    const contextValue = useMemo(() => ({
        isLocked,
        setLocked,
        currentTourSteps, setCurrentTourSteps,
        launchedTours,setLaunchedTours,
        currentTour, setCurrentTour,
        isTourOpen, setIsTourOpen, setAllTourSteps, allTourSteps,
        tourStepIndex, setTourStepIndex
    }), [isLocked,
        setLocked,
        currentTourSteps, setCurrentTourSteps,
        launchedTours,setLaunchedTours,
        currentTour, setCurrentTour,
        isTourOpen, setIsTourOpen, setAllTourSteps, allTourSteps,
        tourStepIndex, setTourStepIndex]);

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