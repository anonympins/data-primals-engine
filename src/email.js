import { translations } from "../../data-primals-engine/src/i18n.js";
import process from "node:process";
import nodemailer from "nodemailer";
import juice from "juice";

// Le transporteur par défaut, utilisé si aucune config spécifique n'est fournie.
const defaultTransporter = nodemailer.createTransport({
    host: "mail.smtp2go.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
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
            pass: smtpConfig.pass,
        },
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
    const contactEmail = smtpConfig ? (smtpConfig.from || "Our company <noreply@ourdomain.tld>") : "Support - data@primals.net <data@primals.net>";
    const emails = Array.isArray(email) ? email : [email];
    if (emails.length === 0) return;

    // Choisir le transporteur à utiliser
    const transporter = smtpConfig ? createTransporter(smtpConfig) : defaultTransporter;

    if (tpl === null) tpl = etemplate1(data, lang);
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
            html,
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

export const etemplate1 = (data, lang = "de", font = "Roboto") => {
    const { title, content } = data;
    // S'assurer que les traductions existent pour la langue demandée
    const trs = translations[lang]?.translation || translations['en']['translation'];
    return (
        `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Newsletter web.primals.net</title>
      <script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "EmailMessage",
  "potentialAction": {
    "@type": "ViewAction",
    "url": "https://web.primals.net",
    "name": "web.primals.net"
  }
}
</script>
  <style type="text/css">
    /* Based on The MailChimp Reset INLINE: Yes. */
    /* Client-specific Styles */
    #outlook a {padding:0;} /* Force Outlook to provide a "view in browser" menu link. */
    body{width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; margin:0; padding:0; color:black}
    /* Prevent Webkit and Windows Mobile platforms from changing default font sizes.*/
    .ExternalClass {width:100%;} /* Force Hotmail to display emails at full width */
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%;}
    /* Forces Hotmail to display normal line spacing.  More on that: http://www.emailonacid.com/forum/viewthread/43/ */
    #backgroundTable {margin:0; padding:0; width:100% !important; line-height: 100% !important;}
    /* End reset */

    /* Some sensible defaults for images
    Bring inline: Yes. */
    img {outline:none; text-decoration:none; -ms-interpolation-mode: bicubic;}
    a img {border:none;}
    .image_fix {display:block;}

    /* Yahoo paragraph fix
    Bring inline: Yes. */
    p {margin: 0;}

    /* Hotmail header color reset
    Bring inline: Yes. */
    h1, h2, h3, h4, h5, h6 {color: black !important;}

    h1 a, h2 a, h3 a, h4 a, h5 a, h6 a {color: blue !important;}

    h1 a:active, h2 a:active,  h3 a:active, h4 a:active, h5 a:active, h6 a:active {
    color: red !important; /* Preferably not the same color as the normal header link color.  There is limited support for psuedo classes in email clients, this was added just for good measure. */
  }

    h1 a:visited, h2 a:visited,  h3 a:visited, h4 a:visited, h5 a:visited, h6 a:visited {
    color: purple !important; /* Preferably not the same color as the normal header link color. There is limited support for psuedo classes in email clients, this was added just for good measure. */
  }

    /* Outlook 07, 10 Padding issue fix
    Bring inline: No.*/
    table td {border-collapse: collapse; }

    /* Remove spacing around Outlook 07, 10 tables
    Bring inline: Yes */

    /* Styling your links has become much simpler with the new Yahoo.  In fact, it falls in line with the main credo of styling in email and make sure to bring your styles inline.  Your link colors will be uniform across clients when brought inline.
    Bring inline: Yes. */
    a {color: #1381b1;}
    p { color:black; }
    
    h2 {
        padding: 20px 0;
    }


    /***************************************************
    ****************************************************
    MOBILE TARGETING
    ****************************************************
    ***************************************************/
    @media only screen and (max-device-width: 480px) {
    /* Part one of controlling phone number linking for mobile. */
    a[href^="tel"], a[href^="sms"] {
    text-decoration: none;
    color: blue; /* or whatever your want */
    pointer-events: none;
    cursor: default;
  }

    .mobile_link a[href^="tel"], .mobile_link a[href^="sms"] {
    text-decoration: default;
    color: orange !important;
    pointer-events: auto;
    cursor: default;
  }

  }

    /* More Specific Targeting */

    @media only screen and (min-device-width: 768px) and (max-device-width: 1024px) {
    /* You guessed it, ipad (tablets, smaller screens, etc) */
    /* repeating for the ipad */
    a[href^="tel"], a[href^="sms"] {
    text-decoration: none;
    color: blue; /* or whatever your want */
    pointer-events: none;
    cursor: default;
  }

    .mobile_link a[href^="tel"], .mobile_link a[href^="sms"] {
    text-decoration: default;
    color: orange !important;
    pointer-events: auto;
    cursor: default;
  }
  }

    @media only screen and (-webkit-min-device-pixel-ratio: 2) {
    /* Put your iPhone 4g styles in here */
  }

    /* Android targeting */
    @media only screen and (-webkit-device-pixel-ratio:.75){
    /* Put CSS for low density (ldpi) Android layouts in here */
  }
    @media only screen and (-webkit-device-pixel-ratio:1){
    /* Put CSS for medium density (mdpi) Android layouts in here */
  }
    @media only screen and (-webkit-device-pixel-ratio:1.5){
    /* Put CSS for high density (hdpi) Android layouts in here */
  }
    /* end Android targeting */

  </style>

  <!-- Targeting Windows Mobile -->
<!--[if IEMobile 7]>
<style type="text/css">

      </style>
  <![endif]-->

  <!-- ***********************************************
  ****************************************************
  END MOBILE TARGETING
****************************************************
************************************************ -->

  <!--[if gte mso 9]>
<style>
  /* Target Outlook 2007 and 2010 */
  </style>
  <![endif]-->
  </head>
  <body><style>
@import url(https://fonts.googleapis.com/css?family=${font});

/* Type styles for all clients */
h1,h2,h3 {
    font-family: Helvetica, Arial, serif;
    text-align: center;
}
h3 {
    margin: 0;
}
p{
    font-family: Helvetica, Arial, serif;
}
/* Type styles for WebKit clients */
@media screen and (-webkit-min-device-pixel-ratio:0) {
    h1,h2,h3 {
        font-family: ${font}, Helvetica, Arial, serif !important;
    }
}
  </style>` +
        etable(
            etable(
                erow(
                    etag("h2", {'text-align': 'left'}, title) +
                    etable(
                        erow(etag('p', {}, trs[content] || content || ''), { 'text-align': 'left' })+
                        erow(etag('p', {}, trs['email.defaultSignature'] ||'')),
                        { 'text-align': 'left' }),
                    { 'text-align': 'left' }
                )+
                erow(
                    etag('hr', {}, '')+
                    etag('a', { href: "https://data.primals.net"}, 'https://data.primals.net')+
                    etag('div', {}, 'Service gratuit de base de donnée en ligne')+
                    etag("div", {}, 'Support: '+etag('a', { href:'mailto:data@primals.net'}, 'data@primals.net')),
                    { 'text-align': 'left' }
                )
            ),
            { width: "1024px", 'text-align': "left" },
        )
    );
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
            "</a>",
        ),
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
                    "</td>",
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