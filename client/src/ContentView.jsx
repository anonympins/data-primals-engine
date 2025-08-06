import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useParams, Link, useLocation } from 'react-router-dom'; // NavLink supprimé car non utilisé
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { urlData } from './core/data.js'; // urlData ajouté et correction espacement
// import Loading from '../components/Loading.jsx'; // Pour un meilleur affichage du chargement
// import NotFoundPage from './NotFoundPage'; // Si vous avez une page 404 dédiée

import './DocumentationPageLayout.scss';
import {FaChevronDown, FaChevronRight} from "react-icons/fa";
import APIInfo from "./APIInfo.jsx";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {renderToString} from "react-dom/server";
import {CodeField} from "./Field.jsx";
import uniqid from "uniqid";

// Styles SCSS (à créer ou adapter)
// import './ContentView.scss'; // Si vous voulez des styles spécifiques

// Ce composant est bien défini ici, au niveau supérieur du module.
const DocMenuGroup = ({ title, children, initialOpen = true }) => {
    const [isOpen, setIsOpen] = React.useState(initialOpen);

    return (
        <div className="doc-menu-group">
            <button onClick={() => setIsOpen(!isOpen)} className="doc-menu-group-title">
                {isOpen ? <FaChevronDown /> : <FaChevronRight />}
                <span>{title}</span>
            </button>
            {isOpen && <ul className="doc-menu-sublist">{children}</ul>}
        </div>
    );
};

