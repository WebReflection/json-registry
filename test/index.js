import * as flatted from 'flatted';
import JSONRegistry from '../src/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

};

assert(
  new JSONRegistry().stringify([]) === '[]',
  'empty registry should not modify the result',
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

const arr = [];
arr.push(arr);

stringified = recursive(flatted).stringify([arr, arr]);
assert(stringified === '[["1","1",0],["1",0]]');

parsed = recursive(flatted).parse(stringified);
assert(
  parsed[0] === parsed[1] && parsed[0][0] === parsed[1][0],
  'circular references should be preserved',
);
