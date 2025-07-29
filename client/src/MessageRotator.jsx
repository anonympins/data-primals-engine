// src/components/MessageRotator.jsx
import React from 'react';
import PropTypes from 'prop-types';
import './MessageRotator.scss'; // Nous allons créer ce fichier CSS pour l'effet de fondu

/**
 * Affiche une série de messages les uns après les autres avec un effet de fondu.
 *
 * @param {object[]} messages - Tableau d'objets messages. Chaque objet peut contenir:
 *   - text: (string) Le texte du message.
 *   - duration: (number, optionnel) Durée d'affichage en millisecondes pour ce message spécifique.
 * @param {number} defaultDelay - Délai d'affichage par défaut en millisecondes si `duration` n'est pas spécifié pour un message.
 * @param {number} fadeDuration - Durée de l'effet de fondu en millisecondes.
 * @param {string} className - Classe CSS optionnelle pour le conteneur principal.
 */
const MessageRotator = ({ messages, defaultDelay = 3000, fadeDuration = 500, className = '' }) => {
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [isVisible, setIsVisible] = React.useState(true);

    React.useEffect(() => {
        if (!messages || messages.length === 0) {
            return;
        }

        // Déclenche le fondu entrant
        setIsVisible(true);

        const currentMessage = messages[currentIndex];
        const displayDuration = currentMessage.duration || defaultDelay;

        // Timer pour le fondu sortant
        const fadeOutTimer = setTimeout(() => {
            setIsVisible(false);
        }, displayDuration);

        // Timer pour passer au message suivant (après la durée du fondu sortant)
        const nextMessageTimer = setTimeout(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length);
        }, displayDuration + fadeDuration);

        return () => {
            clearTimeout(fadeOutTimer);
            clearTimeout(nextMessageTimer);
        };
    }, [currentIndex, messages, defaultDelay, fadeDuration]);

    if (!messages || messages.length === 0) {
        return null; // Ne rien afficher si pas de messages
    }

    const messageStyle = {
        transition: `opacity ${fadeDuration}ms ease-in-out`,
        opacity: isVisible ? 1 : 0,
    };

    return (
        <div className={`message-rotator-container ${className}`}>
            <div style={messageStyle} className="message-rotator-text">
                {messages[currentIndex].text}
            </div>
        </div>
    );
};

MessageRotator.propTypes = {
    messages: PropTypes.arrayOf(
        PropTypes.shape({
            text: PropTypes.string.isRequired,
            duration: PropTypes.number,
        })
    ).isRequired,
    defaultDelay: PropTypes.number,
    fadeDuration: PropTypes.number,
    className: PropTypes.string,
};

export default MessageRotator;