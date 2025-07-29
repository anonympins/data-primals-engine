import {useEffect, useRef} from "react";
import {useMutation} from "react-query";

export const useMount = (effect) => {
    const mounted = useRef(false);

    useEffect(() => {
        if (mounted.current) {
            return effect();
        }

        mounted.current = true;

        return () => {};
    }, [mounted, effect]);
};

export function useStrictModeMutation(options){

    // `hasRun` tracks if the mutation has already been executed
    const hasRun = useRef(false);

    // Setting up the mutation with React Query
    const mutation = useMutation(options);

    // Conditional mutation function to prevent double execution
    const strictModeMutate = (variables) => {
        if (!hasRun.current) {
            hasRun.current = true;
            mutation.mutate(variables);
        }
    };

    // Custom reset function to allow the mutation to be re-triggered
    const reset = () => {
        hasRun.current = false;
        mutation.reset();
    };

    // Return the mutation with `strictModeMutate` instead of `mutate`
    return { ...mutation, mutate: strictModeMutate, reset };
}