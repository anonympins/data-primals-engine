import {getCollection} from "../mongodb.js";
import schedule from "node-schedule";
import {maxAlertsPerUser} from "../../constants.js";
import {ObjectId} from "mongodb";
import {getSmtpConfig} from "../user.js";
import {runScheduledJobWithDbLock, substituteVariables} from "../workflow.js";
import i18n from "../../i18n.js";
import {sendEmail} from "../../email.js";
import {sendSseToUser} from "./data.routes.js";

import {searchData} from "./data.operations.js";
import {Logger} from "../../gameObject.js";


let engine, logger;
export function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
}

export const cancelAlerts = async (user) => {

    const datasCollection = getCollection('datas'); // Alerts are in the global collection

    // 1. Fetch the latest state of the alert
    const alertDocs = await datasCollection.find({_user: user.username, _model: 'alert'}).toArray();
    alertDocs.forEach(doc => {
        const jobId = `alert_${doc._id}`;
        schedule.scheduledJobs[jobId]?.cancel();
    });
}

/**
 * Executes a stateful alert job. It checks if a notification for an alert
 * has already been sent and only sends one if the condition is met and no
 * recent notification exists. The state is tracked via the 'lastNotifiedAt'
 * field in the alert document.
 * @param {string|ObjectId} alertId - The ID of the alert to process.
 */
export async function runStatefulAlertJob(alertId) {
    const jobId = `alert_${alertId}`;
    logger.info(`[Scheduled Job] Cron triggered for stateful alert job ${jobId}.`);

    try {
        const datasCollection = getCollection('datas'); // Alerts are in the global collection

        // 1. Fetch the latest state of the alert
        const alertDoc = await datasCollection.findOne({_id: new ObjectId(alertId)});

        // Safety checks
        if (!alertDoc) {
            logger.warn(`[Scheduled Job] Alert ${alertId} not found. Cancelling job.`);
            schedule.scheduledJobs[jobId]?.cancel();
            return;
        }

        if (!alertDoc.isActive || !alertDoc.frequency) {
            logger.info(`[Scheduled Job] Alert ${alertId} is no longer active or has no frequency. Cancelling job.`);
            schedule.scheduledJobs[jobId]?.cancel();
            return;
        }

        // 2. Check if a notification has already been sent for this state
        if (alertDoc.lastNotifiedAt) {
            logger.debug(`[Scheduled Job] Notification for alert ${alertId} has already been sent. Skipping evaluation.`);
            return;
        }

        // 3. Evaluate the trigger condition
        const apiFilter = (alertDoc.triggerCondition);
        const {count} = await searchData({
            model: alertDoc.targetModel,
            filter: apiFilter,
            limit: 1
        }, {username: alertDoc._user});

        // 4. If condition is met, send notification and update state
        if (count > 0) {
            logger.info(`[Scheduled Job] Condition met for alert ${alertDoc.name} (ID: ${alertId}). Sending notification and updating state.`);

            let emailSent = false;
            try {
                const user = await engine.userProvider.findUserByUsername(alertDoc._user);
                if (user && user.email) {
                    const smtpConfig = await getSmtpConfig(user);
                    if (alertDoc.sendEmail && smtpConfig) {
                        const userLang = user.lang || 'en';
                        let emailContent, msg;
                        if (alertDoc.message) {
                            if (alertDoc.message[userLang])
                                msg = alertDoc.message[userLang];
                            else
                                msg = alertDoc.message[Object.keys(alertDoc.message)[0]];
                            emailContent = await substituteVariables(msg, {count, alert: alertDoc});
                        } else {
                            // Sinon, utiliser le message par défaut
                            emailContent = i18n.t('alert.email.content', `L'alerte '${alertDoc.name}' s'est déclenchée. ${count} élément(s) correspondent à votre condition.`, {
                                name: alertDoc.name,
                                count: count
                            });
                        }

                        await sendEmail(
                            user.email,
                            {
                                title: i18n.t('alert.email.title', `Alerte: ${alertDoc.name}`),
                                content: emailContent
                            },
                            smtpConfig,
                            userLang
                        );
                        emailSent = true;
                        logger.info(`[Scheduled Job] Email notification sent for alert ${alertId} to ${user.email}.`);
                    } else if (alertDoc.sendEmail) {
                        logger.warn(`[Scheduled Job] Could not send email for alert ${alertId}. SMTP config is missing or incomplete for user ${user.username}.`);
                    }
                } else {
                    logger.warn(`[Scheduled Job] Could not send email for alert ${alertId}. User ${alertDoc._user} not found or has no email address.`);
                }
            } catch (emailError) {
                logger.error(`[Scheduled Job] Failed to send email for alert ${alertId}:`, emailError);
            }

            // Send notification
            const alertPayload = {
                type: 'cron_alert',
                triggerId: alertDoc._id.toString(),
                triggerName: alertDoc.name,
                timestamp: new Date().toISOString(),
                message: `Alerte '${alertDoc.name}': ${count} élément(s) correspondent à votre condition.`,
                emailSent
            };
            sendSseToUser(alertDoc._user, alertPayload);

            // Update state in DB to prevent re-notification
            await datasCollection.updateOne(
                {_id: new ObjectId(alertId)},
                {$set: {lastNotifiedAt: new Date()}}
            );
        } else {
            logger.debug(`[Scheduled Job] Condition not met for alert ${alertId}. No notification sent.`);
        }

    } catch (error) {
        logger.error(`[Scheduled Job] Error processing stateful alert job ${jobId}:`, error);
    }
}

