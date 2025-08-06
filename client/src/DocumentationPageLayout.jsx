import React from 'react';
import { Outlet } from 'react-router-dom';
import './DocumentationPageLayout.scss'; // Nous créerons ce fichier SCSS ensuite
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';

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

const DocumentationMenu = () => {
    const { t } = useTranslation();

    // Définissez ici votre structure de menu
    // Vous pouvez la rendre plus dynamique si nécessaire, par exemple en la chargeant depuis un JSON
    const menuItems = [
        {
            title: t('doc.menu.gettingStarted', 'Bien commencer'),
            links: [
                { path: '/documentation/getting-started', label: t('doc.menu.welcome', 'Les bases') },
                { path: '/documentation/concepts/model-vs-data', label: t('doc.menu.modelVsData', 'Modèles vs. Données') },
            ],
        },
        {
            title: t('doc.menu.data', 'Concevez votre application'),
            links: [
                { path: '/documentation/modeling/creating-models', label: t('doc.menu.creatingModels', 'Créer un modèle') },
                // Ajoutez d'autres liens ici: Types de champs, Relations
            ],
        },
        {
            title: t('doc.menu.apiUsage', 'Utiliser l\'API'),
            links: [
                { path: '/documentation/api/guide', label: t('doc.menu.apiGuide', 'Documentation de l\'API') },
                // Pour lister dynamiquement les modèles pour API Reference :
                // Vous pourriez récupérer la liste des modèles via useModelContext ici
                // et générer des liens comme `/documentation/api/reference/${model.name}`
                // Exemple (simplifié, à adapter) :
                // ...models.map(model => ({ path: `/documentation/api/reference/${model.name}`, label: model.name }))
            ],
        }
    ];

    return (
        <nav className="documentation-menu">
            {menuItems.map((group, index) => (
                <DocMenuGroup key={index} title={group.title} initialOpen={index === 0}> {/* Ouvre le premier groupe par défaut */}
                    {group.links.map((link, linkIndex) => (
                        <li key={linkIndex}>
                            <NavLink
                                to={link.path}
                                className={({ isActive }) => (isActive ? 'doc-menu-item active' : 'doc-menu-item')}
                            >
                                {link.label}
                            </NavLink>
                        </li>
                    ))}
                </DocMenuGroup>
            ))}
        </nav>
    );
};

const DocumentationPageLayout = ({ topBarMenu }) => {
    return (
        <>
            {topBarMenu} {/* Affiche la barre de menu supérieure globale */}
            <div className="documentation-layout">
                <aside className="documentation-sidebar">
                    <DocumentationMenu />
                </aside>
                <main className="documentation-content">
                    <Outlet /> {/* Affiche le contenu de la page de documentation active */}
                </main>
            </div>
        </>
    );
};

export default DocumentationPageLayout;