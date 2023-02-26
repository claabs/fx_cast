interface TypedEvents {
    [key: string]: any;
}

/**
 * Provides a typed interface to EventTarget objects.
 */
export class TypedEventTarget<T extends TypedEvents> extends EventTarget {
    // @ts-ignore
    public addEventListener<K extends keyof T>(
        type: K,
        listener: (ev: CustomEvent<T[K]>) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        // @ts-ignore
        super.addEventListener(type as string, listener, options);
    }

    // @ts-ignore
    public removeEventListener<K extends keyof T>(
        type: K,
        listener: (ev: CustomEvent<T[K]>) => void,
        options?: boolean | EventListenerOptions
    ): void {
        // @ts-ignore
        super.removeEventListener(type, listener, options);
    }

    public dispatchEvent<K extends keyof T>(ev: CustomEvent<T[K]>): boolean {
        return super.dispatchEvent(ev);
    }
}
