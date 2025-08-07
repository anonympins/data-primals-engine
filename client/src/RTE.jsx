import 'react'
import { Color } from '@tiptap/extension-color'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import HardBreak from '@tiptap/extension-hard-break'
import CodeBlock from '@tiptap/extension-code-block'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import {EditorContent, EditorProvider, ReactNodeViewRenderer, useCurrentEditor, useEditor} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
    FaBold,
    FaCode,
    FaHeading,
    FaItalic, FaLine, FaListOl,
    FaListUl,
    FaParagraph, FaQuoteLeft, FaRedo,
    FaRemoveFormat, FaRulerHorizontal,
    FaStrikethrough, FaTrash, FaUndo
} from "react-icons/fa";
import React, {useEffect, useState} from "react";
import {FaFileLines} from "react-icons/fa6";

// load all languages with "all" or common languages with "common"
import { all, createLowlight } from 'lowlight'
import css from 'highlight.js/lib/languages/css'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import {escapeHtml, escapeRegex} from "data-primals-engine/core";
// create a lowlight instance
const lowlight = createLowlight(all)

// you can also register individual languages
lowlight.register('html', html)
lowlight.register('css', css)
lowlight.register('js', js)
lowlight.register('ts', ts)

const code = (c) => {
    if( !c)
        return '';
    const doc = document.createElement('div');
    doc.innerHTML = c;
    doc.querySelectorAll('code').forEach(cc =>{
        cc.innerHTML = escapeHtml(cc.textContent)
            .replace(/\r\n|\n/g, "<br />")
            .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
    })
    return doc.innerHTML;
}

const MenuBar = ({showSource, setShowSource, editor, field, onChange}) => {

    const showSourceFunc = () => {
        if( !editor)
            return;
        editor.commands.setContent(`<textarea>${code(editor.getHTML())}</textarea>`)
        onChange?.({name: field.name, value: code(editor.getHTML())});
    }

    const showHTMLFunc = () => {
        if( !editor)
            return;
        editor.commands.setContent(editor.getText());
        onChange?.({name: field.name, value: code(editor.getHTML())});
    }

    useEffect(() =>{
        if( showSource )
            showSourceFunc()
        else
            showHTMLFunc();
    }, [showSource])
    return (
        <div className="control-group">
            <div className="flex flex-centered">
                <button
                    tabIndex={-1}
                    type={"button"}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .toggleBold()
                            .run()
                    }
                    className={editor.isActive('bold') ? 'is-active' : ''}
                >
                    <FaBold/>
                </button>
                <button
                    tabIndex={-1}
                    type={"button"}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .toggleItalic()
                            .run()
                    }
                    className={editor.isActive('italic') ? 'is-active' : ''}
                >
                    <FaItalic/>
                </button>
                <button
                    tabIndex={-1}
                    type={"button"}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .toggleStrike()
                            .run()
                    }
                    className={editor.isActive('strike') ? 'is-active' : ''}
                >
                    <FaStrikethrough/>
                </button>
                <button
                    tabIndex={-1}
                    type={"button"}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .toggleCode()
                            .run()
                    }
                    className={editor.isActive('code') ? 'is-active' : ''}
                >
                    <FaFileLines/>
                </button>
                <button
                    tabIndex={-1}
                    type={"button"} onClick={() => editor.chain().focus().unsetAllMarks().run()}>
                    <FaRemoveFormat/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    className={editor.isActive('paragraph') ? 'is-active' : ''}
                >
                    <FaParagraph/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()}
                    className={editor.isActive('heading', {level: 1}) ? 'is-active' : ''}
                >
                    <FaHeading/>1
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()}
                    className={editor.isActive('heading', {level: 2}) ? 'is-active' : ''}
                >
                    <FaHeading/>2
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()}
                    className={editor.isActive('heading', {level: 3}) ? 'is-active' : ''}
                >
                    <FaHeading/>3
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 4}).run()}
                    className={editor.isActive('heading', {level: 4}) ? 'is-active' : ''}
                >
                    <FaHeading/>4
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 5}).run()}
                    className={editor.isActive('heading', {level: 5}) ? 'is-active' : ''}
                >
                    <FaHeading/>5
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleHeading({level: 6}).run()}
                    className={editor.isActive('heading', {level: 6}) ? 'is-active' : ''}
                >
                    <FaHeading/>6
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive('bulletList') ? 'is-active' : ''}
                >
                    <FaListUl/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={editor.isActive('orderedList') ? 'is-active' : ''}
                >
                    <FaListOl/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => setShowSource(!showSource)}
                    className={showSource ? 'is-active' : ''}
                >
                    <FaCode/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={editor.isActive('blockquote') ? 'is-active' : ''}
                >
                    <FaQuoteLeft/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .undo()
                            .run()
                    }
                >
                    <FaUndo/>
                </button>
                <button
                    type={"button"}
                    tabIndex={-1}
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={
                        !editor.can()
                            .chain()
                            .focus()
                            .redo()
                            .run()
                    }
                >
                    <FaRedo/>
                </button>
                <button
                    tabIndex={-1}
                    type={"button"} onClick={() => editor.chain().focus().clearNodes().run()}>
                    <FaTrash />
                </button>
            </div>
        </div>
    )
}


