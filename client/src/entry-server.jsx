import React from 'react'
import ReactDOMServer from 'react-dom/server'
import App from './App'
import {StaticRouter} from "react-router";

export function render() {
    const html = ReactDOMServer.renderToString(
            <StaticRouter location={"/"}>
                <App />
            </StaticRouter>
    )
    return { html }
}