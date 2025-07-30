import {Children, cloneElement, isValidElement, useCallback, useRef} from "react";

const useRefs = () => {
    const refs = useRef({});

    const register = useCallback((refname) => ref => {
        refs.current[refname] = ref;
    }, []);

    return [refs, register];
}

export {useRefs};

const formatHtml = (text) => {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) {
        return map[m];
    });
}

export {formatHtml};

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
export {clamp};


export const data_paginate = (datas, page, elementsPerPage) => {
    if (elementsPerPage && page)
        return datas.slice((page - 1) * elementsPerPage, page * elementsPerPage);
    return datas;
}
export const data_filter = (datas, filter, query) => {
    // Filter data
    let filteredDatas = datas;
    if (filter) {
        filteredDatas = filteredDatas.filter(filter);
    }
    if (typeof (query) === 'string') {
        filteredDatas = filteredDatas.filter(f => {
            let inc = false;
            let keys = Object.keys(f);
            for (let i = 0; i < keys.length; ++i) {
                if (typeof (f[keys[i]]) === 'object')
                    continue;
                if ((f[keys[i]] + '').includes(query)) {
                    inc = true;
                    break;
                }
            }
            return inc;
        })
    }
    return filteredDatas;
}

const recursiveMap = (children, fn) => {
    return Children.map(children, (child, index) => {
        if (!isValidElement(child)) {
            return child;
        }

        if (child.props.children) {
            child = cloneElement(child, {
                children: recursiveMap(child.props.children, fn)
            });
        }

        return fn(child, index);
    });
}
export {recursiveMap};