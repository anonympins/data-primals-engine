import React, {useState, useEffect, useMemo, Suspense, lazy, useReducer, useRef} from 'react';

import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/styles.css";
import "./App.scss";
import {QueryClient, QueryClientProvider, useMutation, useQuery} from "react-query";
import {
    BrowserRouter,
    Outlet,
    Route,
    Routes,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams
} from "react-router-dom";
import {Trans, useTranslation} from "react-i18next";
import "../../src/i18n.js"
import "../src/i18n.js"

import {
    ModelProvider, useModelContext,
    AuthProvider, useAuthContext,
    UIProvider, useUI,
    NotificationProvider, useNotificationContext,
    useLocalStorage,
    DataLayout,
    Webpage,
    SelectField, TextField,
    Button,
    APIInfo,
    NotificationList,
    DashboardsPage,
    RestoreDialog,
    MessageRotator,
    DocumentationPageLayout,
    ContentView,
    AssistantChat
} from '../index.js';

import {
    FaBell,
    FaDatabase, FaDiscord, FaFacebook, FaGithub,
    FaHome,
    FaInfo,
    FaKey,
    FaLanguage,
    FaMobile, FaQuestion, FaSignInAlt, FaSignOutAlt,
    FaStar, FaUser
} from "react-icons/fa";
import {Helmet} from "react-helmet";
import {useCookies, CookiesProvider} from "react-cookie";

import { translations as allTranslations} from "../../src/i18n.js";
import {getBrowserRandom, getRandom} from "../../src/core.js";
import {getUserHash} from "../../src/data.js";
import {langs, seoTitle} from "./constants.js";
import {host} from "../../src/constants.js";
import i18next from "i18next";
import {websiteTranslations} from "./translations.js";

import { Tooltip } from 'react-tooltip';
import {providers} from "../../src/modules/assistant/constants.js";

let queryClient = new QueryClient();

export const setQueryClient = (q) => {
    queryClient = q;
};
import {CommandProvider} from "./contexts/CommandContext.jsx";

function TopBar({header}) {

    const location = useLocation();
    const { i18n, t } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];


    useEffect(() => {
        if( location.pathname ){
            gtag('config', 'G-NDHNSVB4YB', { page_path: location.pathname });
        }
    }, [location]);
    const searchParams = useSearchParams();
    return <>{header}</>;
}

// --- CORRECTION ARCHITECTURALE ---
// BaseLayout est maintenant une fonction de composant stable, définie en dehors de App.
const BaseLayout=({onResetQueryClient, refreshUI})=>{
    const { i18n } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    const changeLanguage = (newLang) => {
        if (typeof(newLang) === 'string' && newLang) {
            i18n.changeLanguage(newLang, (err)=>{
                if (err) return console.error('something went wrong loading', err);
                i18next.removeResourceBundle(lang, "dataEngineTranslations");
                const trs = {...websiteTranslations[newLang]?.['translation']} || {};
                i18next.addResourceBundle(newLang, 'dataEngineTranslations', trs);
                gtag("event", "change_language "+newLang);
            });
        }
    };

    useEffect(() => {
        changeLanguage(lang);
    }, [lang]);

    return <Layout refreshUI={refreshUI} onResetQueryClient={onResetQueryClient} header={<header className={"flex"}>
        <Tooltip id={"header"}/>
        <h1 className="flex-1">{seoTitle}</h1>
        <div className="flex">
            <FaQuestion data-tooltip-id="header" data-tooltip-content="Documentation" onClick={()=> {
                window.open("/en/documentation/", "_blank");
            }} />
        </div>
    </header>} />
}

