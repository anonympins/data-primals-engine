// Dans C:/Dev/hackersonline-engine/client/src/RTETrans.jsx (Nouveau fichier)
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RTE } from './RTE.jsx';
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useQuery} from "react-query";
import {getUserId} from "data-primals-engine/data";
import {useAuthContext} from "./contexts/AuthContext.jsx";

const RTETrans = ({ value, onChange, field }) => {
    const { t } = useTranslation();
    const { me } = useAuthContext();

    const { data: langs } = useQuery("langsz", ({signal}) => {

        const params = new URLSearchParams();
        params.append('model', 'lang');
        params.append("_user", getUserId(me));
        params.append("depth", '1');
        return fetch(`/api/data/search?${params.toString()}`, { signal, method: 'POST', body: JSON.stringify({}), headers: { "Content-Type": "application/json"}})
            .then((res) => res.json())
            .then((data) => {
                setAvailableLangs(data.data || []);
            })
    },{ enabled: true })
    // La valeur est un objet comme { fr: "...", en: "..." }
    const existingLangs = Object.keys(value || {});
    const [activeTab, setActiveTab] = useState(existingLangs[0] || null);
    const [availableLangs, setAvailableLangs] = useState([]);

    // Mettre à jour l'onglet actif si la valeur change de l'extérieur
    useEffect(() => {
        const currentLangs = Object.keys(value || {});
        if (!currentLangs.includes(activeTab)) {
            setActiveTab(currentLangs[0] || null);
        }
    }, [value, activeTab]);

    const handleRteChange = (htmlContent) => {
        const newValue = {
            ...value,
            [activeTab]: htmlContent.value,
        };
        onChange(newValue);
    };

    const handleAddLanguage = (langCode) => {
        if (!langCode || (value && value.hasOwnProperty(langCode))) return;
        const newValue = {
            ...(value || {}),
            [langCode]: '', // Initialiser avec un contenu vide
        };
        onChange(newValue);
        setActiveTab(langCode); // Activer le nouvel onglet
    };
    const languagesToAdd = availableLangs.filter(lang => !existingLangs.includes(lang.code));

    return (
        <div className="rte-trans-container">
            <div className="tabs-container flex items-center border-b border-gray-200">
                {(existingLangs).map(lang => (
                    <button
                        key={lang}
                        type="button"
                        onClick={() => setActiveTab(lang)}
                        title={availableLangs.find(f=>f.code===lang)?.name.value || ''}
                    >
                        {lang.toUpperCase()}
                    </button>
                ))}
                {languagesToAdd.length > 0 && (
                    <div>
                        <select
                            onChange={(e) => handleAddLanguage(e.target.value)}
                            value=""
                        >
                            <option value="" disabled>{t('add_language', 'Ajouter...')}</option>
                            {languagesToAdd.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.name.value} ({lang.code})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
            <div className="rte-content mt-2">
                {activeTab ? (
                    <RTE
                        key={activeTab}
                        value={value?.[activeTab] || ''}
                        onChange={handleRteChange}
                        field={field}
                    />
                ) : (
                    <div>{t('select_or_add_language', 'Sélectionnez ou ajoutez une langue pour commencer.')}</div>
                )}
            </div>
        </div>
    );
};

export default RTETrans;