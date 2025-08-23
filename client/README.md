This guide explains how to integrate and use the client-side part of the `data-primals-engine` library in an external React application (such as hackersonline).  
The library provides a set of context Providers, Hooks, and UI components to interact with the `data-primals-engine` backend.

# Table of Contents
## Prerequisites
Your React application must have the following dependencies installed:
- react & react-dom (version >= 18.0.0)
- react-query (version >= 3.0.0)
- react-router-dom
- react-cookie

## What is `data-primals-engine`?

The `data-primals-engine` is more than just a set of utilities; it's a comprehensive toolkit for building data-centric applications. Once integrated, it provides a full suite of UI components and hooks to manage your data lifecycle.

### Core Features

*   **AI-Powered Model Creator**: A complete UI for visually creating your data models, with support for dozens of field types (relations, translated text, numbers, files...) and advanced properties (history, validation, conditional display...).
*   **Dynamic Data Views**: Ready-to-use components to display your data, including:
    *   A powerful and configurable **Data Table**.
    *   A **Kanban View** with drag-and-drop.
    *   A **Calendar View**.
*   **Dashboards & KPIs**: Build custom dashboards to monitor your activity with charts and Key Performance Indicators.
*   **Data Management Tools**:
    *   A flexible **Data Importer** (CSV, Excel, JSON).
    *   A powerful **Data Exporter**.
    *   A **Visual Condition Builder** for creating complex queries.
*   **Built-in Systems**: The library also includes systems for **user tutorials**, **data versioning/history**, **backups**, and much more.

This guide focuses on the technical integration. Once set up, you will be able to use the components and hooks provided by the library to leverage these features.

## Installation
Install the library:
```shell
npm install ../../data-primals-engine
```
Install peer dependencies:
```shell
npm install react-query react-router-dom react-cookie
```

## Basic Setup

The setup mainly occurs in your application's root file (typically App.jsx or main.jsx).

It consists of initializing a single QueryClient instance and wrapping your app with the required Providers.

### Set the QueryClient (Singleton)
For react-query caching to work correctly across your app (including inside the library), it is crucial to instantiate QueryClient only once.

The data-primals-engine library needs to know which QueryClient instance you're using. It exports a setQueryClient function for that purpose.

### Set up the Providers
Your app must be wrapped by several Providers in the correct order so the contexts are available to all child components.

## Full example (App.jsx)
Here's what your main application file should look like:
```jsx
// In your main App.jsx file (e.g., hackersonline/client/src/App.jsx)

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CookiesProvider } from 'react-cookie';

// 1. Import QueryClient and its Provider from react-query
import { QueryClient, QueryClientProvider } from 'react-query';

// 2. Import Providers and the config function from data-primals-engine
import {
   ModelProvider,
   AuthProvider,
   UIProvider,
   NotificationProvider,
   setQueryClient // <-- Important config function
} from 'data-primals-engine/client';

// 3. Import the i18n config (see dedicated section)
import 'data-primals-engine/i18n';

// 4. (CRUCIAL) Create a unique instance of QueryClient
const queryClient = new QueryClient();

// 5. (CRUCIAL) Pass the instance to the shared library
setQueryClient(queryClient);

// Your page components
import HomePage from './pages/HomePage';
import UserDashboard from './pages/UserDashboard';

function App() {
   return (
           // 6. Wrap the app with all required providers
           <QueryClientProvider client={queryClient}>
              <AuthProvider>
                 <CookiesProvider>
                    <ModelProvider>
                       <BrowserRouter>
                          <UIProvider>
                             <NotificationProvider>

                                {/* Your app content */}
                                <Routes>
                                   <Route path="/" element={<HomePage />} />
                                   <Route path="/dashboard" element={<UserDashboard />} />
                                   {/* ... other routes */}
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

## Internationalization (i18n)
The library comes with its own i18next configuration and translation files.
To enable it in your app, you just need to import the config module once in your main file (App.jsx or main.jsx):

```jsx
// In App.jsx or main.jsx
import 'data-primals-engine/i18n';
```

This simple import will:

- Initialize i18next.
- Load default translations (French, English, etc.).
- Enable automatic browser language detection.

You can then use react-i18next components and hooks (useTranslation, Trans) as usual in your application.