// --- CORRECTION ARCHITECTURALE ---
// Layout est maintenant une fonction de composant stable, définie en dehors de App.
function Layout({ header, routes, body, footer, refreshUI, onResetQueryClient }) {
    const [cookies, setCookie, removeCookie] = useCookies(['username']);
    const { i18n, t } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];
    const {models= [], setGeneratedModels } = useModelContext();
    const { me, setMe } = useAuthContext();
    const { assistantConfig, setAssistantConfig} = useUI();
    const promotionalMessages = [
        { text: t('promo.rotation.6') },
        { text: t('promo.rotation.1') },
        { text: t('promo.rotation.2') },
        { text: t('promo.rotation.1') },
        { text: t('promo.rotation.4') },
        { text: t('promo.rotation.5') }
    ];
    useQuery(
        'assistantConfig', // La clé de la requête reste la même
        () => {
            // On appelle l'endpoint de recherche générique
            return fetch('/api/data/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // L'authentification sera gérée par le contexte ou un intercepteur
                },
                body: JSON.stringify({
                    model: 'env', // On cible le modèle 'env'
                    filter: { "name": { "$in": Object.values(providers).map(p => p.key) } },
                    limit: Object.values(providers).length
                })
            }).then(res => res.json());
        },
        {
            enabled: !!me && models.find(f => f.name === 'env' && me?.username === f.username), // Toujours activé uniquement si l'utilisateur est connecté
            staleTime: 60000,
            onSuccess: (response) => {
                if (!response.data) {
                    setAssistantConfig(null);
                    return;
                }
                const availableKeys = response.data;
                const newConfig = Object.keys(providers).reduce((config, providerKey) => {
                    const envVarName = providers[providerKey].key;
                    const foundKey = availableKeys.find(key => key.name === envVarName);
                    if (foundKey) {
                        config[providerKey] = foundKey.value;
                    }
                    return config;
                }, {});

                if (Object.values(newConfig).filter(Boolean).length > 0) {
                    setAssistantConfig(newConfig);
                } else {
                    setAssistantConfig(null);
                }
            },
            retry: false,
        }
    );


    // AJOUT : Liste des suggestions de prompts
    const suggestedPrompts = [
        {
            title: t('suggested_prompt.movies.title', 'Collection de films'),
            prompt: t('suggested_prompt.movies.prompt', 'Une liste de mes films préférés avec leur réalisateur, année de sortie et une note sur 5.')
        },
        {
            title: t('suggested_prompt.inventory.title', 'Inventaire de boutique'),
            prompt: t('suggested_prompt.inventory.prompt', "Un inventaire simple pour ma petite boutique en ligne, avec le nom du produit, le prix et la quantité en stock.")
        },
        {
            title: t('suggested_prompt.expenses.title', 'Suivi de dépenses'),
            prompt: t('suggested_prompt.expenses.prompt', "Un suivi de mes dépenses mensuelles, avec une description, un montant et une catégorie (nourriture, transport, loisirs...).")
        },
        {
            title: t('suggested_prompt.recipes.title', 'Recettes de cuisine'),
            prompt: t('suggested_prompt.recipes.prompt', "Une collection de recettes de cuisine, avec les ingrédients, les instructions et le temps de préparation.")
        }
    ];

    const { setCurrentTourSteps, setAllTourSteps, currentTour, setCurrentTour } = useUI();


    const isProd = import.meta.env.MODE === 'production';
    const loc = useLocation();


    const [currentProfile, setCurrentProfile] = useLocalStorage('profile', null);

    const showDatas = () => {
        if( me )
           nav('/user/' + getUserHash(me) + '/');
    }

    const showWebsite = () => {
        if( me ) {
            nav('/user/' + getUserHash(me) + '/cms/');
        }
    }


    const nav = useNavigate();

    const [red, triggerSignin] = useReducer((d) => d+1, 0, () => 0);

    const [ activeTuto ] = useLocalStorage('activeTuto', null);
    const menu=<>{(!me) && !loc.pathname.startsWith("/user/demo") && (<Button className={"btn btn-nav btn-ellipsis btn-primary btn-big"} onClick={() => {
        gtag("event", "nav to demo");
        setCurrentProfile(null);
        const username = 'demo'+getBrowserRandom(1, 99);
        setMe({username});
        setCookie('username', username, { path : "/", domain: isProd ? host : 'localhost'});
        nav('/user/'+username, { state: { startTour: true } });
    }}><Trans i18nKey={"links.demo"}>Demo</Trans></Button>)}</>

    const onAuthenticated = (me, signedIn) => {
        if(/^demo[0-9]{1,2}$/.test(me?.username)) {
            setMe({...me, activeTutorial : activeTuto});
            gtag("event", "signed_in (demo)");
        }
        else if(me){
            setMe(me);
            gtag("event", "signed_in");
        }

        if (signedIn && me && !loc.pathname.startsWith("/user/"+getUserHash(me)))
            nav("/user/" + getUserHash(me) + "/");
    };

    useEffect(() => {
        if( !cookies.username) {
            const username ='demo' + getBrowserRandom(1, 99);
            setCookie("username", username, { path : "/", domain: isProd ? host : 'localhost'});
            onAuthenticated({username}, true);
        }
    }, [cookies.username]);


    const dashboardModelFound = models.find(f => f.name === 'dashboard' && f._user === me?.username);
    const outlet = useMemo(() => <>
        <TopBar header={header} />
        <div id={"content"}>
            <Outlet />
        </div>
    </>, [red, me]);

    const [lightboxOpened, setLightboxOpened] = React.useState(false);
    const [lightboxIndex, setLightboxIndex] = React.useState(0);

    const slides = [{src: "/prez1.jpg", title: t('prez1')},{src: "/prez6.jpg", title: i18n.t('prez3')},{src: "/prez2.jpg", title: t('prez2')},{src: "/prez4.jpg", title: i18n.t('prez4')},{src: "/prez5.jpg", title: i18n.t('prez5')}];

    const { addNotification } = useNotificationContext();

