// @ts-check

/**
 * @typedef {(this: any, key: string, value: any) => any} Transformer
 *
 * @typedef {string|number|boolean|null|unknown[]|{[key:string]:unknown}} json
 *
 * @typedef {{
 *   register: (key:string, value:JSONRecord<any>) => void,
 *   parse: (text:string, reviver?:Transformer) => unknown,
 *   stringify: (value:any, replacer?:Transformer|Array<string|number>, space?:string|number) => string,
 *   recursive: (json:RecursiveJSON) => RecursiveRegistry
 * }} JSONRegistryInstance
 *
 * @typedef {{
 *   parse: (text:string, reviver:Transformer) => unknown,
 *   stringify: (value:any, replacer:Transformer, space?:string|number) => string
 * }} RecursiveJSON
 *
 * @typedef {{
 *   parse: (text:string) => unknown,
 *   stringify: (value:any, space?:string|number) => string
 * }} RecursiveRegistry
 */

/**
 * @template T
 * @typedef {{
 *   is: (item:unknown) => boolean,
 *   to: (item:T) => json,
 *   from: (item:json) => T
 * }} JSONRecord
 *
 * A record describes a closed round-trip for one logical type:
 * `from(to(value))` must return a non-nullish value of the same kind accepted
 * by `to`. During parse, nullish results throw a TypeError as invalid values.
 *
 * Symbols can be registered and transformed as values only: JSON.stringify
 * natively ignores symbol keys, so they never reach the replacer.
 */

const { assign } = Object;
const { isArray } = Array;
const { parse, stringify } = JSON;

/**
 * @param {Map<string, JSONRecord<any>>} registry
 * @param {string} type
 * @returns {JSONRecord<any>}
 */
const get = (registry, type) => {
  const record = registry.get(type);
  if (!record) fail(`Unknown JSONRegistry "${type}"`);
  return record;
};

/**
 * @template K
 * @template V
 * @param {Map<K, V>} cache
 * @param {K} ref
 * @param {V} value
 * @returns {V}
 */
const set = (cache, ref, value) => {
  cache.set(ref, value);
  return value;
};

/**
 * @param {string} message
 * @returns {never}
 */
const fail = message => {
  throw new TypeError(message);
};

/**
 * @param {Transformer} stringify
 * @param {string[]} replacer
 * @returns {Transformer}
 */
const replace = (stringify, replacer) => function (key, value) {
  if (key === '' || isArray(this) || replacer.includes(key)) return stringify(key, value);
};

/**
 * @param {Iterable<[string, JSONRecord<any>]>} [iterable]
 * @this {JSONRegistryInstance | void}
 * @returns {JSONRegistryInstance}
 */
export default function JSONRegistry(iterable = []) {
  /** @type {Map<string, JSONRecord<any>>} */
  const registry = new Map;

  /** @type {(key:string, value:JSONRecord<any>) => void} */
  const register = (key, { is, to, from }) => {
    const valid = typeof key === 'string';
    const known = valid && registry.has(key);

    if (!valid || known)
      fail(`${known ? 'Duplicated' : 'Invalid'} "${String(key)}" key`);

    registry.set(key, { is, to, from });
  };

  for (const [key, value] of iterable) register(key, value);

  /** @type {Map<object, unknown>} */
  const cache = new Map;

  /**
   * @param {(...args:any[]) => any} callback
   * @param {...any} args
   * @returns {any}
   */
  const run = (callback, ...args) => {
    try { return callback(...args) }
    finally { cache.clear() }
  };

  return assign(
    // allow both new JSONRegistry and JSONRegistry()
    /** @type {JSONRegistryInstance} */(this) || {},
    {
      register,

      /** @type {JSONRegistryInstance['parse']} */
      parse: (text, reviver) => run(
        parse,
        text,
        typeof reviver === 'function' ?
          /**
           * @this {any}
           * @param {string} key
           * @returns {unknown}
           */
          function (key) {
            // @ts-ignore
            return _parse(key, reviver.apply(this, arguments));
          } :
          _parse
        ,
      ),

      /** @type {JSONRegistryInstance['stringify']} */
      stringify: (value, replacer, space) => run(
        stringify,
        value,
        typeof replacer === 'function' ?
          /**
           * @this {any}
           * @param {string} key
           * @returns {unknown}
           */
          function (key) {
            // @ts-ignore
            return _stringify(key, replacer.apply(this, arguments));
          } :
          (isArray(replacer) ?
            replace(_stringify, replacer.map(String)) :
            _stringify
          ),
        space,
      ),

      /** @type {JSONRegistryInstance['recursive']} */
      recursive: ({ parse, stringify }) => ({
        /** @type {(text:string) => any} */
        parse: text => run(parse, text, _parse),

        /** @type {(value: any, space?: string | number) => string} */
        stringify: (value, space) => run(stringify, value, _stringify, space),
      }),
    },
  );

  /**
   * @this {any}
   * @param {string} _
   * @param {unknown} ref
   * @returns {unknown}
   */
  function _parse(_, ref) {
    if (ref === null || typeof ref !== 'object') return ref;

    const cached = cache.get(ref);
    if (cached != null) return cached;

    if (isArray(ref)) {
      const k = ref.pop();
      if (k !== 0) {
        const v = get(registry, k).from(ref[0]);
        if (v == null) fail(`Invalid "${k}" value`);
        return set(cache, ref, v);
      }
    }

    return set(cache, ref, ref);
  }

  /**
   * @this {any}
   * @param {string} _
   * @param {unknown} ref
   * @returns {unknown}
   */
  function _stringify(_, ref) {
    if (ref === null) return ref;

    const type = typeof ref;
    switch (type) {
      case 'object': {
        const cached = cache.get(/** @type {object} */(ref));
        if (cached) return cached;
        for (const [key, { is, to }] of registry)
          if (is(ref)) return set(cache, /** @type {object} */(ref), [to(ref), key]);
        // @ts-ignore
        return set(cache, ref, isArray(ref) ? [].concat(ref, 0) : ref);
      }

      case 'symbol':
      case 'bigint':
        return registry.has(type) ?
          [get(registry, type).to(ref), type] :
          ref
        ;

      default: return ref;
    }
  }
}
