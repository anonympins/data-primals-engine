import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useAuthContext } from '../contexts/AuthContext.jsx';
import { useUI } from '../contexts/UIContext.jsx';
import { useNotificationContext } from '../NotificationProvider.jsx';
import { tutorialsConfig } from '../tutorials.js';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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

    // Refs pour gérer la file d'attente des vérifications
    const isCheckingRef = useRef(false);
    const isCheckQueuedRef = useRef(false);

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
        if (isCheckingRef.current) {
            console.log('[Tutoriels] Vérification déjà en cours, mise en file d\'attente.');
            isCheckQueuedRef.current = true; // Mettre en attente
            return;
        }
        if (!me?.activeTutorial || !tutorials) return;

        isCheckingRef.current = true;
        console.log('[Tutoriels] Démarrage de la vérification en chaîne...');

        try {
            let currentActiveState = me.activeTutorial;

            while (true) {
                const tutorial = tutorials.find(t => t._id === currentActiveState.id);
                if (!tutorial) break;

                const stageConfig = tutorial.stages.find(s => s.stage === currentActiveState.stage);
                if (!stageConfig) {
                    console.log('[Tutoriels] Fin du tutoriel, attribution des récompenses.');
                    claimRewards(tutorial._id);
                    updateActiveTutorial(null);
                    setIsTourOpen(false);
                    break;
                }

                const { isCompleted } = await checkCompletionCondition(stageConfig.completionCondition);

                if (isCompleted) {
                    console.log(`[Tutoriels] Étape ${currentActiveState.stage} complétée, passage à la suivante.`);

                    // Clés de traduction structurées et robustes
                    const titleKey = `tutorial.${tutorial.id}.stage.${currentActiveState.stage}.name`;
                    const descriptionKey = `tutorial.${tutorial.id}.stage.${currentActiveState.stage}.description`;

                    addNotification({
                        title: t(titleKey, stageConfig.name),
                        message: t(descriptionKey, stageConfig.description),
                        status: 'success'
                    });
                    currentActiveState = { id: currentActiveState.id, stage: currentActiveState.stage + 1 };
                } else {
                    console.log(`[Tutoriels] Arrêt à l'étape ${currentActiveState.stage} (non complétée).`);
                    if (currentActiveState.stage !== me.activeTutorial.stage) {
                        updateActiveTutorial(currentActiveState);
                        launchTour(stageConfig.tourName);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error("[Tutoriels] Erreur lors de la vérification en chaîne :", error);
        } finally {
            isCheckingRef.current = false;
            console.log('[Tutoriels] Vérification en chaîne terminée, verrou libéré.');

            // Si une vérification a été mise en attente, on la lance maintenant.
            if (isCheckQueuedRef.current) {
                console.log('[Tutoriels] Lancement de la vérification mise en file d\'attente.');
                isCheckQueuedRef.current = false;
                triggerTutorialCheck();
            }
        }
    }, [
        tutorials, checkCompletionCondition, claimRewards, updateActiveTutorial,
        addNotification, launchTour, t, setIsTourOpen, me
    ]);

    useEffect(() => {
        setMe(prevMe => ({ ...prevMe, activeTutorial: activeTuto }));
    }, [activeTuto]);

    // Écoute les événements de modification de données pour vérifier la progression en arrière-plan.
    useEffect(() => {
        const handleDataChange = (payload) => {
            console.log(`[Tutoriels] Événement de données reçu.`, payload);
            if (me?.activeTutorial) {
                triggerTutorialCheck();
            }
        };

        console.log(me.activeTutorial + new Date().getMilliseconds());
        const eventTypes = ['API_ADD_DATA', 'API_EDIT_DATA', 'API_DELETE_DATA'];
        eventTypes.forEach(type => Event.Listen(type, handleDataChange, "custom", "data"));

        return () => {
            eventTypes.forEach(type => Event.RemoveCallback(type, handleDataChange, "custom", "data"));
        };
    }, [me?.activeTutorial]);

    // Vérifie la progression lorsqu'un tutoriel devient actif ou que son étape change.
    useEffect(() => {
        triggerTutorialCheck();
    },[]);
    return {
        tutorials,
        isLoadingTutorials,
        startTutorial,
        activeTutorialState,
        activeTutorialDetails,
        triggerTutorialCheck,
    };
};