// Ce hook est maintenant correct car `addNotification` vient du bon contexte.
    useEffect(() => {
        if (!me || !me.username) {
            return;
        }

        let eventSource;

        const connect = () => {
            const url = `/api/alerts/subscribe?_user=${encodeURIComponent(me.username)}`;
            eventSource = new EventSource(url);

            eventSource.onopen = () => {
                //console.log('[SSE] Connexion au serveur lie pour les alertes.');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    //console.log('[SSE] Données reçues:', data);

                    if (data.type === 'cron_alert') {
                        // Cet appel va maintenant fonctionner et afficher la notification
                        addNotification({
                            title: data.message,
                            description: data.message,
                            status: 'info',
                            icon: <FaBell />,
                            timeout: 60000
                        });
                    } else if (data.type === 'connection_established') {
                        //console.log(`[SSE] ${data.message}`);
                    }

                } catch (error) {
                    //console.error('[SSE] Erreur lors du parsing du message reçu:', error);
                }
            };

            eventSource.onerror = (error) => {
                //console.error('[SSE] Erreur EventSource:', error);
                if (eventSource.readyState === EventSource.CLOSED) {
                    //console.log('[SSE] La connexion a été fermée.');
                }
                eventSource.close();
            };
        }

        connect();

        return () => {
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [me, addNotification, t]);
    const [prompt, setPrompt] = useLocalStorage("ai_model_prompt", null);
    const [promptResult, setPromptResult] = useLocalStorage("ai_model_prompt_result", null);
    const handleGenerateClick = (p) => {
        gtag('event', 'homepage model generation');
        setCurrentTour(null);
        const username = 'demo'+getBrowserRandom(0, 99);
        setMe({username});

        setPromptResult(null);
        setCookie('username', username, { path : "/", domain: isProd ? host : 'localhost'});
        nav('/user/'+username, { state: { startTour: false } });
    };

    const myInputRef = useRef(null);

    return <div className={['ar', 'fa'].includes(lang)? 'rtl' : 'ltr'}>
        <><Helmet><title>
            {t('seo.title', seoTitle)}</title></Helmet></>
        <Routes>
            <Route path={"/backup/restore"} element={<>
                <RestoreDialog />
            </>} />
            <Route path={"/"} element={outlet}>
                <Route path={"/documentation/*"} element={<DocumentationPageLayout topBarMenu={menu} />}>
                    <Route index element={<APIInfo />} />
                    {/*
                    <Route path="api/reference/:modelName" element={<APIInfo />} />
                    <Route path="advanced/features" element={<AdvancedFeaturesPage />} />*/}
                </Route>
                <Route path={""} element={<>

                    <div className="flex flex-row flex-no-wrap">
                        <div className="flex flex-1 flex-no-gap home-header">
                            <div className="flex flex-self-end">
                                <a href={"https://github.com/anonympins/data-primals-engine"} target={"_blank"} className="link-top"><img src={"/github.svg"} alt={"Github"} /></a>
                            </div>
                            <div className="flex prior">
                                <img
                                    src="https://web.primals.net/PRIOR.png"
                                    alt={"Prior, the Primals.net mascotte !"}
                                    width={250}
                                />
                                <div className="bubble flex-1">
                                    <h1><Trans i18nKey={"prez.title"}>{seoTitle}</Trans></h1>
                                    <div className="inner"><MessageRotator messages={promotionalMessages} fadeDuration={200} defaultDelay={7500}/></div>
                                </div>
                            </div>
                            <div className="flex flex-row">
                                {menu}
                            </div>
                            <div className="ai-home-prompt-section">
                                <h2>{t('home.ai_prompt.title')}</h2>
                                <TextField
                                    ref={myInputRef}
                                    multiline
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={t('home.ai_prompt.placeholder', "Décrivez quel genre de données vous voulez stocker (produits, clients, pages web...), ou envoyez simplement votre idée à l'IA !")}
                                />
                                <Button onClick={() => handleGenerateClick(prompt)}>
                                    {t('home.ai_prompt.button', "Générer mon modèle")}
                                </Button>
                                <div className="suggested-prompts">
                                    <p>{t('home.ai_prompt.suggestions_title', 'Ou essayez une de nos suggestions :')}</p>
                                    <ul>
                                        {suggestedPrompts.map((p, index) => (
                                            <li key={index} onClick={() => {
                                                setPrompt(p.prompt);
                                                setTimeout(() => handleGenerateClick(), 200);
//                                                myInputRef.current.scrollIntoView({ behavior: 'smooth'});
                                            }}>
                                                <strong>{p.title}</strong>
                                                <span>{p.prompt}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                        </div>
                        {body}
                    </div>
                    <div className="actions flex">{menu}</div>
                </>}/>

                <Route path={"/user/:user/cms/*"} element={<>
                    {me && (<Webpage/>)}
                    {!me && (<></>)}
                </>}/>

                <Route path="/user/:user/dashboards/:hash?" element={<>
                    {menu}
                    {<DashboardsPage />}
                </>} />

                <Route path={"/user/:user/*"} element={<>
                    {menu}
                    <UserPage notifs={[]} refreshUI={refreshUI} onAuthenticated={onAuthenticated} triggerSignin={triggerSignin} onResetQueryClient={onResetQueryClient} />
                    {!me && (<></>)}
                </>}/>
                <Route path={"/:lang/*"} element={<>
                    {menu}
                    <ContentView/>
                </>}/>

                {routes}
            </Route>
        </Routes>
        <footer className="flex flex-centered">
            {footer}
        </footer>
    </div>;
}

function UserPage({notifs,triggerSignin,refreshUI, onAuthenticated, onResetQueryClient}) {
    const [cookies, setCookie, removeCookie] = useCookies(['username']);
    const params = useParams();
    const [started, setStarted] = useState(false);
    const {t } = useTranslation()

    const [prompt, setPrompt] = useLocalStorage("ai_model_prompt", null);
    const { me } = useAuthContext();
    const id = getUserHash(me)+'';

    // NOUVEAU : On récupère l'état de la navigation
    const location = useLocation();
    const shouldStartTour = location.state?.startTour;
    const isDemo = /^demo[0-9]{1,2}$/.test(me?.username);
    const { setCurrentTourSteps, setAllTourSteps, launchedTours } = useUI();

    useEffect(() => {
        if( cookies.username){
            onAuthenticated({username: cookies.username}, true);
        }
    }, [cookies.username]);

    const allTourSteps = {
        demo: [
            { selector: '.tourStep-create-model', content: t('tourpoint.createModel'), position: 'top' },
            { selector: '.tourStep-import-model', content: t('tourpoint.importModel'), position: 'top' },
            { selector: '.tourStep-profile', content: t('tourpoint.profile'), position: 'bottom' },
        ],
        guides: [
            { selector: '.tourStep-tutorials', content: t('tourpoint.tutorials'), position: 'bottom' },
            { selector: '.tourStep-import-datapack', content: t('tourpoint.importDatapack'), position: 'bottom' }
        ],
        personal: [
            { selector: '.model-list [data-testid=model_budget]', content: t('tourpoint.model-list-budget', 'Gérez votre budget et votre portefeuille avec précision !'), placement: 'bottom' },
            { selector: '.model-list [data-testid=model_contact]', content: t('tourpoint.model-list-contact', 'Ne perdez plus les coordonnées de vos contacts !'), placement: 'bottom' },
            { selector: '.model-list [data-testid=model_imageGallery]', content: t('tourpoint.model-list-imageGallery', 'Classez vos images, photos, illustrations...'), placement: 'bottom' },
        ],
        developer: [
            { selector: '.btn[data-testid=btn-documentation]', content: t('tourpoint.doc', 'Prenez connaissance de la documentation, pour vous aider à utiliser l\'API ou le mode bac à sable.'), placement: 'bottom' },
        ],
        company: [
            { selector: '.btn[data-testid=btn-dashboards]', content: t('tourpoint.dashboards', 'Vos dashboards vous permettent de construire et suivre votre activité en temps réel.'), placement: 'bottom' },
        ],
        engineer: [
            { selector: '.model-list-search-bar-container', content: t('tourpoint.workflows', 'Tapez "workflow" dans la barre de recherche pour obtenir les modèles d\'automatisation, ou tout autre mot-clé.'), placement: 'bottom' },
        ],
    };

    useEffect(() => {
        if( isDemo && shouldStartTour){
            setCurrentTourSteps(allTourSteps.demo);
        }
        setAllTourSteps(allTourSteps);
    }, [isDemo, shouldStartTour]);

    return <>{/^demo[0-9]{1,2}$/.test(me?.username) && notifs}
        {params.user === id && <DataLayout refreshUI={refreshUI} onResetQueryClient={onResetQueryClient}/>}
        {params.user !== id && <p>Veuillez vous authentifier avec cet utilisateur &quot;{params.user}&quot; pour accéder à vos données</p>}</>;
}

function App() {
    // On gère le queryClient dans un état pour pouvoir le réinitialiser complètement.
    const [queryClient, setQueryClient] = useState(() => new QueryClient());
    const [refreshKey, setRefreshKey] = useState(0);

    // La fonction qui va créer une NOUVELLE instance du client.
    const resetQueryClient = () => {
        setQueryClient(new QueryClient());
        setRefreshKey(key => key + 1); // On incrémente la clé pour forcer le re-montage.
    };

    const [refreshReducer, refreshUI]= useReducer((n) => n+1, 0,() => 0);

    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider key={refreshKey}>
                <CookiesProvider>
                    <ModelProvider key={refreshKey}>
                        <BrowserRouter>
                            <UIProvider>
                                    <CommandProvider onResetQueryClient={resetQueryClient}>
                                        <NotificationProvider>
                                            <BaseLayout onResetQueryClient={resetQueryClient} refreshUI={refreshUI} />
                                        </NotificationProvider>
                                    </CommandProvider>
                            </UIProvider>
                        </BrowserRouter>
                    </ModelProvider>
                </CookiesProvider>
            </AuthProvider>
        </QueryClientProvider>
    );
}

export default App;