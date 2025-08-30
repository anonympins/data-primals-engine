import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useAuthContext } from '../contexts/AuthContext.jsx';
import { useUI } from '../contexts/UIContext.jsx';
import { useNotificationContext } from '../NotificationProvider.jsx';
import { tutorialsConfig } from '../tutorials.js';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useLocalStorage from "./useLocalStorage.js";
import {Event} from "../../../src/events.js";

/**
 * Hook pour gérer la logique des tutoriels multi-étapes.
 * Il interagit avec l'état de l'utilisateur, lance les tours guidés (TourSpotlight)
 * et communique avec le backend pour vérifier la progression et attribuer les récompenses.
 */
export const useTutorials = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { me, setMe } = useAuthContext();
    const { allTourSteps, setCurrentTourSteps, setIsTourOpen } = useUI();
    const { addNotification } = useNotificationContext();

    // Ref pour "verrouiller" la vérification d'une étape spécifique et éviter les notifications en double
    // à cause des re-renders rapides (race condition).
    const completingStepRef = useRef(null);

    const { data: tutorials, isLoading: isLoadingTutorials } = useQuery('tutorials', async () => {
        return tutorialsConfig.map(t => ({ ...t, _id: t.id }));
    }, { staleTime: Infinity });

    const activeTutorialState = me?.activeTutorial;

    const activeTutorialDetails = useMemo(() => {
        if (!activeTutorialState || !tutorials) return null;
        const tutorial = tutorials.find(t => t._id === activeTutorialState.id);
        if (!tutorial) return null;
        const currentStage = tutorial.stages.find(s => s.stage === activeTutorialState.stage);
        if (!currentStage) return null;
        return {
            totalStages: tutorial.stages.length,
            currentStage: currentStage,
        };
    }, [activeTutorialState, tutorials]);

    // --- MUTATIONS VERS LE BACKEND ---

    const [activeTuto, setActiveTuto] = useLocalStorage('activeTuto', null);

    const { mutate: updateActiveTutorial } = useMutation(
        (tutorialState) => fetch('/api/tutorials/set-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tutorialState }),
        }).then(res => res.json()),
        {
            onSuccess: (data) => {
                if (/^demo[0-9]{1,2}$/.test(me?.username)) {
                    setActiveTuto(data.updatedData.activeTutorial);
                    gtag("event", "signed_in (demo)");
                }
                setMe(prevMe => ({ ...prevMe, activeTutorial: data.updatedData.activeTutorial }));
                queryClient.invalidateQueries('me');
            },
            onError: () => addNotification({
                title: t('tutorial.error.update_state_message', 'Impossible de sauvegarder votre progression.'),
                status: 'error',
            })
        }
    );

    const { mutateAsync: checkCompletionCondition } = useMutation(
        (condition) => fetch('/api/tutorials/check-completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(condition),
        }).then(res => res.json())
    );

    const { mutate: claimRewards } = useMutation(
        (tutorialId) => fetch(`/api/tutorials/${tutorialId}/claim-rewards`, { method: 'POST' }).then(res => res.json()),
        {
            onSuccess: (data) => {
                const newMe = {...me, ...data.userUpdate};
                setMe(newMe);
                queryClient.setQueryData('me', newMe);
                if (data.notification) {
                    addNotification({
                        title: data.notification.title,
                        id: 'claim-'+(new Date().getMilliseconds()),
                        message: data.notification.message,
                        status: 'success',
                        timeout: 8000
                    });
                }
            },
            onError: () => addNotification({
                title: t('tutorial.error.claim_rewards_message', 'Un problème est survenu lors de l\'attribution de vos récompenses.'),
                status: 'error',
            })
        }
    );

    const launchTour = (tourName) => {
        const tourSteps = allTourSteps[tourName];
        if (tourSteps && tourSteps.length > 0) {
            setCurrentTourSteps(tourSteps);
            setIsTourOpen(true);
        } else {
            console.warn(`[Tutoriels] Tour guidé non trouvé pour le nom : ${tourName}`);
        }
    };

    const startTutorial = (tutorialId) => {
        const tutorial = tutorials?.find(t => t._id === tutorialId);
        if (!tutorial) return;
        const firstStage = tutorial.stages?.[0];
        if (!firstStage) return;
        const newActiveState = { id: tutorialId, stage: 1 };
        updateActiveTutorial(newActiveState);
        launchTour(firstStage.tourName);
    };
    
    const triggerTutorialCheck = useCallback(async () => {
        // S'il n'y a pas de tutoriel actif, on ne fait rien.
        if (!me?.activeTutorial || !tutorials) {
            return;
        }

        const { id: currentTutorialId, stage: currentStageNumber } = me.activeTutorial;
        const stepIdentifier = `${currentTutorialId}-${currentStageNumber}`;

        // --- VERROUILLAGE (LOCK) ---
        // Si on est déjà en train de traiter cette étape exacte, on ignore les appels suivants
        // pour éviter les notifications multiples.
        if (completingStepRef.current === stepIdentifier) {
            console.log(`[Tutoriels] Vérification pour l'étape ${stepIdentifier} déjà en cours. On ignore.`);
            return;
        }

        const tutorial = tutorials.find(t => t._id === currentTutorialId);
        const stageConfig = tutorial?.stages.find(s => s.stage === currentStageNumber);

        if (!stageConfig) return; // Pas d'étape active à vérifier

        try {
            // On pose le verrou pour cette étape
            completingStepRef.current = stepIdentifier;
            console.log(`[Tutoriels] Verrouillage et vérification de l'étape ${stepIdentifier}`);

            const { isCompleted } = await checkCompletionCondition(stageConfig.completionCondition);

            if (isCompleted) {
                console.log(`[Tutoriels] Étape ${currentStageNumber} complétée.`);

                const titleKey = `tutorial.${tutorial.id}.stage.${currentStageNumber}.name`;
                const descriptionKey = `tutorial.${tutorial.id}.stage.${currentStageNumber}.description`;

                addNotification({
                    title: t(titleKey, stageConfig.name),
                    message: t(descriptionKey, stageConfig.description),
                    status: 'success',
                    id: `tuto-step-${stepIdentifier}` // ID unique pour la notification
                });

                // On passe à l'étape suivante (ou on termine le tutoriel)
                const nextStageNumber = currentStageNumber + 1;
                const nextStage = tutorial.stages.find(s => s.stage === nextStageNumber);

                if (nextStage) {
                    updateActiveTutorial({ id: currentTutorialId, stage: nextStageNumber });
                    launchTour(nextStage.tourName);
                } else {
                    claimRewards(tutorial._id);
                    updateActiveTutorial(null);
                    setIsTourOpen(false);
                }
            } else {
                console.log(`[Tutoriels] Étape ${currentStageNumber} non complétée.`);
            }
        } catch (error) {
            console.error("[Tutoriels] Erreur lors de la vérification de l'étape :", error);
        } finally {
            // On libère le verrou
            completingStepRef.current = null;
            console.log(`[Tutoriels] Libération du verrou pour l'étape ${stepIdentifier}`);
        }
    }, [me, tutorials, checkCompletionCondition, updateActiveTutorial, claimRewards, addNotification, launchTour, t, setIsTourOpen]);

    useEffect(() => {
        setMe(prevMe => ({ ...prevMe, activeTutorial: activeTuto }));
    }, [activeTuto]);

    // Écoute les événements de modification de données pour vérifier la progression en arrière-plan.
    useEffect(() => {
        const handleDataChange = async (payload) => {
            if (me?.activeTutorial) {
                console.log(`[Tutoriels] Événement de données reçu, déclenchement de la vérification.`, payload);
                triggerTutorialCheck();
            }
        };

        const eventTypes = ['API_ADD_DATA', 'API_EDIT_DATA', 'API_DELETE_DATA'];
        eventTypes.forEach(type => Event.Listen(type, handleDataChange, "custom", "data"));

        return () => {
            eventTypes.forEach(type => Event.RemoveCallback(type, handleDataChange, "custom", "data"));
        };
    }, [me?.activeTutorial, triggerTutorialCheck]);

    // Vérifie la progression lorsqu'un tutoriel devient actif ou que son étape change.
    useEffect(() => {
        triggerTutorialCheck();
    },[me?.activeTutorial]); // Se déclenche quand le tutoriel/étape change

    return {
        tutorials,
        isLoadingTutorials,
        startTutorial,
        activeTutorialState,
        activeTutorialDetails,
        triggerTutorialCheck,
    };
};