export async function scheduleAlerts() {
    logger.info('[scheduleAlerts] Starting scheduling of oldest active alerts per user...');
    try {
        const datasCollection = getCollection('datas');

        // --- NOUVELLE LOGIQUE AVEC AGRÉGATION ---
        const aggregationPipeline = [
            // 1. Match: Ne sélectionner que les alertes actives avec une fréquence définie.
            {
                $match: {
                    _model: 'alert',
                    isActive: true,
                    frequency: {$exists: true, $ne: ""}
                }
            },
            // 2. Sort: Trier les alertes par utilisateur, puis par date de création (les plus anciennes en premier).
            // L'ObjectId contient un timestamp, donc trier par _id est équivalent à trier par date de création.
            {
                $sort: {
                    _user: 1, // Grouper par utilisateur
                    _id: 1    // Trier par date de création (ascendant)
                }
            },
            // 3. Group: Regrouper toutes les alertes par utilisateur dans un tableau.
            {
                $group: {
                    _id: "$_user", // La clé de groupement est le nom de l'utilisateur
                    alerts: {$push: "$$ROOT"} // $$ROOT pousse le document entier dans le tableau 'alerts'
                }
            },
            // 4. Project (Slice): Pour chaque utilisateur, ne garder que les X premières alertes du tableau trié.
            {
                $project: {
                    oldestAlerts: {$slice: ["$alerts", maxAlertsPerUser]}
                }
            },
            // 5. Unwind: Déconstruire le tableau 'oldestAlerts' pour obtenir un flux de documents, un par alerte.
            {
                $unwind: "$oldestAlerts"
            },
            // 6. ReplaceRoot: Remplacer la structure du document par le contenu de l'alerte elle-même.
            {
                $replaceRoot: {newRoot: "$oldestAlerts"}
            }
        ];

        const alertsToSchedule = await datasCollection.aggregate(aggregationPipeline).toArray();
        // --- FIN DE LA NOUVELLE LOGIQUE ---

        logger.info(`[scheduleAlerts] Found ${alertsToSchedule.length} oldest active alerts across all users to schedule.`);

        for (const alertDoc of alertsToSchedule) {
            const jobId = `alert_${alertDoc._id}`;
            try {
                // Annuler une tâche existante pour la même alerte si elle existe (logique de sécurité)
                if (schedule.scheduledJobs[jobId]) {
                    schedule.scheduledJobs[jobId].cancel();
                }
                // Planifier la tâche avec la nouvelle logique stateful
                schedule.scheduleJob(jobId, alertDoc.frequency, () => runStatefulAlertJob(alertDoc._id));
            } catch (scheduleError) {
                logger.error(`[scheduleAlerts] Failed to schedule job ${jobId} for alert ${alertDoc._id}. Error: ${scheduleError.message}`);
            }
        }
        logger.info('[scheduleAlerts] Finished scheduling alerts.');
    } catch (error) {
        logger.error('[scheduleAlerts] A critical error occurred during alert scheduling:', error);
    }
}


/**
 * Applique un masque et des valeurs par défaut à une expression cron.
 * @param {string} cronString - L'expression cron d'entrbooléens. `false` pour désactiver et appliquer la valeur par défaut.
 * @param {string[]} defaults - Un tableau de 5 chaînes de caractères pour les valeurs par défaut.
 * @returns {string} - L'expression cron modifiée.
 */
export function applyCronMask(cronString, mask, defaults) {
    if (typeof cronString !== 'string' || cronString.trim() === '' || !mask || !defaults) {
        return cronString;
    }
    const parts = cronString.split(' ');
    if (parts.length < 5) {
        return cronString; // Laisse la validation standard gérer les formats incorrects
    }

    const newParts = parts.slice(0, 5).map((part, index) => {
        // Si le masque à cet index est `false`, on force la valeur par défaut.
        if (mask[index] === false) {
            return defaults[index];
        }
        // Sinon, on garde la valeur de l'utilisateur.
        return part;
    });

    return newParts.join(' ');
}

export async function handleScheduledJobs(modelName, existingDocs, collection, updateData) {
    for (const doc of existingDocs) {
        const jobId = `${modelName}_${doc._id}`;
        const existingJob = schedule.scheduledJobs[jobId];
        if (existingJob) existingJob.cancel();

        const updatedDoc = {...doc, ...updateData};
        if (modelName === 'workflowTrigger' && updatedDoc.isActive && updatedDoc.cronExpression) {
            schedule.scheduleJob(jobId, updatedDoc.cronExpression, async () => {
                logger.info(`[Scheduled Job] Cron triggered for job ${jobId}`);
                await runScheduledJobWithDbLock(jobId, async () => {
                    sendSseToUser(updatedDoc._user, {
                        type: 'cron_alert',
                        triggerId: updatedDoc._id.toString(),
                        triggerName: updatedDoc.name,
                        timestamp: new Date().toISOString(),
                        message: `L'alerte planifiée '${updatedDoc.name || 'Sans nom'}' a été déclenchée.`
                    });
                }, updatedDoc.lockDurationMinutes || 5);
            });
        }

        if (modelName === 'alert' && updatedDoc.isActive && updatedDoc.frequency) {
            await collection.updateOne({_id: updatedDoc._id}, {$set: {lastNotifiedAt: null}});
            schedule.scheduleJob(jobId, updatedDoc.frequency, () => runStatefulAlertJob(updatedDoc._id));
        }
    }
}