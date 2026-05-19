import * as flatted from 'flatted';
import JSONRegistry from '../src/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

};

const assertThrows = (callback, message) => {
  try {
    callback();
  }
  catch (error) {
    return;
  }

  throw new Error(message);
};

new JSONRegistry().parse('{"object":{}}');

assert(
  new JSONRegistry().stringify([]) === '[]',
  'arrays should be untouched',
);

assert(
  Array.isArray(new JSONRegistry().parse('[]')),
  'arrays should parse untouched',
);

assert(
  new JSONRegistry().stringify({}) === '{"object":{}}',
  'objects should be untocuhed yet wrapped',
);

class Test {
  constructor(value) {
    this.value = value;
  }
}

const { parse, stringify, recursive } = new JSONRegistry([
  ['Uint8Array', {
    is: (item) => item instanceof Uint8Array,
    to: (item) => Array.from(item),
    from: (item) => Uint8Array.from(item),
  }],
  ['Test', {
    is: item => item instanceof Test,
    to: item => (new TextEncoder).encode(item.value),
    from: item => new Test((new TextDecoder).decode(item)),
  }]
]);

let parsed, stringified = stringify(new Uint8Array([1,2]));

assert(
  stringified === '{"Uint8Array":[1,2]}',
  'registered types are wrapped and preserved',
);

parsed = parse(stringified);

assert(
  parsed instanceof Uint8Array && parsed.length === 2 && parsed[0] === 1 && parsed[1] === 2,
  'registered types are restored',
);

stringified = stringify({a:true});

assert(
  stringified === '{"object":{"a":true}}',
  'unregistered types are wrapped and preserved',
);

parsed = parse(stringified);

assert(
  parsed.a === true,
  'unregistered types are restored',
);

parsed = parse('{"object":[1,2,3]}');

assert(
  parsed.object.length === 3 && parsed.object[0] === 1 && parsed.object[2] === 3,
  'object keys with array values should not be unwrapped',
);

parsed = parse('{"object":{},"x":1}');

assert(
  parsed.object && parsed.x === 1,
  'multi-key objects should not be treated as wrappers',
);

stringified = stringify({ object: [1, 2, 3] });

assert(
  stringified === '{"object":{"object":[1,2,3]}}',
  'object keys with array values should be preserved when stringified',
);

parsed = parse(stringified);

assert(
  parsed.object.length === 3 && parsed.object[1] === 2,
  'object keys with array values should round trip',
);

assertThrows(
  () => new JSONRegistry([['object', {
    is: () => false,
    to: item => item,
    from: item => item,
  }]]),
  'reserved object key should be rejected',
);

assertThrows(
  () => new JSONRegistry([
    ['Duplicate', {
      is: () => false,
      to: item => item,
      from: item => item,
    }],
    ['Duplicate', {
      is: () => false,
      to: item => item,
      from: item => item,
    }],
  ]),
  'duplicate keys should be rejected',
);

assertThrows(
  () => new JSONRegistry([['Invalid', {
    is: () => false,
    to: item => item,
    from: () => null,
  }]]).parse('{"Invalid":1}'),
  'invalid registered values should throw',
);

stringified = stringify({
  keep: true,
  skip: false,
  values: [1, 2],
}, ['keep', 'values']);

parsed = parse(stringified);

assert(
  parsed.keep === true &&
  !('skip' in parsed) &&
  parsed.values[0] === 1 &&
  parsed.values[1] === 2,
  'array replacer should preserve listed keys and array values',
);

stringified = stringify({
  hello: 'reviver',
  ignored: true,
}, (key, value) => key === 'ignored' ? undefined : value);

parsed = parse(stringified, (key, value) => key === 'hello' ? value : value);

assert(
  parsed.hello === 'reviver' && !('ignored' in parsed),
  'custom replacer and reviver should be used',
);

const arr = [];
arr.push(arr);

stringified = recursive(flatted).stringify([arr, arr]);
parsed = recursive(flatted).parse(stringified);

assert(
  parsed[0] === parsed[1] && parsed[0][0] === parsed[0],
  'circular references should be preserved',
);

const selfArray = [];
selfArray.push(selfArray, selfArray);

stringified = recursive(flatted).stringify(selfArray);
parsed = recursive(flatted).parse(stringified);

assert(
  parsed[0] === parsed && parsed[1] === parsed,
  'self-referencing arrays should preserve repeated self references',
);

const selfObject = {};
selfObject.self = selfObject;
selfObject.again = selfObject;

stringified = recursive(flatted).stringify(selfObject);
parsed = recursive(flatted).parse(stringified);

assert(
  parsed.self === parsed && parsed.again === parsed,
  'self-referencing objects should preserve repeated self references',
);

class RecursiveValue {
  constructor(value) {
    this.value = value;
  }
}

const recursiveRegistry = new JSONRegistry([['RecursiveValue', {
  is: item => item instanceof RecursiveValue,
  to: item => item.value,
  from: item => new RecursiveValue(item),
}]]).recursive(flatted);

const recursiveObject = { item: new RecursiveValue('recursive') };
recursiveObject.self = recursiveObject;
recursiveObject.list = [recursiveObject, recursiveObject.item];

stringified = recursiveRegistry.stringify(recursiveObject);
parsed = recursiveRegistry.parse(stringified);

assert(
  parsed.self === parsed &&
  parsed.list[0] === parsed &&
  parsed.item instanceof RecursiveValue &&
  parsed.item.value === 'recursive' &&
  parsed.list[1] instanceof RecursiveValue &&
  parsed.list[1].value === 'recursive',
  'recursive objects should preserve cycles and registered values',
);

const empty = JSONRegistry().recursive(flatted);

stringified = empty.stringify([1]);
parsed = empty.parse(stringified);

assert(
  parsed[0] === 1,
  'empty recursive registry should delegate unchanged',
);

class Cached {
  constructor(value) {
    this.value = value;
  }
}

const cached = new JSONRegistry([['Cached', {
  is: item => item instanceof Cached,
  to: item => item.value,
  from: item => new Cached(item),
}]]).recursive({
  parse: (_, reviver) => {
    const wrapper = { Cached: 'shared' };
    wrapper.Cached = reviver.call(wrapper, 'Cached', wrapper.Cached);
    const holder = [];
    holder[0] = reviver.call(holder, '0', wrapper);
    holder[1] = reviver.call(holder, '1', wrapper);
    return holder;
  },
  stringify: () => '',
});

parsed = cached.parse('');

assert(
  parsed[0] === parsed[1] && parsed[0] instanceof Cached && parsed[0].value === 'shared',
  'cached recursive wrappers should be restored once',
);

const primitives = new JSONRegistry([
  ['bigint', {
    is: item => typeof item === 'bigint',
    to: item => item.toString(),
    from: item => BigInt(item),
  }],
  ['symbol', {
    is: item => typeof item === 'symbol',
    to: item => Symbol.keyFor(item),
    from: item => Symbol.for(item),
  }],
]);

stringified = primitives.stringify({
  a: [],
  o: {},
  b: 0n,
  s: Symbol.for('registered'),
  object: [1]
});

parsed = primitives.parse(stringified);

assert(
  parsed.b === 0n && parsed.s === Symbol.for('registered'),
  'registered primitive values should round trip',
);

try { document.body.append('OK') }
catch (em_all) {}
