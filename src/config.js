


const config = [];

export const Config = {
    Get: (name, defaultValue) => {
        if( config[name] === undefined ){
            return defaultValue;
        }
        return config[name];
    },
    Set: (name, value) => {
        config[name] = value;
    }
}
