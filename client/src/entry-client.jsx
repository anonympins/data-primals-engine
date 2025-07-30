import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import {BrowserRouter} from "react-router-dom";
import dns from "dns";

dns.setDefaultResultOrder("verbatim");

ReactDOM.hydrateRoot(
    document.getElementById('root'),
        <BrowserRouter>
            <App />
        </BrowserRouter>
)