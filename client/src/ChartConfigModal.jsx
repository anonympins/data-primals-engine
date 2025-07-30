// C:/Dev/hackersonline-engine/client/src/ChartConfigModal.jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useModelContext } from './contexts/ModelContext.jsx';
import {ColorField, SelectField, TextField} from './Field.jsx';
import Button from './Button.jsx';
import { useAuthContext } from "./contexts/AuthContext.jsx";
import { Dialog } from "./Dialog.jsx";
import ConditionBuilder from "./ConditionBuilder.jsx";

// Styles (supposés définis ailleurs ou inline pour l'exemple)
const modalStyles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000, // Assurez-vous qu'il est au-dessus des autres éléments
    },
    content: {
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        minWidth: '320px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px', // Espace entre les champs
    }
};

// *** AJOUT: Prop initialConfig avec valeur par défaut null ***
const ChartConfigModal = ({ isOpen, onClose, onSave, initialConfig = null }) => {
    const { t } = useTranslation();
    const { models } = useModelContext();
    const { me } = useAuthContext();

    // États internes (inchangés)
    const [selectedModel, setSelectedModel] = useState('');
    const [filter, setFilter] = useState({});
    const [modelFields, setModelFields] = useState([]);
    const [xAxisField, setXAxisField] = useState('');
    const [yAxisField, setYAxisField] = useState('');
    const [groupByField, setGroupByField] = useState('');
    const [colorField, setColorField] = useState('#4BC0C0');
    const [groupByLabelField, setGroupByLabelField] = useState('');
    const [relatedModelFields, setRelatedModelFields] = useState([]);
    const [chartType, setChartType] = useState('bar');
    const [chartAggregationType, setChartAggregationType] = useState('count');
    const [chartTitle, setChartTitle] = useState('');

    const currentModel = models.find(f => f.name === selectedModel && f._user === me.username);

    // *** AJOUT: useEffect pour initialiser ou réinitialiser l'état basé sur initialConfig ***
    useEffect(() => {
        // Ne s'exécute que si le modal est ouvert
        if (isOpen) {
            if (initialConfig) {
                // Mode édition: Pré-remplir les états
                setSelectedModel(initialConfig.model || '');
                setFilter(initialConfig.filter);
                setChartTitle(initialConfig.title || '');
                setChartType(initialConfig.type || 'bar');
                setXAxisField(initialConfig.xAxis || '');
                setYAxisField(initialConfig.yAxis || '');
                setGroupByField(initialConfig.groupBy || '');
                setColorField(initialConfig.chartBackgroundColor || null);
                setGroupByLabelField(initialConfig.groupByLabelField || '');
                setChartAggregationType(initialConfig.aggregationType || 'count');
                // Note: modelFields et relatedModelFields seront chargés par les autres useEffects
                // déclenchés par le changement de selectedModel et groupByField.
            } else {
                // Mode ajout: Réinitialiser les états (sécurité, même si déjà fait au changement de modèle)
                setSelectedModel('');
                setFilter(null);
                setChartTitle('');
                setChartType('bar');
                setXAxisField('');
                setYAxisField('');
                setGroupByField('');
                setGroupByLabelField('');
                setChartAggregationType('count');
                setModelFields([]);
                setRelatedModelFields([]);
            }
        }
        // De son absence)
    }, [isOpen, initialConfig]);


    // useEffect pour charger les champs du modèle (inchangé)
    useEffect(() => {
        if (selectedModel && models) {
            const modelDef = models.find(m => m.name === selectedModel);
            const fields = modelDef ? modelDef.fields : [];
            setModelFields(fields);
            // Réinitialiser les champs dépendants SEULEMENT si ce n'est pas le chargement initial en mode édition
            if (!initialConfig || selectedModel !== initialConfig.model) {
                setXAxisField('');
                setYAxisField('');
                setFilter(null);
                setGroupByField('');
                setGroupByLabelField('');
                setRelatedModelFields([]);
                setChartAggregationType('count');
                // Ne pas réinitialiser le titre ici, car il peut être défini avant le modèle
            }
        } else {
            setModelFields([]);
        }
    }, [selectedModel, models, initialConfig]); // Ajouter initialConfig aux dépendances

    // useEffect pour charger les champs liés
    useEffect(() => {
        if (groupByField && models && modelFields.length > 0) {
            const mainModelField = modelFields.find(f => f.name === groupByField);
            if (mainModelField?.type === 'relation') {
                const relatedModelName = mainModelField.relation;
                const relatedModelDef = models.find(m => m.name === relatedModelName);
                const fields = relatedModelDef ? relatedModelDef.fields : [];
                setRelatedModelFields(fields);
                // Pré-remplir groupByLabelField si en mode édition, sinon chercher le défaut
                const labelToSet = (initialConfig && groupByField === initialConfig.groupBy && initialConfig.groupByLabelField)
                    ? initialConfig.groupByLabelField
                    : (fields.find(f => f.asMain && ['string', 'string_t', 'enum'].includes(f.type))?.name ||
                        fields.find(f => f.name === 'name' && ['string', 'string_t', 'enum'].includes(f.type))?.name ||
                        fields.find(f => f.name === 'title' && ['string', 'string_t', 'enum'].includes(f.type))?.name || '');
                setGroupByLabelField(labelToSet);
            } else {
                setRelatedModelFields([]);
                setGroupByLabelField('');
            }
        } else {
            setRelatedModelFields([]);
            setGroupByLabelField('');
        }
    }, [groupByField, modelFields, models, initialConfig]); // Ajouter initialConfig aux dépendances

    // useEffect pour réinitialiser l'agrégation si l'axe Y est enlevé (inchangé)
    useEffect(() => {
        if (!yAxisField && chartAggregationType !== 'count') {
            setChartAggregationType('count');
        }
    }, [yAxisField, chartAggregationType]);

    // Logique de validation et options (inchangée)
    const isGroupingChart = ['pie', 'doughnut'].includes(chartType);
    const isRelationGroupBy = isGroupingChart && modelFields.find(f => f.name === groupByField)?.type === 'relation';
    const isYAxisRequiredForValidation = chartAggregationType && !['count'].includes(chartAggregationType);

    // handleSave (inchangé - envoie l'état actuel)
    const handleSave = () => {
        const isValid = selectedModel && chartType && chartTitle &&
            (isGroupingChart
                    ? (groupByField && (!isRelationGroupBy || groupByLabelField) && (isYAxisRequiredForValidation ? !!yAxisField : true))
                    : (xAxisField && chartAggregationType && (isYAxisRequiredForValidation ? !!yAxisField : true))
            );

        if (isValid) {
            // L'objet envoyé contient l'état actuel des champs
            onSave({
                // *** AJOUT: Inclure l'ID si on est en mode édition ***
                id: initialConfig?.id, // Sera undefined en mode ajout
                title: chartTitle,
                model: selectedModel,
                xAxis: !isGroupingChart ? xAxisField : undefined,
                yAxis: yAxisField || undefined,
                groupBy: isGroupingChart ? groupByField : undefined,
                groupByLabelField: isRelationGroupBy ? groupByLabelField : undefined,
                type: chartType,
                aggregationType: chartAggregationType,
                chartBackgroundColor: colorField,
                filter,
            });
        } else {
            let errorMsg = t('chartConfigModal.fillFields', "Veuillez remplir tous les champs requis.");
            if (isYAxisRequiredForValidation && !yAxisField) {
                errorMsg += ` ${t('chartConfigModal.yAxisRequiredForAggregation', "L'axe Y est requis pour l'agrégation '{aggregation}'.", { aggregation: t('aggregation.'+chartAggregationType, chartAggregationType) })}`;
            }
            alert(errorMsg);
        }
    };

    if (!isOpen) return null;

    // Options pour les SelectFields (inchangées)
    const modelOptions = models
        ? models.filter(f => f._user === me?.username).map(m => ({ label: t(`model_${m.name}`, m.name), value: m.name }))
        : [];
    const xAxisOptions = modelFields
        .filter(f => ['string', 'string_t', 'enum', 'date', 'datetime', 'number', 'boolean'].includes(f.type))
        .map(f => ({ label: t(`field_${selectedModel}_${f.name}`, f.name), value: f.name }));
    const yAxisOptions = modelFields
        .filter(f => ['number'].includes(f.type))
        .map(f => ({ label: t(`field_${selectedModel}_${f.name}`, f.name), value: f.name }));
    const groupByOptions = modelFields
        .filter(f => f.type === 'enum' || f.type === 'relation')
        .map(f => ({ label: `${t(`field_${selectedModel}_${f.name}`, f.name)} (${f.type})`, value: f.name }));
    const groupByLabelOptions = relatedModelFields
        .filter(f => ['string', 'string_t', 'enum'].includes(f.type))
        .map(f => ({ label: t(`field_${relatedModelFields.find(rm=>rm.name === f.name)?.relation || selectedModel}_${f.name}`, f.name), value: f.name }));
    const chartTypeOptions = [
        { label: t('chartType.bar', 'Barres'), value: 'bar' },
        { label: t('chartType.line', 'Ligne'), value: 'line' },
        { label: t('chartType.pie', 'Secteurs'), value: 'pie' },
        { label: t('chartType.doughnut', 'Donut'), value: 'doughnut' },
    ];
    // Options d'agrégation de base - AJOUT DE 'value'
    const baseAggregationOptions = [
        { label: t('aggregation.count', 'Count'), value: 'count' },
        { label: t('aggregation.value', 'Value'), value: 'value' }, // Option pour afficher la valeur brute
        { label: t('aggregation.sum', 'Sum'), value: 'sum' },
        { label: t('aggregation.avg', 'Average'), value: 'avg' },
        { label: t('aggregation.median', 'Median'), value: 'median' }, // Attention: median peut être coûteux en perf
        { label: t('aggregation.min', 'Minimum'), value: 'min' },
        { label: t('aggregation.max', 'Maximum'), value: 'max' }
    ];

    // Filtrer les options d'agrégation disponibles
    // 'value', 'sum', 'avg', etc. ne sont dispo que si yAxisField est sélectionné
    const availableAggregationOptions = yAxisField
        ? baseAggregationOptions
        : baseAggregationOptions.filter(opt => opt.value === 'count');

    // Validation pour le bouton Enregistrer (inchangée)
    const isSaveDisabled = !selectedModel || !chartTitle || !chartType ||
        (isGroupingChart
                ? (!groupByField || (isRelationGroupBy && !groupByLabelField) || (isYAxisRequiredForValidation && !yAxisField))
                : (!xAxisField || !chartAggregationType || (isYAxisRequiredForValidation && !yAxisField))
        );

    return (
        <Dialog isOpen={isOpen} onClose={onClose} isClosable>
            <form onSubmit={(e) => {
                e.preventDefault();
                handleSave();
                return false;
            }}>
                {/* *** MODIFICATION: Titre dynamique *** */}
                <h2>{initialConfig
                    ? t('chartConfigModal.editTitle', 'Modifier le Graphique')
                    : t('chartConfigModal.addTitle', 'Configurer un Nouveau Graphique')}
                </h2>

                {/* Champs TextField et SelectField (inchangés dans leur structure) */}
                <TextField
                    label={t('chartConfigModal.chartTitle', 'Titre du Graphique')}
                    value={chartTitle}
                    onChange={(e) => setChartTitle(e.target.value)}
                    required
                />
                <SelectField
                    label={t('chartConfigModal.model', 'Source de Données (Modèle)')}
                    value={selectedModel}
                    onChange={(item) => setSelectedModel(item.value)}
                    items={[{label: t('selectPlaceholder', 'Choisir...'), value: ''}, ...modelOptions]}
                    required
                    // *** AJOUT: Désactiver le modèle en mode édition pour éviter les incohérences ***
                    hint={initialConfig ? t('chartConfigModal.modelCantBeChanged', 'Le modèle ne peut pas être changé en mode édition.') : ''}
                />
                {/* Section pour le ConditionBuilder */}
                {currentModel?.fields.length > 0 && (
                    <div className="flex"><label>{t('modelcreator.relationFilter', 'Filtre sur les données')}</label>
                        <ConditionBuilder
                            modelFields={currentModel.fields}
                            selectableModels={false}
                            model={currentModel.name} // Nom du modèle actuel du graphique
                            models={models} // Liste de tous les modèles (pour les relations potentielles dans le filtre)
                            initialValue={filter} // Le filtre actuel du graphique
                            onChange={(e) => setFilter(e)} // Fonction pour mettre à jour chartConfig.filter
                        /></div>
                )}
                <SelectField
                    label={t('chartConfigModal.chartType', 'Type de Graphique')}
                    value={chartType}
                    onChange={(item) => setChartType(item.value)}
                    items={chartTypeOptions}
                    required
                />

                {selectedModel && (
                    <>



                        {/* Affichage GroupBy pour Pie/Doughnut, XAxis pour les autres */}
                        {isGroupingChart ? (
                            <>
                                <SelectField
                                    label={t('chartConfigModal.groupBy', 'Répartir par (Enum/Relation)')}
                                    value={groupByField}
                                    onChange={(item) => setGroupByField(item.value)}
                                    items={[{
                                        label: t('selectPlaceholder', 'Choisir...'),
                                        value: ''
                                    }, ...groupByOptions]}
                                    required={isGroupingChart}
                                    disabled={groupByOptions.length === 0}
                                    hint={groupByOptions.length === 0 ? t('chartConfigModal.noGroupableFields', 'Aucun champ groupable disponible') : ''}
                                />
                                {isRelationGroupBy && (
                                    <SelectField
                                        label={t('chartConfigModal.groupByLabel', 'Champ Label (Relation)')}
                                        value={groupByLabelField}
                                        onChange={(item) => setGroupByLabelField(item.value)}
                                        items={[{
                                            label: t('selectPlaceholder', 'Choisir...'),
                                            value: ''
                                        }, ...groupByLabelOptions]}
                                        required={isRelationGroupBy}
                                        disabled={relatedModelFields.length === 0}
                                        hint={relatedModelFields.length === 0 && groupByField ? t('chartConfigModal.loadingRelated', 'Chargement...') : ''}
                                    />
                                )}
                            </>
                        ) : (
                            <SelectField
                                label={t('chartConfigModal.xAxis', 'Axe X')}
                                value={xAxisField}
                                onChange={(item) => setXAxisField(item.value)}
                                items={[{label: t('selectPlaceholder', 'Choisir...'), value: ''}, ...xAxisOptions]}
                                required={!isGroupingChart}
                                disabled={xAxisOptions.length === 0}
                                hint={xAxisOptions.length === 0 ? t('chartConfigModal.noXAxisFields', 'Aucun champ utilisable pour l\'axe X') : ''}
                            />
                        )}

                        {/* Axe Y (inchangé) */}
                        <SelectField
                            label={t('chartConfigModal.yAxis', 'Axe Y (Numérique)')}
                            value={yAxisField}
                            onChange={(item) => setYAxisField(item.value)}
                            items={[{label: t('selectPlaceholder', 'Choisir...'), value: ''}, ...yAxisOptions]}
                            required={isYAxisRequiredForValidation}
                            disabled={yAxisOptions.length === 0}
                            // *** MODIFICATION: Hint mis our refléter la condition de l'axe Y ***
                            hint={yAxisOptions.length === 0
                                ? t('chartConfigModal.noNumericFields', 'Aucun champ numérique disponible')
                                : (chartAggregationType === 'count'
                                        ? t('chartConfigModal.yAxisOptionalForCount', 'Optionnel si Agrégation = Count')
                                        : t('chartConfigModal.yAxisRequiredForAggregation', "Requis pour l'agrégation '{aggregation}'", {aggregation: t('aggregation.' + chartAggregationType, chartAggregationType)})
                                )
                            }
                        />

                        {/* Type d'Agrégation (inchangé) */}
                        <SelectField
                            label={t('chartConfigModal.aggregationType', 'Agrégation')}
                            value={chartAggregationType}
                            onChange={(item) => setChartAggregationType(item.value)}
                            items={availableAggregationOptions} // Utilise les options filtrées
                            required={true} // Toujours requis conceptuellement
                            disabled={false} // Le filtrage des options suffit
                            // *** MODIFICATION: Hint mis à jour pour expliquer 'value' ***
                            hint={
                                chartAggregationType === 'value'
                                    ? t('chartConfigModal.aggregationHintValue', 'Affiche la valeur brute du champ de l\'axe Y. Note: le backend peut retourner des données non agrégées ou la première/dernière valeur par groupe.')
                                    : (!isGroupingChart
                                            ? t('chartConfigModal.aggregationHintBarLine', 'D comment agréger les valeurs sur l\'axe Y (ou compter les éléments si l\'axe Y n\'est pas défini).')
                                            : t('chartConfigModal.aggregationHintPie', 'Définit comment agréger les valeurs pour chaque segment (si l\'axe Y est défini).')
                                    )
                            }
                        />

                    </>
                )}

                <div className="flex">
                    <label
                        className="flex-1"
                        htmlFor="chartBackgroundColor">{t('charts.backgroundColor', 'Couleur de fond du graphique')}</label>
                    <ColorField // Ou votre composant de sélection de couleur
                        name="chartBackgroundColor"
                        className={"flex-1"}
                        value={colorField || '#FFFFFF'}
                        onChange={(event) => {
                            setColorField(event.value);
                        }}
                    />
                </div>

                {/* Boutons Annuler / Enregistrer (inchangés) */}
                <div className="flex flex-end flex-gap actions"
                     style={{marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid #eee'}}>
                    <Button onClick={onClose} type="button" className="btn">{t('btns.cancel', 'Annuler')}</Button>
                    <Button onClick={handleSave} type="button" className="btn btn-primary"
                            disabled={isSaveDisabled}>{t('btns.save', 'Enregistrer')}</Button>
                </div>
            </form>
        </Dialog>
    );
}

export default ChartConfigModal;