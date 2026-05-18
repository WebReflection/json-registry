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

assert(
  new JSONRegistry().stringify([]) === '[0]',
  'empty registry should return [0] for arrays',
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

assertThrows(
  () => new JSONRegistry([[1, {
    is: () => false,
    to: item => item,
    from: item => item,
  }]]),
  'registry keys should be strings',
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
  'registry keys should be unique',
);

let stringified = stringify({
  hello: new Test('world'),
  fn() {},
});

// console.log(stringified);

let parsed = parse(stringified);

assert(
  parsed.hello instanceof Test && parsed.hello.value === 'world',
  'parsed value should be the same as the original',
);

stringified = stringify({
  hello: new Test('reviver'),
  ignored: true,
}, (key, value) => key === 'ignored' ? undefined : value);

parsed = parse(stringified, (key, value) => key === 'hello' ? value : value);

assert(
  parsed.hello instanceof Test && parsed.hello.value === 'reviver' && !('ignored' in parsed),
  'custom replacer and reviver should be used',
);

stringified = stringify({
  keep: new Test('array replacer'),
  skip: new Test('skip'),
  values: [new Test('array item')],
}, ['keep', 'values']);

parsed = parse(stringified);

assert(
  parsed.keep instanceof Test &&
  parsed.keep.value === 'array replacer' &&
  !('skip' in parsed) &&
  parsed.values[0] instanceof Test &&
  parsed.values[0].value === 'array item',
  'array replacer should preserve listed keys and array values',
);

assertThrows(
  () => parse('[[1,0],"Missing"]'),
  'unknown registered types should throw',
);

assertThrows(
  () => new JSONRegistry([['Invalid', {
    is: () => false,
    to: item => item,
    from: () => null,
  }]]).parse('[[1,0],"Invalid"]'),
  'invalid registered values should throw',
);

assertThrows(
  () => new JSONRegistry([['Undefined', {
    is: () => false,
    to: item => item,
    from: () => undefined,
  }]]).parse('[[1,0],"Undefined"]'),
  'undefined registered values should throw',
);

const arr = [];
arr.push(arr);

assert(stringify(null) === 'null');

stringified = recursive(flatted).stringify([arr, arr]);
assert(stringified === '[["1","1",0],["1",0]]');

parsed = recursive(flatted).parse(stringified);
assert(
  parsed[0] === parsed[1] && parsed[0][0] === parsed[1][0],
  'circular references should be preserved',
);

const empty = JSONRegistry().recursive(flatted);

stringified = empty.stringify([1]);
assert(stringified === '[[1]]');

parsed = empty.parse(stringified);
assert(parsed[0] === 1);

const primitives = new JSONRegistry([
  ['bigint', {
    is: () => false,
    to: item => item.toString(),
    from: item => BigInt(item),
  }],
  ['symbol', {
    is: () => false,
    to: item => Symbol.keyFor(item),
    from: item => Symbol.for(item),
  }],
]);

stringified = primitives.stringify({
  bigint: 123n,
  symbol: Symbol.for('registered'),
});

parsed = primitives.parse(stringified);

assert(
  parsed.bigint === 123n && parsed.symbol === Symbol.for('registered'),
  'registered primitive values should round trip',
);

assert(new JSONRegistry().stringify(Symbol()) === undefined);
assertThrows(
  () => new JSONRegistry().stringify(1n),
  'unregistered bigint values should throw',
);


try { document.body.append('OK') }
catch (em_all) {}
