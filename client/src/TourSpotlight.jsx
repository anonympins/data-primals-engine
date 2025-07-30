// C:/Dev/hackersonline-engine/client/src/TourSpotlight.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TourSpotlight.scss';
import { useUI } from "./contexts/UIContext.jsx";
import useLocalStorage from "./hooks/useLocalStorage.js";

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function TourSpotlight({ name, steps = [], isOpen, onComplete, onClose, initialStepIndex = 0 }) {
    const { tourStepIndex, setTourStepIndex, launchedTours, setLaunchedTours, currentTour, setCurrentTour, setCurrentTourSteps } = useUI();
    const [targetRect, setTargetRect] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef(null);
    const highlightRef = useRef(null);

    const currentStep = steps[tourStepIndex];

    // Réinitialiser l'index quand le tour s'ouvre
    useEffect(() => {
        if (isOpen) {
            setTourStepIndex(initialStepIndex);
            const rafId = requestAnimationFrame(() => {
                calculateRectAndScroll();
            });
            return () => cancelAnimationFrame(rafId);
        } else {
            setTargetRect(null);
        }
    }, [isOpen, initialStepIndex]);

    const calculateRectAndScroll = useCallback(() => {
        if (!isOpen || !currentStep?.selector) {
            setTargetRect(null);
            return;
        }

        const element = document.querySelector(currentStep.selector);
        if (element) {
            const rect = element.getBoundingClientRect();
            if (!targetRect || rect.top !== targetRect.top || rect.left !== targetRect.left || rect.width !== targetRect.width || rect.height !== targetRect.height) {
                setTargetRect(rect);
            }
        } else {
            console.warn(`[TourSpotlight] Élément cible non trouvé : ${currentStep.selector}`);
            setTargetRect(null);
        }
    }, [isOpen, currentStep?.selector, targetRect]);

    useEffect(() => {
        if (!isOpen || !name) return;

        if (!currentStep?.selector) {
            console.warn(`[TourSpotlight] Élément cible non défini pour le tour ${name}`);
            return;
        }

        const element = document.querySelector(currentStep.selector);
        if (element && currentTour !== name) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        const rafId = requestAnimationFrame(calculateRectAndScroll);
        const debouncedCalculate = debounce(calculateRectAndScroll, 100);
        window.addEventListener('resize', debouncedCalculate);
        window.addEventListener('scroll', debouncedCalculate, true);
        setCurrentTour(name);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', debouncedCalculate);
            window.removeEventListener('scroll', debouncedCalculate, true);
        };
    }, [isOpen, tourStepIndex, currentStep?.selector, calculateRectAndScroll, name]);

    useEffect(() => {
        if (!targetRect || !tooltipRef.current) {
            setTooltipPosition({ top: -9999, left: -9999 });
            return;
        };
        const tooltipEl = tooltipRef.current;
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const spacing = 15;
        let pos = { top: 0, left: 0 };
        const positionPreference = currentStep.position || 'bottom';
        switch (positionPreference) {
            case 'top':
                pos = { top: targetRect.top - tooltipRect.height - spacing, left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2 };
                break;
            case 'left':
                pos = { top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2, left: targetRect.left - tooltipRect.width - spacing };
                break;
            case 'right':
                pos = { top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2, left: targetRect.right + spacing };
                break;
            case 'bottom':
            default:
                pos = { top: targetRect.bottom + spacing, left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2 };
                break;
        }
        pos.top = Math.max(spacing, pos.top);
        pos.left = Math.max(spacing, pos.left);
        pos.left = Math.min(window.innerWidth - tooltipRect.width - spacing, pos.left);
        pos.top = Math.min(window.innerHeight - tooltipRect.height - spacing, pos.top);
        setTooltipPosition(pos);
    }, [targetRect, currentStep?.position, tourStepIndex]);

    useEffect(() => {
        if (isOpen) {
            if (tourStepIndex === steps.length-1 && steps.length !== 1) {
                setLaunchedTours(tours => {
                    if(tours.includes(name))
                        return tours;
                    return [...tours, name];
                });
            }
        }
    }, [isOpen, launchedTours, name, setCurrentTour, tourStepIndex, steps]);

    const handleComplete = useCallback(() => {
        setCurrentTour(null);
        setLaunchedTours(tours => {
            if(tours.includes(name))
                return tours;
            return [...tours, name];
        });
        if (onComplete) {
            onComplete(name);
        } else{
            onClose?.(name);
        }
    }, [name, onComplete, onClose, setCurrentTour]);

    const handleNext = () => {
        if (tourStepIndex < steps.length - 1) {
            setTourStepIndex(prev => prev + 1);
        } else {
            handleComplete();
        }
    };

    const handlePrev = () => {
        if (tourStepIndex > 0) {
            setTourStepIndex(prev => prev - 1);
        }
    }

    const handleClose = useCallback(() => {
        setCurrentTour(null);
        setLaunchedTours(tours => {
            if( tours.includes(name) )
                return [...tours];
            return [...tours, name];
        });

        if (onClose) {
            onClose(name);
        }
    }, [onClose, name, setCurrentTour, launchedTours]);

    if (!isOpen || !currentTour || !currentStep || (launchedTours && launchedTours.includes(name))) {
        return null;
    }

    const highlightStyle = targetRect ? {
        position: 'absolute',
        top: `${targetRect.top}px`,
        left: `${targetRect.left}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
        borderRadius: '4px',
        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.75)`,
        pointerEvents: 'none',
        transition: 'top 0.3s ease-in-out, left 0.3s ease-in-out, width 0.3s ease-in-out, height 0.3s ease-in-out',
        zIndex: 10000,
    } : { display: 'none' };

    const tooltipStyle = {
        position: 'fixed',
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
        zIndex: 10001,
        transition: 'top 0.3s ease-in-out, left 0.3s ease-in-out',
    };

    return (
        <div
            className="tour-spotlight-container"
            onClick={handleClose}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'auto',
            }}
        >
            <div ref={highlightRef} style={highlightStyle}></div>
            {targetRect && (
                <div
                    ref={tooltipRef}
                    className="tour-tooltip"
                    style={tooltipStyle}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="tour-tooltip-content">
                        {typeof currentStep.content === 'string' ? <p>{currentStep.content}</p> : currentStep.content}
                    </div>
                    <div className="tour-tooltip-footer">
                        <span className="tour-step-indicator">
                            Étape {tourStepIndex + 1} / {steps.length}
                        </span>
                        <div className="tour-buttons">
                            {tourStepIndex > 0 && (
                                <button onClick={handlePrev} className="tour-button tour-button-prev">Précédent</button>
                            )}
                            <button onClick={handleNext} className="tour-button tour-button-next">
                                {tourStepIndex < steps.length - 1 ? 'Suivant' : 'Terminer'}
                            </button>
                        </div>
                        <button onClick={handleClose} className="tour-button-close" aria-label="Fermer le tour">×</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TourSpotlight;