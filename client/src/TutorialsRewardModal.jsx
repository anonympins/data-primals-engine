// Fichier : client/src/TutorialRewardModal.jsx

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaAward, FaStar } from 'react-icons/fa';
import Button from './Button.jsx';
import { useUI } from './contexts/UIContext.jsx';

// Petite fonction utilitaire pour choisir la bonne icône en fonction du type de récompense
const getRewardIcon = (reward) => {
    switch (reward.type) {
        case 'achievement':
            // L'icône 'achievement' est définie dans le CSS, mais on utilise FaAward comme base.
            return <FaAward className="reward-icon achievement" />;
        case 'xp':
            // L'icône 'xp' est définie dans le CSS, mais on utilise FaStar comme base.
            return <FaStar className="reward-icon xp" />;
        default:
            return null;
    }
};

const TutorialRewardModal = ({ rewards = [] }) => {
    const { t } = useTranslation();
    const { setIsModalOpen } = useUI();

    return (
        <div className="tutorial-reward-modal">
            <h2>{t('tutorial.completed.title', 'Tutoriel Terminé !')}</h2>
            <p>{t('tutorial.completed.congrats', 'Félicitations ! Vous avez obtenu les récompenses suivantes :')}</p>

            <ul className="reward-list">
                {rewards.map((reward, index) => (
                    <li key={index} className="reward-item">
                        {getRewardIcon(reward)}
                        <div className="reward-details">
                            {reward.type === 'achievement' && (
                                <>
                                    <span className="reward-type">{t('reward.type.achievement', 'Succès débloqué')}</span>
                                    <span className="reward-name">{reward.name}</span>
                                </>
                            )}
                            {reward.type === 'xp' && (
                                <>
                                    <span className="reward-type">{t('reward.type.xp', 'Expérience gagnée')}</span>
                                    <span className="reward-name">
                                        {t('reward.xp.details', '{{amount}} XP en {{skill}}', { amount: reward.amount, skill: reward.skill })}
                                    </span>
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            <div className="actions center">
                <Button onClick={() => setIsModalOpen(false)} className="btn-primary">
                    {t('btns.great', 'Génial !')}
                </Button>
            </div>
        </div>
    );
};

export default TutorialRewardModal;