// ModelContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueries, useQuery } from 'react-query';
import {elementsPerPage} from "data-primals-engine/constants";
import {getObjectHash} from "data-primals-engine/core"; // Assurez-vous que le chemin est correct

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [me, setMe] = useState(null);


    const contextValue = {
        me,
        setMe
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === null) {
        throw new Error('useAuthContext doit être utilisé dans un AuthProvider');
    }
    return context;
};