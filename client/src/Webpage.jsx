import React, {useState, useEffect, useMemo, useContext} from 'react';

import "./App.scss";
import {useQuery} from "react-query";
import {useLocation} from "react-router-dom";
import {Helmet} from "react-helmet";
import {useTranslation} from "react-i18next";
import {getObjectHash} from "data-primals-engine/core";
import {useData} from "./hooks/data.js";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {getUserHash, getUserId} from "data-primals-engine/data";


function Webpage({children}) {

    const { me } = useAuthContext();
    const loc = useLocation();
    const webpageModel = 'webpage';
    const contentModel = 'content';

    const id = getUserId(me);
    const loco = loc.pathname.replace('/user/'+id+'/', '/');
    const {data: webpages, isFetched} = useData(webpageModel, {'path':'^'+loco+'$', 'published': true},{ staleTime: 50000 });
    const webpage = webpages?.[0];

    const {data: contents } = useData(contentModel, {'$and': [{'webpage': webpage?._id, 'published': true}]},{ staleTime: 30000, enabled: !!webpage });

    const { i18n, t } = useTranslation();
    const lang = (i18n.resolvedLanguage || i18n.language).split(/[-_]/)?.[0];

    return <>
        {webpage && <>
            <Helmet htmlAttributes={{ lang }} />
            <Helmet>
                <title>{t(webpage.title)}</title>
                <meta name="description" content={webpage.description}/>
                <meta property="og:description" content={webpage.description}/>
                <meta property="twitter:description" content={webpage.description}/>
                <meta property="og:title" content={t(webpage.title)}/>
                <meta property="twitter:title" content={t(webpage.title)}/>
                <meta property="og:image" content={webpage.image}/>
                <meta property="twitter:image" content={webpage.image}/>
            </Helmet>
            <h1>{webpage.title}</h1>
            <div className="content" dangerouslySetInnerHTML={{__html: webpage.text}}></div>
            {(contents || []).map(content => {
                return <div className="content">
                        {content.title && (<Helmet><title>{t(content.title)}</title>
                            <meta property="og:title" content={t(webpage.title)}/>
                    <meta property="twitter:title" content={t(webpage.title)}/></Helmet>)}
                        {content.description && (<Helmet><meta name="description" content={content.description}/>
                        <meta property="og:description" content={content.description}/>
                        <meta property="twitter:description" content={content.description}/></Helmet>)}
                        {content.image && (<Helmet><meta property="og:image" content={content.image}/>
                        <meta property="twitter:image" content={content.image}/></Helmet>)}
                    <article>
                        <h2>{t(content.title)}</h2>
                        <p className="subtitle"></p>
                        <p dangerouslySetInnerHTML={{ __html: content.text }}></p>
                    </article>
                </div>
            })}
        </>
        }
        {!webpage && isFetched && (<Helmet><title>Page non trouvée</title></Helmet>)}
    </>
}

export default Webpage;