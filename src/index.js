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

const OBJECT = 'object';
const SYMBOL = 'symbol';
const BIGINT = 'bigint';

const { assign, keys } = Object;
const { isArray } = Array;
const { parse, stringify } = JSON;

/**
 * @param {unknown} value
 * @returns {value is object}
 */
const isObject = value => value !== null && typeof value === 'object';

/**
 * @param {Map<unknown, unknown>} cache
 * @param {unknown} ref
 * @param {string} key
 * @param {unknown} value
 * @returns {{[key:string]: unknown}}
 */
const wrap = (cache, ref, key, value) => {
  const obj = { [key]: value };
  cache.set(ref, obj);
  cache.set(value, null);
  cache.set(obj, obj);
  return obj;
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
 * @param {Map<string, JSONRecord<any>>} registry
 * @returns {Transformer}
 */
const replace = (stringify, replacer, registry) => function (key, value) {
  if (key === '' || key === OBJECT || registry.has(key) || isArray(this) || replacer.includes(key)) return stringify(key, value);
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
    const valid = typeof key === 'string' && key !== '' && key !== OBJECT;
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
            return _parse.call(this, key, reviver.apply(this, arguments));
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
            replace(_stringify, replacer.map(String), registry) :
            _stringify
          ),
        space,
      ),

      /** @type {JSONRegistryInstance['recursive']} */
      recursive: ({ parse, stringify }) => ({
        /** @type {(text:string) => any} */
        parse: text => registry.size ?
          run(parse, text, _parse) :
          // @ts-ignore
          parse(text)
        ,

        /** @type {(value: any, space?: string | number) => string} */
        stringify: (value, space) => registry.size ?
          run(stringify, value, _stringify, space) :
          // @ts-ignore
          stringify(value, space)
        ,
      }),
    },
  );

  /**
   * @this {any}
   * @param {string} key
   * @param {unknown} ref
   * @returns {unknown}
   */
  function _parse(key, ref) {
    /** @type {string} */
    let tag = '';

    if (!cache.has(this)) {
      if (key !== '' && (key === OBJECT || registry.has(key)) && !isArray(this)) {
        const tagKeys = keys(this);
        if (tagKeys.length === 1 && tagKeys[0] === key) {
          tag = key;
        }
      }
      if (!tag) cache.set(this, null);
    }

    const value = ref;

    if (isObject(ref)) {
      const cached = /** @type {{k:string,p:json,v:unknown}|void} */(cache.get(/** @type {object} */(ref)));
      if (cached != null) {
        if (cached.v != null) return cached.v;
        switch (cached.k) {
          case OBJECT: {
            cached.v = isObject(cached.p) && !isArray(cached.p) ? cached.p : ref;
            break;
          }
          default: {
            cached.v = /** @type {JSONRecord<any>} */(registry.get(cached.k)).from(cached.p) ?? fail(`Invalid "${cached.k}" value`);
            break;
          }
        }
        ref = cached.v;
      }
    }

    if (tag) {
      cache.set(this, { k: tag, p: tag === OBJECT ? value : ref, v: null });
      return ref;
    }

    return ref;
  }

  /**
   * @this {any}
   * @param {string} _
   * @param {unknown} ref
   * @returns {unknown}
   */
  function _stringify(_, ref) {
    if (ref == null) return ref;

    const type = typeof ref;
    switch (type) {
      case OBJECT: {
        const cached = cache.get(ref);
        if (cached !== void 0) return cached || ref;

        // const cached = cache.get(/** @type {object} */(ref));
        // if (cached) return cached;

        for (const [key, { is, to }] of registry) {
          if (key !== SYMBOL && key !== BIGINT && is(ref))
            return wrap(cache, ref, key, to(ref));
        }

        return isArray(ref) ? ref : wrap(cache, ref, OBJECT, ref);
      }

      case SYMBOL:
      case BIGINT: {
        const record = registry.get(type);
        if (record?.is(ref))
          return wrap(cache, ref, type, record.to(ref));
      }

      default: return ref;
    }
  }
}
