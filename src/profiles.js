// C:/Dev/data-primals-engine/src/profiles.js
export const profiles = {
    'personal': {
        "packs": [],
        "models": ['contact', 'location', 'imageGallery', 'budget', 'currency', 'taxonomy']
    }, // budget,
    'developer': {
        "packs": ["Multilingual starter pack", "Website Starter Pack"],
        "models": ['alert','endpoint','request','kpi','webpage', 'content', 'taxonomy', 'resource', 'translation', 'contact', 'location', 'channel', 'lang', 'token', 'message', 'ticket', 'user', 'permission', 'role']
    },
    'company': {
        "packs": ["Multilingual starter pack", "E-commerce Starter Kit"],
        "models": ['alert','request','location', 'order', 'currency', 'product', 'cart', 'cartItem', 'invoice', 'message', 'user', 'role', 'permission', 'token','translation', 'lang', 'webpage', 'content', 'taxonomy', 'contact', 'resource', 'accountingExercise', 'accountingLineItem', 'accountingEntry', 'employee', 'kpi', 'dashboard']
    },
    'engineer':  {
        "packs": ["Multilingual starter pack", "AI Content Generation - Starter Pack"],
        "models":['alert','endpoint','request','dashboard', 'kpi', 'user', 'role', 'token', 'permission', 'workflow', 'workflowRun', 'workflowStep', "channel", "message", 'workflowAction', 'workflowTrigger']
    }
};
