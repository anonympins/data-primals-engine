// client/src/components/AssistantChat.jsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FaRobot, FaPaperPlane, FaTimes, FaExpand, FaCompress, FaPlus } from 'react-icons/fa';
import './AssistantChat.scss';
import { useModelContext } from "./contexts/ModelContext.jsx";
import { Trans, useTranslation } from "react-i18next";
import Markdown from 'react-markdown';
import {useQueryClient} from "react-query";
import {providers} from "../../src/modules/assistant/constants.js";
import DashboardChart from "./DashboardChart.jsx";
import FlexViewCard from "./FlexViewCard.jsx";
import HtmlViewCard from "./HtmlViewCard.jsx";
import {useUI} from "./contexts/UIContext.jsx";
import Button from "./Button.jsx";
import {getUserHash, getUserId} from "../../src/data.js";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useNavigate} from "react-router-dom";
import {DataTable} from "./DataTable.jsx";

const AssistantChat = ({ config }) => {
    const { selectedModel, models } = useModelContext();
    const { me } = useAuthContext();
    const nav = useNavigate();
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [messages, setMessages] = useState([
        { from: 'bot', text: t('assistant.welcome') }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { setChartToAdd, setFlexViewToAdd, setHtmlViewToAdd } = useUI();

    // NOUVEL ÉTAT : Stocke une action en attente de confirmation de l'utilisateur
    const [pendingConfirmation, setPendingConfirmation] = useState(null);

    // NOUVEAU : Référence pour le défilement automatique
    const messagesEndRef = useRef(null);

    // Fonction pour défiler vers le bas
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const queryClient = useQueryClient();

    // Défiler vers le bas à chaque nouveau message ou changement de statut de chargement
    useEffect(scrollToBottom, [messages, isLoading]);

    // Fonction centralisée pour appeler l'API de l'assistant
    const handleApiCall = async (payload) => {
        setIsLoading(true);
        // On efface toute confirmation en attente dès qu'une nouvelle action est lancée
        setPendingConfirmation(null);
        const isConfirmation = !!payload.confirmedAction;
        if (!isConfirmation) {
            setPendingConfirmation(null);
        }
        try {
            const response = await fetch('/api/assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                if (isConfirmation) {
                    const modelToInvalidate = payload.confirmedAction.params.model;
                    if (modelToInvalidate) {
                        console.log(`[Assistant] Action on model '${modelToInvalidate}' succeeded. Invalidating cache.`);
                        // Invalide toutes les requêtes qui commencent par ce tableau.
                        // C'est la mode la plus simple et la plus sûre pour s'assurer
                        // que toutes les vues de ces données (paginées ou non) sont rafraîchies.
                        queryClient.invalidateQueries(['api/data', modelToInvalidate]);
                    }
                }

                // Fonction pour créer un message bot à partir d'un résultat
                const createBotMessage = (res) => {
                    const msg = {
                        from: 'bot',
                        text: null,
                        actionDetails: null,
                        chartConfig: null,
                        flexViewConfig: null,
                        htmlViewConfig: null,
                        dataResult: null
                    };

                    if (res.displayMessage) {
                        msg.text = res.displayMessage;
                    } else if (res.codeMessage) {
                        const code = typeof res.codeMessage === 'object'
                            ? JSON.stringify(res.codeMessage, null, 2)
                            : res.codeMessage;
                        msg.text = `\`\`\`json\n${code}\n\`\`\``;
                    }

                    if (res.confirmationRequest) {
                        msg.actionDetails = {
                            model: res.model,
                            filter: res.filter,
                            data: res.data
                        };
                    }

                    if (res.chartConfig) msg.chartConfig = res.chartConfig;
                    if (res.flexViewConfig) msg.flexViewConfig = res.flexViewConfig;
                    if (res.htmlViewConfig) msg.htmlViewConfig = res.htmlViewConfig;
                    if (res.dataResult) msg.dataResult = res.dataResult;

                    return msg;
                };

                const resultsToProcess = result.results || [result];
                const newMessages = [];
                let newConfirmation = null;

                resultsToProcess.forEach(res => {
                    const msg = createBotMessage(res);
                    if (res.confirmationRequest) {
                        newConfirmation = res.confirmationRequest;
                    }
                    // On ajoute le message s'il a du contenu
                    if (msg.text || msg.chartConfig || msg.dataResult || msg.flexViewConfig || msg.htmlViewConfig || msg.actionDetails) {
                        newMessages.push(msg);
                    }
                });

                if (newConfirmation) {
                    setPendingConfirmation(newConfirmation);
                } else if (isConfirmation) {
                    setPendingConfirmation(null);
                }

                if (newMessages.length > 0) {
                    setMessages(prev => [...prev, ...newMessages]);
                }

            } else {
                const errorMessage = { from: 'bot', text: t('assistant.error', `Désolé, une erreur est survenue : {{message}}`, { message: result.message }) };
                setMessages(prev => [...prev, errorMessage]);
            }

        } catch (error) {
            const errorMessage = { from: 'bot', text: t('assistant.contactError', `Désolé, impossible de contacter l'assistant. ({{message}})`, { message: error.message }) };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // Gère la soumission du formulaire de chat
    const handleSubmit = async (e) => {
        e.preventDefault();
        // On ne soumet rien si le champ est vide, si une requête est en cours ou si une confirmation est attendue
        if (!input.trim() || isLoading || pendingConfirmation) return;

        const userMessage = { from: 'user', text: input };
        const currentInput = input;

        setMessages(prev => [...prev, userMessage]);
        setInput('');

        gtag('event', "Assistant Prior - msg");

        await handleApiCall({
            message: currentInput,
            history: messages,
            provider: selectedProvider,
            context: { modelName: selectedModel?.name }
        });
    };

    // NOUVELLE FONCTION : Gère la réponse de l'utilisateur à une demande de confirmation
    const handleConfirmAction = async (isConfirmed) => {
        if (!pendingConfirmation) return;

        if (isConfirmed) {
            // L'utilisateur a cliqué sur "Oui"
            const confirmationMessage = { from: 'user', text: t('yes', 'Oui') };
            setMessages(prev => [...prev, confirmationMessage]);

            // On rappelle l'API en envoyant l'action à confirmer
            await handleApiCall({
                message: "Action confirmée par l'utilisateur.",
                history: messages,
                provider: selectedProvider,
                context: { modelName: selectedModel?.name },
                confirmedAction: pendingConfirmation
            });
        } else {
            // L'utilisateur a cliqué sur "Non"
            const cancelMessage = { from: 'user', text: t('no', 'Non') };
            const botResponseMessage = { from: 'bot', text: t('assistant.actionCancelled', "Action annulée.") };
            setMessages(prev => [...prev, cancelMessage, botResponseMessage]);
            setPendingConfirmation(null); // On annule la demande de confirmation
        }
    };

    // Logique pour le sélecteur de fournisseur (OpenAI/Google)
    const availableProviders = useMemo(() => {
        const prs = Object.keys(providers).map(p => {
            return config?.[p] ? ({value: p, label: p}) : null;
        })
        return prs.filter(Boolean);
    }, [config]);

    const [selectedProvider, setSelectedProvider] = useState(null);

    useEffect(() => {
        if (availableProviders.length > 0 && !selectedProvider) {
            setSelectedProvider(availableProviders[0].value);
        }
    }, [availableProviders, selectedProvider]);

    // Si le chat est fermé, on affiche juste le bouton flottant
    if (!isOpen) {
        return (
            <button data-tooltip-id={"tooltipField"} data-tooltip-html={t("assistant.tooltip", "<b>Prior</b>, votre assistant en gestion des données")} className="fab assistant-fab" onClick={() => setIsOpen(true)} title={t('assistant.open', "Ouvrir l'assistant Prior")}>
                <FaRobot />
            </button>
        );
    }

    // Si le chat est ouvert, on affiche la fenêtre complète
    return (
        <div className={`assistant-chat-window ${isMaximized ? 'maximized' : ''}`}>
            <div className="chat-header">
                <h3><FaRobot style={{ marginRight: '8px' }} /> <Trans i18nKey="assistant.named" values={{ named: 'Prior' }} /></h3>
                <div className="header-actions">
                    {availableProviders.length > 1 && (
                        <select
                            className="provider-selector"
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                        >
                            {availableProviders.map(provider => (
                                <option key={provider.value} value={provider.value}>
                                    {provider.label}
                                </option>
                            ))}
                        </select>
                    )}
                    <button onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? t('collapse', "Réduire") : t('expand', "Agrandir")}>
                        {isMaximized ? <FaCompress /> : <FaExpand />}
                    </button>
                    <button onClick={() => setIsOpen(false)} title={t('close', "Fermer")}>
                        <FaTimes />
                    </button>
                </div>
            </div>

            <div className="chat-messages">
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.from}`}>
                        {msg.text && <Markdown>{msg.text}</Markdown>}
                        {msg.chartConfig && (
                            <div className="chart-container">
                                <DashboardChart config={msg.chartConfig} />
                                <div className="chart-actions" style={{ marginTop: '8px', textAlign: 'right' }}>
                                    <Button onClick={() => {
                                        nav('/user/'+getUserHash(me)+'/dashboards');
                                        setChartToAdd(msg.chartConfig);
                                    }} title={t('assistant.addToDashboard', 'Ajouter au tableau de bord')}>
                                        <FaPlus />
                                        <span style={{ marginLeft: '8px' }}>
                                            {t('assistant.addToDashboard', 'Ajouter au tableau de bord')}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* NOUVEAU : Affichage de la Flex View */}
                        {msg.flexViewConfig && (
                            <div className="flex-view-container">
                                <FlexViewCard config={msg.flexViewConfig} />
                                <div className="chart-actions" style={{ marginTop: '8px', textAlign: 'right' }}>
                                    <Button onClick={() => {
                                        nav('/user/'+getUserHash(me)+'/dashboards');
                                        setFlexViewToAdd(msg.flexViewConfig);
                                    }} title={t('assistant.addToDashboard', 'Ajouter au tableau de bord')}>
                                        <FaPlus />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* NOUVEAU : Affichage de la vue HTML personnalisée */}
                        {msg.htmlViewConfig && (
                            <div className="html-view-container">
                                <HtmlViewCard config={msg.htmlViewConfig} />
                                <div className="chart-actions" style={{ marginTop: '8px', textAlign: 'right' }}>
                                    <Button onClick={() => {
                                        nav('/user/'+getUserHash(me)+'/dashboards');
                                        setHtmlViewToAdd(msg.htmlViewConfig);
                                    }} title={t('assistant.addToDashboard', 'Ajouter au tableau de bord')}>
                                        <FaPlus />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* NOUVEAU : Affichage des données tabulaires */}
                        {msg.dataResult && (
                            <div className="data-table-container">
                                <DataTable model={models.find(f => f.name === msg.dataResult.model)} advanced={false} data={msg.dataResult.data} />
                            </div>
                        )}
                        {msg.actionDetails && (
                            <div className="action-details">
                                {msg.actionDetails.model && (
                                    <p><strong>{t('model', 'Modèle')}:</strong> <code>{msg.actionDetails.model}</code></p>
                                )}
                                {msg.actionDetails.filter && (
                                    <>
                                        <p><strong>{t('filter', 'Filtre')}:</strong></p>
                                        {/* Utiliser Markdown pour afficher un bloc de code JSON formaté */}
                                        <Markdown>{`\`\`\`json\n${JSON.stringify(msg.actionDetails.filter, null, 2)}\n\`\`\``}</Markdown>
                                    </>
                                )}
                                {msg.actionDetails.data && (
                                    <>
                                        <p><strong>{t('data', 'Données')}:</strong></p>
                                        <Markdown>{`\`\`\`json\n${JSON.stringify(msg.actionDetails.data, null, 2)}\n\`\`\``}</Markdown>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && <div className="message bot"><p>...</p></div>}

                {/* NOUVEAU : Affichage des boutons de confirmation */}
                {pendingConfirmation && !isLoading && (
                    <div className="message bot confirmation-prompt">
                        <button onClick={() => handleConfirmAction(true)}>{t('yes', 'Oui')}</button>
                        <button onClick={() => handleConfirmAction(false)} className="cancel">{t('no', 'Non')}</button>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('assistant.type', "Écrivez votre message...")}
                    // On désactive l'input si une requête est en cours ou si une confirmation est attendue
                    disabled={isLoading || !!pendingConfirmation}
                    autoFocus
                />
                <button type="submit" disabled={isLoading || !input.trim() || !!pendingConfirmation} title={t('send', "Envoyer")}>
                    <FaPaperPlane />
                </button>
            </form>
        </div>
    );
};

export default AssistantChat;