import {getRandom} from "data-primals-engine/core";

let ports = [];
export const getUniquePort = () =>{
    let d, it=0;
    do{
        d = getRandom(10000, 20000);
        ++it;
    } while( ports.includes(d) && it < 10000);
    return d;
}