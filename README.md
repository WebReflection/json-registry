# JSONRegistry

[![Coverage Status](https://coveralls.io/repos/github/WebReflection/json-registry/badge.svg?branch=main)](https://coveralls.io/github/WebReflection/json-registry?branch=main)


- - -

⚠️ **highly experimental** and discussed as [ECMAScript proposal](https://es.discourse.group/t/jsonregistry-allows-branded-instances-in-regular-json/2569)

- - -

A registry for teaching `JSON.stringify()` and `JSON.parse()` how to
round-trip application-specific values.

JSON already supports replacers and revivers, but coordinating them across a
project quickly becomes repetitive: every custom type needs a stable tag, a
predicate, a serializer, and a parser. `json-registry` keeps those rules in one
place and applies them consistently.

## Why

Plain JSON has no representation for values such as typed arrays, class
instances, `bigint`, or `symbol`. Those values are either lost, rejected, or
turned into plain objects unless the caller provides custom logic.

`JSONRegistry` solves that by encoding registered values as tagged JSON payloads
and restoring them during parsing:

```js
import JSONRegistry from 'json-registry';

class Test {
  constructor(value) {
    this.value = value;
  }
}

const { parse, stringify } = new JSONRegistry([
  ['Uint8Array', {
    is: value => value instanceof Uint8Array,
    to: value => Array.from(value),
    from: value => Uint8Array.from(value),
  }],
  ['Test', {
    is: value => value instanceof Test,
    to: value => ({ value: value.value }),
    from: value => new Test(value.value),
  }],
]);

const text = stringify({
  bytes: new TextEncoder().encode('hello'),
  test: new Test('ok'),
});

parse(text).bytes instanceof Uint8Array; // true
parse(text).test instanceof Test;        // true
```

## Encoding Strategy

Registered values are encoded as single-key objects whose key is the registry
name:

```js
stringify(123n); // {"bigint":"123"} when bigint is registered
```

Plain non-array objects are also wrapped, using the reserved `object` key:

```js
stringify({ a: [] }); // {"object":{"a":[]}}
```

Arrays are not wrapped. They remain regular JSON arrays and are used only as
containers for values that may themselves be registered or plain object wrappers.
This keeps array traversal native to the underlying JSON implementation:

```js
stringify([{}, []]); // [{"object":{}},[]]
```

During parsing, wrappers are restored through the native bottom-up reviver flow.
A single-key object is treated as a wrapper only when that key is `object` or a
registered name and the surrounding parse context confirms it is a payload
carrier. This lets plain data such as `{ object: [1, 2, 3] }` or
`{ bigint: "123" }` round-trip without being mistaken for tagged values.

Each registry entry is a tuple of `[name, record]`, where `record` contains:

- `is(value)`: returns `true` when the value should use this record.
- `to(value)`: converts the value into JSON-compatible data.
- `from(value)`: restores the value from the JSON-compatible data.

Registry names must be unique strings.

## API

```js
const registry = new JSONRegistry(entries);
```

The constructor can also be called as a function. It returns an object with:

- `register(name, record)`: add another record after creation.
- `stringify(value, replacer, space)`: like `JSON.stringify()`, with registry
  support.
- `parse(text, reviver)`: like `JSON.parse()`, with registry support.
- `recursive(json)`: adapt another JSON-compatible implementation, such as
  [flatted](https://www.npmjs.com/package/flatted), so registered values and circular references can be handled
  together.

## Recursive JSON

`recursive({ parse, stringify })` accepts an object with `parse(text, reviver)` and
`stringify(value, replacer, space)` methods:

```js
import * as flatted from 'flatted';
import JSONRegistry from 'json-registry';

class Item {
  constructor(value) {
    this.value = value;
  }
}

const registry = new JSONRegistry([
  ['Item', {
    is: value => value instanceof Item,
    to: value => value.value,
    from: value => new Item(value),
  }],
]);

const recursive = registry.recursive(flatted);

const value = { item: new Item('ok') };
value.self = value;
value.list = [value, value.item];

const text = recursive.stringify(value);
const copy = recursive.parse(text);

copy.self === copy;       // true
copy.list[0] === copy;    // true
copy.item instanceof Item; // true
copy.list[1] instanceof Item; // true
```

## About JSON limitations

- `toJSON()` runs before replacers. If a value defines `toJSON()`,
  `JSON.stringify()` passes the result of `toJSON()` to the registry, not the
  original value. Remove or account for `toJSON()` when a registered type must
  be preserved exactly.
- Symbol keys are ignored by `JSON.stringify()` itself, so they never reach the
  replacer and cannot be preserved as object keys. Symbols can still be
  registered and transformed when they appear as values.
- Registered `from(value)` functions must return a non-nullish value. Returning
  `null` or `undefined` is treated as an invalid tagged value and throws a
  `TypeError`.
- Registry tags are stored in the JSON payload. When parsing data from outside
  your application, keep `from(value)` functions strict: validate the payload
  shape and throw when it does not match the expected type.
- `object` is reserved for plain object wrappers and cannot be used as a
  registry name. Arrays are never registry wrappers.