export const ExtendedImage = Image.extend({
    addAttributes() {
        return {
            src: {
                default: '',
            },
            alt: {
                default: undefined,
            },
            title: {
                default: undefined,
            },
            width: {
                default: undefined,
            },
            height: {
                default: undefined,
            },
            style: {
                default: undefined,
            },
        }
    }
})

const CodeBlockComponent = ({children, ...rest}) => {
    console.log(rest);
    return children;
};

const extensions = [
    HardBreak,
    CodeBlock,
    CodeBlockLowlight
        .configure({ lowlight }),
    Color.configure({types: [TextStyle.name, ListItem.name]}),
    TextStyle.configure({types: [ListItem.name]}),
    StarterKit.configure({
        bulletList: {
            keepMarks: true,
            keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
        },
        orderedList: {
            keepMarks: true,
            keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
        },
    }),
    ExtendedImage.configure(),
    Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https'],
        HTMLAttributes: {
            // Change rel to different value
            // Allow search engines to follow links(remove nofollow)
            rel: 'noopener noreferrer',
            // Remove target entirely so links open in current tab
            target: null,
        },
        isAllowedUri: (url, ctx) => {
            try {
                // construct URL
                const parsedUrl = url.includes(':') ? new URL(url) : new URL(`${ctx.defaultProtocol}://${url}`)

                // use default validation
                if (!ctx.defaultValidate(parsedUrl.href)) {
                    return false
                }

                // disallowed protocols
                const disallowedProtocols = ['ftp', 'file', 'mailto']
                const protocol = parsedUrl.protocol.replace(':', '')

                if (disallowedProtocols.includes(protocol)) {
                    return false
                }

                // only allow protocols specified in ctx.protocols
                const allowedProtocols = ctx.protocols.map(p => (typeof p === 'string' ? p : p.scheme))

                if (!allowedProtocols.includes(protocol)) {
                    return false
                }

                // disallowed domains
                const disallowedDomains = [];//['example-phishing.com', 'malicious-site.net']
                const domain = parsedUrl.hostname

                if (disallowedDomains.includes(domain)) {
                    return false
                }

                // all checks have passed
                return true
            } catch {
                return false
            }
        },
        shouldAutoLink: url => {
            try {
                // construct URL
                const parsedUrl = url.includes(':') ? new URL(url) : new URL(`https://${url}`)

                // only auto-link if the domain is not in the disallowed list
                const disallowedDomains = [];
                const domain = parsedUrl.hostname

                return !disallowedDomains.includes(domain)
            } catch {
                return false
            }
        },

    }),
]


export const RTE = ({name, field, value, onChange, help, ...rest}) => {

    const [showSource, setShowSource] = useState(false);
    const editor = useEditor({
        extensions,
        content: value,
        onUpdate : ({editor}) => {
            onChange?.({name: field.name, value: code(editor.getHTML())});
        }
    })
    const [delay , setDelay] = useState(setTimeout(() => {}))

    useEffect(() => {
        editor.commands.setContent(value);
        setShowSource(false);
        onChange?.({name: field.name, value: code(editor.getHTML())});
    }, [name]);

    return (
        <>
            {help &&<div className="flex help">{help}</div>}
        <div className="rte">
            <MenuBar editor={editor} showSource={showSource} setShowSource={setShowSource} onChange={onChange} field={field} />
            <EditorContent {...rest} editor={editor} defaultValue={value} value={value}  />
            </div>
        </>
    )
}