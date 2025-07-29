// client/src/HiddenableCell.jsx
import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import './HiddenableCell.scss';

export const HiddenableCell = ({ value }) => {
    const { t } = useTranslation();
    const [isRevealed, setIsRevealed] = useState(false);

    const toggleVisibility = () => {
        setIsRevealed(!isRevealed);
    };

    return (
        <div className="hiddenable-cell">
            {isRevealed ? (
                // --- État visible ---
                <>
                    <span className="revealed-content">{value}</span>
                    <button
                        type="button"
                        onClick={toggleVisibility}
                        className="hide-toggle-btn"
                        title={t('tooltip.hideContent', 'Cacher le contenu')}
                    >
                        <FaEyeSlash />
                    </button>
                </>
            ) : (
                // --- État masqué (par défaut) ---
                <>
                    <span className="hidden-placeholder">••••••••••</span>
                    <button
                        type="button"
                        onClick={toggleVisibility}
                        className="hide-toggle-btn"
                        title={t('tooltip.showHiddenContent', 'Afficher le contenu')}
                    >
                        <FaEye />
                    </button>
                </>
            )}
        </div>
    );
};