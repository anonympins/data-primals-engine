import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useModelContext } from './contexts/ModelContext';
import { useAuthContext } from './contexts/AuthContext';
import { Trans, useTranslation } from 'react-i18next';
import { CodeField } from "./Field.jsx";
import { useQuery } from 'react-query';

import "./WorkflowEditor.scss"
// --- Custom Node Types (à créer) ---
// import TriggerNode from './nodes/TriggerNode';
// import StepNode from './nodes/StepNode';

const nodeTypes = {
    // trigger: TriggerNode,
    // step: StepNode,
};

const WorkflowEditor = ({ workflowId }) => {
    const { t } = useTranslation();
    const { me } = useAuthContext();
    const { models } = useModelContext();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState(null);

    // Query 1: Fetch the main workflow document
    const { data: mainWorkflowData, isLoading: isLoadingMainWorkflow, error: errorMainWorkflow } = useQuery(
        ['mainWorkflow', workflowId],
        () => fetch('/api/data/search?_user='+me.username, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'workflow',
                filter: { $eq: [{$toString:'$_id'}, workflowId] },
                // No pipelines, no depth here, as per user request
            })
        }).then(res => res.json()),
        {
            enabled: !!workflowId,
            select: (data) => data?.data?.[0]
        }
    );

    // Query 2: Fetch all workflowStep documents related to this workflow
    const { data: workflowStepsData, isLoading: isLoadingSteps, error: errorSteps } = useQuery(
        ['workflowSteps', workflowId],
        () => fetch('/api/data/search?_user=' + me.username, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'workflowStep',
                filter: { workflow: workflowId },
                // Use a shallow depth to populate direct relations like 'actions'
                // This avoids a deep recursive lookup for the entire graph, but makes step data usable
                depth: 1
            })
        }).then(res => res.json()),
        {
            enabled: !!workflowId, // La requête ne s'exécute que si workflowId est défini
            select: (data) => data?.data || []
        }
    );

    // Query 3: Fetch all workflowAction documents related to this workflow
    const { data: workflowActionsData, isLoading: isLoadingActions, error: errorActions } = useQuery(
        ['workflowActions', workflowId],
        () => fetch('/api/data/search?_user=' + me.username, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'workflowAction',
                filter: { workflow: workflowId },
                // No depth needed here as actions are usually flat
            })
        }).then(res => res.json()),
        {
            enabled: !!workflowId,
            select: (data) => data?.data || []
        }
    );

    useEffect(() => {
        if (mainWorkflowData && workflowStepsData && workflowActionsData) {
            const initialNodes = [];
            const initialEdges = [];
            const processedSteps = new Set();

            // Create a map for quick lookup of steps
            const stepsMap = new Map(workflowStepsData.map(step => [step._id, step]));

            // 1. Nœud du déclencheur (Trigger)
            initialNodes.push({
                id: `workflow-start-${mainWorkflowData._id}`,
                type: 'input',
                position: { x: 250, y: 5 },
                data: { 
                    label: `Début: ${typeof mainWorkflowData.name === 'object' ? mainWorkflowData.name.value : mainWorkflowData.name}`,
                    // --- CORRECTION ---
                    // On inclut toutes les données du workflow pour la cohérence
                    ...mainWorkflowData
                },
            });

            // Create a map for quick lookup of actions
            const actionsMap = new Map(workflowActionsData.map(action => [action._id, action]));

            // 2. Traitement récursif des étapes
            const processStep = (stepId, parentNodeId, parentPosition, isSuccessBranch = true) => {
                if (!stepId || processedSteps.has(stepId)) return;

                const step = stepsMap.get(stepId);
                if (!step) {
                    console.warn(`WorkflowEditor: Step with ID ${stepId} not found in fetched steps.`);
                    return;
                }

                processedSteps.add(stepId);

                const nodePosition = { x: parentPosition.x, y: parentPosition.y + 120 };
                initialNodes.push({
                    id: step._id,
                    type: 'default',
                    className: 'workflow-step-node',
                    position: nodePosition,
                    data: {
                        label: (step?.name && typeof step.name === 'object' ? step.name.value : step.name) || `Étape ${step._id}`,
                        ...step // --- CORRECTION --- On inclut l'objet step complet
                    },
                });
                initialEdges.push({ id: `e-${parentNodeId}-${step._id}`, source: parentNodeId, target: step._id, type: 'smoothstep' });

                let lastActionId = step._id;
                // The actions on the step are just IDs now, we need to look them up
                const actionIds = Array.isArray(step.actions) ? step.actions : (step.actions ? [step.actions] : []);
                const actions = actionIds.map(id => actionsMap.get(id)).filter(Boolean); // Get full action objects

                if (actionIds.length !== actions.length) {
                    const missingIds = actionIds.filter(id => !actionsMap.has(id));
                    console.warn(`WorkflowEditor: Could not find the following actions: ${missingIds.join(', ')}`);
                }

                actions.forEach((action, index) => {
                    const actionNodePosition = { x: nodePosition.x, y: nodePosition.y + (index + 1) * 80 };
                    initialNodes.push({
                        id: action._id,
                        type: 'default',
                        className: 'workflow-action-node',
                        position: actionNodePosition,
                        data: {
                            label: action.name.value || `Action ${action._id}`,
                            ...action // --- CORRECTION --- On inclut l'objet action complet
                        },
                    });
                    initialEdges.push({ id: `e-${lastActionId}-${action._id}`, source: lastActionId, target: action._id, type: 'smoothstep' });
                    lastActionId = action._id;
                });

                // Créer les liens (edges)
                if (step.onSuccessStep && typeof step.onSuccessStep === 'string') { // onSuccessStep is an ID
                    processStep(step.onSuccessStep, lastActionId, { x: nodePosition.x - 200, y: nodePosition.y + (actions.length * 80) }, true);
                    initialEdges.push({ id: `e-${lastActionId}-success-${step.onSuccessStep}`, source: lastActionId, target: step.onSuccessStep, label: t('onSuccess', 'onSuccess'), type: 'smoothstep' });
                }

                if (step.onFailureStep && typeof step.onFailureStep === 'string') { // onFailureStep is an ID
                    processStep(step.onFailureStep, lastActionId, { x: nodePosition.x + 200, y: nodePosition.y + (actions.length * 80) }, false);
                    initialEdges.push({ id: `e-${lastActionId}-failure-${step.onFailureStep}`, source: lastActionId, target: step.onFailureStep, label: t('onFailure', 'onFailure'), type: 'smoothstep', animated: true, style: { stroke: '#ff4d4d' } });
                }
            };

            if (mainWorkflowData.startStep) {
                initialEdges.push({
                    id: `e-start-${mainWorkflowData.startStep}`, // startStep is an ID
                    source: `workflow-start-${mainWorkflowData._id}`,
                    target: mainWorkflowData.startStep,
                    type: 'smoothstep',
                });
                processStep(mainWorkflowData.startStep, `workflow-start-${mainWorkflowData._id}`, { x: 250, y: 5 });
            }

            setNodes(initialNodes);
            setEdges(initialEdges);
        }
    }, [mainWorkflowData, workflowStepsData, workflowActionsData, setNodes, setEdges, t]);

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    const onNodeClick = useCallback((event, node) => { // Keep this for potential future node editing
        setSelectedNode(node);
        console.log('Node clicked:', node);
    }, []);

    const onPaneClick = useCallback(() => { // Keep this for potential future node editing
        setSelectedNode(null);
    }, []);

    if (isLoadingMainWorkflow || isLoadingSteps || isLoadingActions) { // Check all loading states
        return <div>{t('loading', 'Chargement...')}</div>;
    }

    if (errorMainWorkflow || errorSteps || errorActions) { // Check all error states
        const errorMessage = errorMainWorkflow?.message || errorSteps?.message || errorActions?.message || 'Unknown error';
        return <div><Trans i18nKey="error.generic" values={{ message: errorMessage }}>Erreur: {{ message: errorMessage }}</Trans></div>;
    }

    return (
        <div className={"flex-1"} style={{ width: '100%', height: '80vh', display: 'flex' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background variant="dots" gap={12} size={1} />
            </ReactFlow>

            {/* Panneau latéral pour l'édition des propriétés */}
            {selectedNode && (
                <div className="properties-panel" style={{ width: '300px', padding: '10px', borderLeft: '1px solid #ccc' }}>
                    <h3><Trans i18nKey="properties">Propriétés</Trans></h3>
                    <p><strong>ID:</strong> {selectedNode.id}</p>

                    {/* Affiche les conditions pour un workflowStep */}
                    {selectedNode.data.conditions && (
                        <div className="mt-2">
                            <strong><Trans i18nKey="conditions">Conditions:</Trans></strong>
                            <CodeField language="json" value={JSON.stringify(selectedNode.data.conditions, null, 2)} readOnly={true} />
                        </div>
                    )}

                    {/* Affiche le script pour une action ExecuteScript */}
                    {selectedNode.data.type && (
                        <div className="mt-2">
                            <strong><Trans i18nKey="action">Action :</Trans></strong> {selectedNode.data.type}
                            {selectedNode.data.targetModel&& (
                                <p>
                                    <strong><Trans i18nKey="action">Modèle cible : </Trans></strong>{selectedNode.data.targetModel}
                                </p>
                            )}
                            {selectedNode.data.targetSelector&& (
                                <p>
                                    <strong><Trans i18nKey="filter">Filtre :</Trans></strong>
                                    <br/><CodeField language="javascript" value={JSON.stringify(selectedNode.data.targetSelector)} readOnly={true} />
                                </p>
                                )}
                        </div>
                    )}
                    {/* Affiche le script pour une action ExecuteScript */}
                    {selectedNode.data.type === 'ExecuteScript' && selectedNode.data.script && (
                        <div className="mt-2">
                            <CodeField language="javascript" value={selectedNode.data.script} readOnly={true} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WorkflowEditor;
