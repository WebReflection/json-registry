import * as flatted from 'https://esm.run/flatted';
import JSONRegistry from '../src/index.js';

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
    is: (item) => item instanceof Test,
    to: (item) => ({ value: item.value }),
    from: ({ value }) => new Test(value),
  }]
]);

let result = stringify({
  hello: (new TextEncoder).encode('world'),
  test: new Test('test'),
  fn() {},
});

console.log({ stringify: result });
console.log({ parse: parse(result) });

debugger;
const arr = [];
arr.push(arr);
result = recursive(flatted).stringify([arr, arr]);
console.log(result);
console.log(recursive(flatted).parse(result));