const ContentView = () => { // Le prop 'menu' a été retiré car non passé par App.jsx pour cette route

    const [root, setRoot] = useState();

    const { me} = useAuthContext();
    const { models, setSelectedModel } = useModelContext();
    const wildcard = useParams()['*'];
    const [cat, ...slugArr] = wildcard.split("/"); // 'cat' est l'identifiant de la catégorie parente, 'slug' celui du contenu
    const slug = slugArr.join("/");
    const {t, i18n} = useTranslation();
    const location = useLocation();
    const langCode = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    // 2. Récupérer le contenu principal basé sur le slug et la langue
    const {data: contentData, isLoading: isLoadingContent, error: errorContent} = useQuery(
        ['contentPage', slug, langCode, cat], // Ajout de cat pour la spécificité de la clé
        () => fetch('/api/website/content?lang='+langCode+'&slug='+slug+'&limit=1&sort=_id:DESC', { headers: { 'Content-Type': 'application/json'}}).then(e => e.json())
    );
    const pageContent = contentData?.data?.[0];

    console.log({contentData})
    // 4. Récupérer les sous-catégories de la catégorie parente 'cat'
    const {data: childCategoriesData, isLoading: isLoadingChildCategories} = useQuery(
        ['childDocCategories', cat, langCode], // Clé de query mise à jour
        () => fetch('/api/website/taxonomies?lang='+langCode+'&identifier='+cat, { headers: { 'Content-Type': 'application/json' }}).then(e => e.json()), // Tri par order, puis par nom
        { enabled: !!cat && !!langCode } // Activer si cat et langCode sont présents
    );
    const childCategories = childCategoriesData?.data || [];

    // 5. Récupérer les contenus pour la table des matières (TOC)
    const childCategoryIds = useMemo(() => childCategories.map(c => c._id), [childCategories]);

    const {data: tocContentQuery, isLoading: isLoadingTocContent} = useQuery(
        ['tocContent', childCategoryIds, langCode], // Clé de query mise à jour
        () => fetch( '/api/website/content?cats='+childCategoryIds.join(',')+'&lang='+langCode+'&sort=order:ASC,title:ASC', { headers: { 'Content-Type': 'application/json' }}).then(e => e.json()), // Tri par order, puis par titre
        {enabled: !!langCode && childCategoryIds.length > 0} // Activer si langCode et des IDs de catégories enfants sont présents
    );

    const tocItemsByCategories = useMemo(() => {
        if (!tocContentQuery?.data || !childCategories.length) return {};

        const grouped = {};
        // Initialiser les groupes en respectant l'ordre des childCategories (déjà triées)
        childCategories.forEach(c => {
            const categoryName = t(c.name.key, c.name.value); // Utiliser name_translated si disponible
            grouped[categoryName] = [];
        });

        tocContentQuery.data.forEach(item => {
            // Assumant que item.category est un tableau de relations et on prend la première
            const itemCategoryId = item.category?._id;
            const parentCategory = childCategories.find(c => c._id === itemCategoryId);

            if (parentCategory) {
                console.log({pt:parentCategory.name});
                const categoryName = parentCategory.name.value || t('toc.unknownCategory', 'Autres');
                if (grouped[categoryName]) { // La catégorie doit exister car initialisée plus haut
                    grouped[categoryName].push(item); // Les items sont déjà triés par la query
                }
            } else {
                // Gérer les items sans catégorie ou avec catégorie non listée (optionnel)
                const fallbackCategoryName = t('toc.unknownCategory', 'Autres');
                if (!grouped[fallbackCategoryName]) {
                    grouped[fallbackCategoryName] = [];
                }
                grouped[fallbackCategoryName].push(item);
            }
        });
        // Filtrer les catégories vides
        return Object.fromEntries(Object.entries(grouped).filter(([_, v]) => v.length > 0));
    }, [tocContentQuery, childCategories, langCode, t]);

    const pageTitle = pageContent?.title.value;
    const pageHtml = pageContent?.html[langCode] || pageContent?.html['en'] || pageContent?.html['fr'];

    const refContent = useRef();

    useEffect(() => {
        if( contentData && refContent.current){
            setTimeout(() => {
                refContent.current.scrollIntoView({behavior:'smooth'});
            }, 50);
        }
    }, [contentData])
    
    const [codeFields, setCodeFields] = useState([]);
    useEffect(() => {

        if (pageContent)
            gtag('event', '['+langCode+'] read ' + pageContent?.slug);

        const r= document.createElement("div");
        setRoot(r);

        r.innerHTML = pageHtml || '';
        const cf = [];
        document.body.appendChild(r);
        r.querySelectorAll('pre > code').forEach(cc =>{
            const rawLanguage = (cc.getAttribute('class')||'language-json').split('-');
            const language = rawLanguage[rawLanguage.length-1];
            cf.push({c:cc.innerText,a: language});
            cc.parentNode.innerHTML = '<i>[@codeField]</i>';
        })
        document.body.removeChild(r);
        setCodeFields(cf);


    }, [pageHtml, pageContent]);


    useEffect(() => {
       if( slug && slug.startsWith('api/models/') ){
           let v = slug.split("/")[2];
           const mod = models.find(f => f.name === v && f._user === me?.username);
           setSelectedModel(mod);
       }
    }, [slug, models, me]);

    useEffect(() => {
        const mainTitle = pageContent?.title_translated?.[langCode] || pageContent?.title.value;
        if (mainTitle) {
            document.title = `${t(mainTitle, mainTitle)} - ${t('siteName', 'data-primals-engine')}`;
        } else if (!isLoadingContent && !pageContent) {
            document.title = `${t('pageNotFound.title', 'Page non trouvée')} - ${t('siteName', 'data-primals-engine')}`;
        }
    }, [pageContent, isLoadingContent, t, langCode]);

    const isLoading = isLoadingContent || isLoadingChildCategories || isLoadingTocContent;

    if (isLoading) {
        // return <Loading />; // Idéalement, utiliser un composant de chargement
        return '...';
    }

    if (errorContent) {
        return <div>{t('error.fetchContent', "Erreur lors de la récupération du contenu.")} ({errorContent.message})</div>;
    }

    // La définition de DocMenuGroup à l'intérieur de ContentView a été supprimée car elle existe déjà au niveau module.

    const navMenu = <nav className="documentation-menu">
        {Object.entries(tocItemsByCategories).map(([categoryName, items]) => (
            // Utilisation du composant DocMenuGroup défini au niveau module
            <DocMenuGroup key={categoryName} title={categoryName} initialOpen={true}> {/* Ouvre tous les groupes par défaut, ou ajustez la logique */}
                {items.map(item => {
                    const itemTitle = item.title.value;
                    return (
                        <li key={item._id}>
                            <Link className={`doc-menu-item ${location.pathname === `/${langCode}/${cat}${item.slug}` ? 'active' : ''}`} to={`/${langCode}/${cat}${item.slug}`}> {/* Assurez-vous que item.slug commence par "/" si nssaire */}
                                {t(itemTitle, itemTitle)}
                            </Link>
                        </li>
                    );
                })}
            </DocMenuGroup>
        ))}
        {Object.keys(tocItemsByCategories).length === 0 && !isLoading && (
            <p>{t('toc.noContent', 'Aucun contenu disponible pour la table des matières.')}</p>
        )}
    </nav>;

    if (!pageContent && cat === 'documentation' && !isLoadingContent) {
        return (
            <div className="flex flex-no-wrap documentation-layout">
                <aside className="documentation-sidebar">
                    <h3>{t('toc.title', 'Documentation')}</h3>
                    {navMenu}
                </aside>
                <main className="documentation-content">

                    {slug.startsWith('api/') || slug==='api' ? (
                        <APIInfo/>
                    ) : <>
                    <h1>{t('pageNotFound.title', 'Page non trouvée')}</h1>
                    <p>{t('pageNotFound.message', 'Le contenu que vous recherchez n\'existe pas ou n\'est plus disponible.')}</p>
                     <Link to={`/`}>{t('pageNotFound.goHome', `Retourner à l'accueil`)}</Link></>}

                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-no-wrap documentation-layout content-view-layout">

            {cat === 'documentation' && (<aside className="documentation-sidebar">
                <h3>{t('toc.title', 'Documentation')}</h3>
                {navMenu}
            </aside>)}

            {pageContent && (
            <main className="documentation-content" ref={refContent}>
                {pageContent.image && (
                    <img
                        src={typeof pageContent.image === 'string' ? pageContent.image : (pageContent.image.guid ? `${urlData}resources/${pageContent.image.guid}` : '')}
                        alt={pageTitle}
                        className="content-main-image"
                        style={{maxWidth: '100%', height: 'auto', marginBottom: '1em'}}
                    />
                )}
                <h1>{t(pageTitle, pageTitle)}</h1>
                <div className="content-meta">
                    {pageContent.publishedAt && (
                        <p>
                            {t('content.publishedOn', 'Publié le')}: {new Date(pageContent.publishedAt).toLocaleDateString(i18n.language)}
                        </p>
                    )}
                    {/* Vous pouvez ajouter l'auteur ici si besoin, en utilisant getDataAsString */}
                    {/* pageContent.author && (
                        <p>
                            {t('content.author', 'Auteur')}: {getDataAsString( modèleAuteur , pageContent.author)}
                        </p>
                    )*/}
                </div>

                {slug.startsWith('api/') || slug==='api' ? (
                    <APIInfo/>
                ) : root?.innerHTML.split("<pre><i>[@codeField]</i></pre>").map((m,index)=>{
                    const cc = codeFields[index];
                    console.log({cc, index});
                    return <div><div dangerouslySetInnerHTML={{__html: m}}></div>{cc && <div className={"fs-regular"}>
                            <CodeField
                                key={uniqid()}
                                value={cc.c}
                                language={cc.a}
                                name={"code" + uniqid()}
                                disabled={true}/>
                            </div>}
                        </div>;
                })}

            </main>
            )}
        </div>
    );
};

export default ContentView;