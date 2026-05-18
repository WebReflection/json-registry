/**
 * @param {Iterable<[string, JSONRecord<any>]>} [iterable]
 * @this {JSONRegistryInstance | void}
 * @returns {JSONRegistryInstance}
 */
export default function JSONRegistry(this: void | JSONRegistryInstance, iterable?: Iterable<[string, JSONRecord<any>]>): JSONRegistryInstance;
export type Transformer = (this: any, key: string, value: any) => any;
export type json = string | number | boolean | null | unknown[] | {
    [key: string]: unknown;
};
export type JSONRegistryInstance = {
    register: (key: string, value: JSONRecord<any>) => void;
    parse: (text: string, reviver?: Transformer) => unknown;
    stringify: (value: any, replacer?: Transformer | Array<string | number>, space?: string | number) => string;
    recursive: (json: RecursiveJSON) => RecursiveRegistry;
};
export type RecursiveJSON = {
    parse: (text: string, reviver: Transformer) => unknown;
    stringify: (value: any, replacer: Transformer, space?: string | number) => string;
};
export type RecursiveRegistry = {
    parse: (text: string) => unknown;
    stringify: (value: any, space?: string | number) => string;
};
/**
 * A record describes a closed round-trip for one logical type:
 * `from(to(value))` must return a non-nullish value of the same kind accepted
 * by `to`. During parse, nullish results throw a TypeError as invalid values.
 *
 * Symbols can be registered and transformed as values only: JSON.stringify
 * natively ignores symbol keys, so they never reach the replacer.
 */
export type JSONRecord<T> = {
    is: (item: unknown) => boolean;
    to: (item: T) => json;
    from: (item: json) => T;
};
