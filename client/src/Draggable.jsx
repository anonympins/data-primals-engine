import React, { useState, useRef, useEffect } from 'react';
import './Draggable.scss'; // Fichier pour les styles (à créer)

function Draggable({ items: initialItems = [], renderItem, onChange }) {
    const [items, setItems] = useState(initialItems);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [overIndex, setOverIndex] = useState(null);

    const itemRefs = useRef([]); // Pour stocker les refs des éléments li

    // Mettre à jour l'état interne si les items initiaux changent
    useEffect(() => {
        setItems(initialItems);
        // Rnitialiser les refs si la longueur change
        itemRefs.current = itemRefs.current.slice(0, initialItems.length);
    }, [initialItems]);

    // --- Gestionnaires d'événements Drag & Drop (Bureau) ---

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        // Optionnel: Ajouter une classe pour le style de l'élément glissé
        e.currentTarget.classList.add('dragging');
        // Nécessaire pour Firefox
        e.dataTransfer.effectAllowed = 'move';
        // On peut mettre l'ID ou l'index dans dataTransfer si besoin, mais on utilise l'état ici
        e.dataTransfer.setData('text/plain', index);
    };

    const handleDragEnter = (e, index) => {
        e.preventDefault(); // Important pour permettre le drop
        if (index !== draggedIndex) {
            setOverIndex(index); // Pour le style de la cible potentielle

            // Logique de réorganisation immédiate (optionnel, pour feedback visuel)
            // Décommenter si vous voulez voir l'élément bouger pendant le drag
            /*
            if (draggedIndex !== null) {
                const newItems = [...items];
                const [draggedItem] = newItems.splice(draggedIndex, 1);
                newItems.splice(index, 0, draggedItem);
                setItems(newItems);
                setDraggedIndex(index); // Mettre à jour l'index aprs déplacement
            }
            */
        } else {
            setOverIndex(null);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Doit être présent pour que onDrop fonctionne
    };

    const handleDragLeave = (e) => {
        // Optionnel: Réinitialiser overIndex si on quitte la zone sans dropper
        // setOverIndex(null);
    };

    const handleDrop = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) {
            setOverIndex(null);
            return; // Ne rien faire si on drop sur soi-même ou si rien n'est glissé
        }

        const newItems = [...items];
        const [draggedItem] = newItems.splice(draggedIndex, 1);
        newItems.splice(index, 0, draggedItem);

        setItems(newItems);
        setOverIndex(null);

        // Appeler le callback onChange avec la nouvelle liste triée
        if (onChange) {
            onChange(newItems);
        }
    };

    const handleDragEnd = (e) => {
        // Nettoyer l'état et les styles
        e.currentTarget.classList.remove('dragging');
        setDraggedIndex(null);
        setOverIndex(null);
    };

    // --- Gestionnaires d'événements Tactiles (Mobile) ---

    const touchStartY = useRef(0);
    const currentTouchY = useRef(0);
    const initialScrollTop = useRef(0); // Pour gérer le scroll pendant le drag tactile

    const handleTouchStart = (e, index) => {
        setDraggedIndex(index);
        touchStartY.current = e.touches[0].clientY;
        currentTouchY.current = touchStartY.current;
        initialScrollTop.current = e.currentTarget.closest('.draggable-list')?.scrollTop || 0; // Stocker le scroll initial du conteneur

        // Ajouter un style visuel
        const target = itemRefs.current[index];
        if (target) {
            target.classList.add('dragging-touch');
        }
        // Empcher le scroll de la page pendant le drag de l'élément
        // Attention: cela peut être trop agressif selon l'UX souhaitée
        // document.body.style.overflow = 'hidden';
    };

    const handleTouchMove = (e) => {
        if (draggedIndex === null) return;

        currentTouchY.current = e.touches[0].clientY;
        const draggedElement = itemRefs.current[draggedIndex];

        if (draggedElement) {
            // Déplacer visuellement l'élément (simple translation pour le feedback)
            // Une implémentation plus robuste utiliserait une copie ou un placeholder
            const deltaY = currentTouchY.current - touchStartY.current;
            draggedElement.style.transform = `translateY(${deltaY}px)`;
            draggedElement.style.zIndex = '100'; // Mettre au-dessus des autres

            // Déterminer sur quel élément on survole
            let newOverIndex = null;
            itemRefs.current.forEach((ref, index) => {
                if (ref && index !== draggedIndex) {
                    const rect = ref.getBoundingClientRect();
                    // Si le centre vertical du doigt est dans les limites de l'élément
                    if (currentTouchY.current > rect.top && currentTouchY.current < rect.bottom) {
                        newOverIndex = index;
                        ref.classList.add('drag-over'); // Style pour la cible
                    } else {
                        ref.classList.remove('drag-over');
                    }
                }
            });

            // Si on survole un nouvel élément, mettre à jour l'état overIndex
            if (newOverIndex !== null && newOverIndex !== overIndex) {
                setOverIndex(newOverIndex);
            } else if (newOverIndex === null) {
                setOverIndex(null);
            }

            // --- Auto-scroll (optionnel mais utile sur mobile) ---
            const listElement = draggedElement.closest('.draggable-list');
            if (listElement) {
                const listRect = listElement.getBoundingClientRect();
                const touchOffsetInList = currentTouchY.current - listRect.top;
                const scrollThreshold = 50; // Pixels près du bord pour déclencher le scroll

                if (touchOffsetInList < scrollThreshold) {
                    // Scroller vers le haut
                    listElement.scrollTop -= 10;
                } else if (touchOffsetInList > listRect.height - scrollThreshold) {
                    // Scroller vers le bas
                    listElement.scrollTop += 10;
                }
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (draggedIndex === null) return;

        const draggedElement = itemRefs.current[draggedIndex];
        if (draggedElement) {
            // Réinitialiser le style visuel
            draggedElement.style.transform = '';
            draggedElement.style.zIndex = '';
            draggedElement.classList.remove('dragging-touch');
        }
        itemRefs.current.forEach(ref => ref?.classList.remove('drag-over'));
        // document.body.style.overflow = ''; // Ractile
        if (overIndex !== null && overIndex !== draggedIndex) {
            const newItems = [...items];
            const [draggedItem] = newItems.splice(draggedIndex, 1);
            newItems.splice(overIndex, 0, draggedItem);

            setItems(newItems);

            // Appeler le callback onChange
            if (onChange) {
                onChange(newItems);
            }
        }

        // Nettoyer l'état
        setDraggedIndex(null);
        setOverIndex(null);
        touchStartY.current = 0;
        currentTouchY.current = 0;
        initialScrollTop.current = 0;
    };

    return (
        <ul className="draggable-list">
            {items.map((item, index) => (
                <li
                    key={item.id} // Assurez-vous que chaque item a un id unique
                    ref={el => itemRefs.current[index] = el} // Stocker la ref
                    draggable={true} // Activer le drag natif
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, index)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`draggable-item ${index === overIndex ? 'drag-over' : ''}`}
                    style={{ opacity: index === draggedIndex ? 0.5 : 1 }} // Style simple pour l'élément glissé
                >
                    {/* Rendre le contenu de l'item via la fonction renderItem */}
                    {renderItem ? renderItem(item, index) : JSON.stringify(item)}
                </li>
            ))}
        </ul>
    );
}

export default Draggable;