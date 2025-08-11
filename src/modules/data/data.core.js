import NodeCache from "node-cache";

export const modelsCache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );

export const mongoDBWhitelist = [
    "$$NOW", "$in", "$eq", "$gt", "$gte", "$in", "$lt", "$lte", "$ne", "$nin", "$type", "$size",
    "$and", "$not", "$nor", "$or", "$regexMatch", "$find", "$elemMatch", "$filter", "$toString", "$toObjectId",
    "$concat",
    '$add', '$subtract', '$multiply', '$divide', '$mod', '$pow', "$sqrt",
    "$rand",
    "$abs", '$sin', '$cos', '$tan', '$asin', '$acos', '$atan',
    "$toDate", "$toBool", "$toString", "$toInt", "$toDouble",
    "$dateDiff", "$dateSubtract", "$dateAdd", "$dateToString",
    '$year', '$month', '$week', '$dayOfMonth', '$dayOfWeek', '$dayOfYear', '$hour', '$minute', '$second', '$millisecond'
];
export let importJobs = {};

