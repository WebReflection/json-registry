# JSONRegistry

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

const registry = new JSONRegistry([
  ['Uint8Array', {
    is: value => value instanceof Uint8Array,
    to: value => Array.from(value),
    from: value => Uint8Array.from(value),
  }],
]);

const recursive = registry.recursive(flatted);

const value = [];
value.push(value, new Uint8Array([1, 2, 3]));

const text = recursive.stringify(value);
const copy = recursive.parse(text);

copy[0] === copy;              // true
copy[1] instanceof Uint8Array; // true
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
