import React from 'react';
import { useTutorials } from './hooks/useTutorials.jsx';
import { useAuthContext } from './contexts/AuthContext.jsx';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaHourglassHalf, FaPlayCircle, FaBullseye } from 'react-icons/fa'; // Importer FaBullseye
import './TutorialsMenu.scss';

const TutorialsMenu = () => {
    const { t } = useTranslation();
    const { me } = useAuthContext();
    // On récupère les nouvelles données du hook
    const { tutorials, isLoadingTutorials, startTutorial, activeTutorialState, activeTutorialDetails } = useTutorials();

    if (isLoadingTutorials) {
        return <div>{t('loading')}...</div>;
    }

    if (!tutorials || tutorials.length === 0) {
        return <p>{t('tutorial.none_available', 'Aucun tutoriel disponible pour le moment.')}</p>;
    }

    return (
        <ul className="tutorials-list">
            {tutorials.map((tutorial) => {
                const isCompleted = me?.completedTutorials?.includes(tutorial.id);
                const isInProgress = activeTutorialState?.id === tutorial.id;

                let statusBadge;
                if (isCompleted) {
                    statusBadge = <span className="status-badge completed"><FaCheckCircle /> {t('tutorial.status.completed', 'Terminé')}</span>;
                } else if (isInProgress) {
                    statusBadge = <span className="status-badge in-progress"><FaHourglassHalf /> {t('tutorial.status.in_progress', 'En cours')}</span>;
                }

                return (
                    <li key={tutorial.id} className={`tutorial-item ${isCompleted ? 'is-completed' : ''} ${isInProgress ? 'is-in-progress' : ''}`}>
                        <div className="tutorial-header">
                            <div className="tutorial-info">
                                <h4>{t(`tutorial.${tutorial.id}.name`, tutorial.name)}</h4>
                                <p>{t(`tutorial.${tutorial.id}.description`, tutorial.description)}</p>
                            </div>
                            <div className="tutorial-actions">
                                {statusBadge}
                                {!isCompleted && (
                                    <button
                                        className="start-button"
                                        onClick={() => startTutorial(tutorial.id)}
                                        disabled={isInProgress}
                                    >
                                        <FaPlayCircle /> {isInProgress ? t('tutorial.restart', 'Reprendre') : t('tutorial.start', 'Démarrer')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* --- NOUVELLE SECTION POUR LES DÉTAILS DE L'ÉTAPE EN COURS --- */}
                        {isInProgress && activeTutorialDetails && (
                            <div className="tutorial-progress-details">
                                <h5>
                                    <FaBullseye />
                                    {t('tutorial.objective_title', 'Objectif de l\'étape')} ({activeTutorialState.stage}/{activeTutorialDetails.totalStages})
                                </h5>
                                <p className="stage-description">{t(`tutorial.${tutorial.id}.stage.${activeTutorialDetails.currentStage.stage}.description`, activeTutorialDetails.currentStage.description || activeTutorialDetails.currentStage.name)}</p>

                                {/* --- AJOUT DE LA BARRE DE PROGRESSION --- */}
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{ width: `${(activeTutorialState.stage / activeTutorialDetails.totalStages) * 100}%` }}
                                    ></div>
                                </div>

                                <p className="stage-condition">{t('tutorial.condition.base', `Filtre de réussite :`)}<pre>{JSON.stringify(activeTutorialDetails.currentStage.completionCondition, null, 2)}</pre></p>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default TutorialsMenu;