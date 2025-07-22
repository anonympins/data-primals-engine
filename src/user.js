import {
    maxTotalPrivateFilesSizeFree,
    maxTotalPrivateFilesSizePremium,
    maxTotalPrivateFilesSizeStandard
} from "./constants.js";

export const getUserStorageLimit = (user) => {
    switch (user.userPlan) {
        case 'premium':
            return maxTotalPrivateFilesSizePremium;
        case 'standard':
            return maxTotalPrivateFilesSizeStandard;
        case 'free':
        default:
            return maxTotalPrivateFilesSizeFree;
    }
};
