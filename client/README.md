Ce guide explique comment intégrer et utiliser la partie client de la bibliothèque data-primals-engine dans une application React externe (comme hackersonline). La bibliothèque fournit un ensemble de Providers de contexte, de Hooks et de composants d'interface utilisateur pour interagir avec le backend de data-primals-engine.

# Table des matières
## Prérequis
Votre application React doit avoir les dépendances suivantes installées :
- react & react-dom (version >= 18.0.0)
- react-query (version >= 3.0.0)
- react-router-dom
- react-cookie

## Installation
Installer la bibliothèque
```shell
npm install ../../data-primals-engine
```
Installer les dépendances peer
```shell
npm install react-query react-router-dom react-cookie
```

## Configuration de base
La configuration se fait principalement dans le fichier racine de votre application (généralement App.jsx ou main.jsx). Elle consiste à initialiser un QueryClient unique et à envelopper votre application avec les Providers nécessaires.
1. Création du QueryClient (Singleton)
   Pour que le cache de react-query fonctionne correctement à travers toute l'application (y compris à l'intérieur de la bibliothèque), il est crucial de n'instancier QueryClient qu'une seule fois.
2. Fournir le client à la bibliothèque
   La bibliothèque data-primals-engine a besoin de connaître l'instance du QueryClient que vous utilisez. Pour cela, elle exporte une fonction setQueryClient.
3. Mettre en place les Providers
   Votre application doit être enveloppée par plusieurs Providers dans le bon ordre pour que les contextes soient disponibles pour tous les composants enfants.
4. Exemple complet (App.jsx)
   Voici à quoi devrait ressembler le fichier principal de votre application :

```jsx
// Dans le fichier App.jsx de votre application principale (ex: hackersonline/client/src/App.jsx)

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CookiesProvider } from 'react-cookie';

// 1. Importer QueryClient et son Provider depuis react-query
import { QueryClient, QueryClientProvider } from 'react-query';

// 2. Importer les Providers et la fonction de configuration depuis data-primals-engine
import {
    ModelProvider,
    AuthProvider,
    UIProvider,
    NotificationProvider,
    setQueryClient // <-- Fonction de configuration importante
} from 'data-primals-engine/client';

// 3. Importer la configuration i18n (voir section dédiée)
import 'data-primals-engine/i18n';

// 4. (CRUCIAL) Créer une instance unique de QueryClient
const queryClient = new QueryClient();

// 5. (CRUCIAL) Passer l'instance à la bibliothèque partagée
setQueryClient(queryClient);

// Vos composants de page
import HomePage from './pages/HomePage';
import UserDashboard from './pages/UserDashboard';

function App() {
  return (
    // 6. Envelopper l'application avec tous les providers nécessaires
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CookiesProvider>
          <ModelProvider>
            <BrowserRouter>
              <UIProvider>
                <NotificationProvider>
                  
                  {/* Le reste de votre application */}
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/dashboard" element={<UserDashboard />} />
                    {/* ... autres routes */}
                  </Routes>

                </NotificationProvider>
              </UIProvider>
            </BrowserRouter>
          </ModelProvider>
        </CookiesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
```


## Internationalisation (i18n)

La bibliothèque est livrée avec sa propre configuration i18next et ses propres fichiers de traduction. Pour l'activer dans votre application, il vous suffit d'importer le module de configuration une seule fois dans votre fichier principal (App.jsx ou main.jsx).

```jsx
// Dans App.jsx ou main.jsx
import 'data-primals-engine/i18n';
```

Cette simple ligne d'importation se chargera de :
- Initialiser i18next.
- Charger les traductions par défaut (français, anglais, etc.).
- Mettre en place la détection de la langue du navigateur.

Vous pouvez ensuite utiliser les composants et hooks de react-i18next (useTranslation, Trans) comme d'habitude dans votre application.