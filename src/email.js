import process from "node:process";
import nodemailer from "nodemailer";
import juice from "juice";
import {Event} from "./events.js";
import {emailDefaultConfig} from "./constants.js";

// Le transporteur par défaut, utilisé si aucune config spécifique n'est fournie.
const defaultTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Crn * @param {object} smtpConfig - L'objet de configuration SMTP.
 * @returns {import('nodemailer').Transporter} Un transporteur Nodemailer.
 */
const createTransporter = (smtpConfig) => {
    // Valider que les informations de base sont présentes
    if (!smtpConfig.host || !smtpConfig.port || !smtpConfig.user || !smtpConfig.pass){
        throw new Error("SMTP configuration incomplete ('SMTP_HOST', 'SMTP_PORT','SMTP_USER', and 'SMTP_PASS' keys need to be completed in env').");
    }
    return nodemailer.createTransport({
        host: smtpConfig.host,
        port: parseInt(smtpConfig.port, 10),
        secure: smtpConfig.secure === true, // Par défaut à false si non défini
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass
        }
    });
};


/**
 * Envoie un email en utilisant une configuration SMTP spécifique ou celle par défaut.
 * @param {string|string[]} email - Le ou les destinataires.
 * @param {object} data - Les données de l'email (title, content).
 * @param {object|null} smtpConfig - La configuration SMTP à utiliser. Si null, utilise la configuration par défaut.
 * @param {string} lang - La langue pour le template.
 * @param {string|null} tpl - Le template HTML à utiliser.
 */
export const sendEmail = async (email = "", data, smtpConfig = null, lang, tpl = null) => {
    const contactEmail = smtpConfig ? (smtpConfig.from || emailDefaultConfig.from) :"Our company <noreply@ourdomain.tld>";
    const emails = Array.isArray(email) ? email : [email];
    if (emails.length === 0) return;

    // Choisir le transporteur à utiliser
    const transporter = smtpConfig ? createTransporter(smtpConfig||emailDefaultConfig) : defaultTransporter;

    Event.Listen("OnEmailTemplate", (data, lang) => data.content, "event", "system");

    if (tpl === null) tpl = Event.Trigger("OnEmailTemplate", "event", "system", data, lang);
    let html = tpl;
    try {
        html = juice(tpl);
    } catch (e) {
        console.error("Erreur lors de l'inlining du CSS de l'email :", e);
    }

    // Utiliser Promise.all pour gérer les envois de manière asynchrone
    const sendPromises = emails.map((e) => {
        const mailOptions = {
            from: contactEmail,
            to: e,
            subject: data.title,
            html
        };
        return transporter.sendMail(mailOptions);
    });

    try {
        await Promise.all(sendPromises);
        console.log(`Email(s) envoyé(s) avec succès à: ${emails.join(', ')}`);
    } catch (error) {
        console.error("Erreur lors de l'envoi d'un ou plusieurs emails :", error);
        // Vous pouvez relancer l'erreur si vous voulez que l'appelant la gère
        throw error;
    }
};

export const etag = (name, attrs, content = "") => {
    return (
        "<" +
        name +
        " " +
        Object.keys(attrs)
            .map((m) => m + '="' + attrs[m] + '" ')
            .join("")
            .trim() +
        ">" +
        content +
        "</" +
        name +
        ">"
    );
};

export const ebutton = (content = "", attrs = {}, style = {}) => {
    return etable(
        erow(
            '<a href="' +
            attrs["href"] +
            '" style="' +
            estyle(style) +
            '">' +
            content +
            "</a>"
        )
    );
};

export const etable = (content = "", style = {}) => {
    return (
        '<table border="0" cellPadding="0" cellSpacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; ' +
        (style.width === "100%" ? "min-width: 100%;" : "") +
        " !important; " +
        estyle(style) +
        '" width="' +
        (style.width || "100%") +
        '">' +
        content +
        "</table>"
    );
};

export const erow = (content = "", style = {}) => {
    const contents = !Array.isArray(content) ? [content] : content;
    return (
        "<tr>" +
        contents
            .map(
                (c) =>
                    '<td align="center" style="' +
                    estyle(style) +
                    '" valign="top">' +
                    c +
                    "</td>"
            )
            .join("") +
        "</tr>"
    );
};

export const estyle = (options) => {
    return Object.keys(options)
        .map((m) => m + ": " + options[m] + ";")
        .join("");
};