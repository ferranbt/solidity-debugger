
export type Case = {
    name: string,
    send: any[],
    trace: any[],
    source: string,
}

export const cases: Case[] = [
    {
        name: "For loop",
        send: ['set', 2],
        trace: [
            [4, 'Function'], 
            [5, 'Line'],
            [6, 'Line'],
            [7, 'Line'],
            [6, 'Line'],
            [7, 'Line'],
            [6, 'Line'],
            [4, 'Return']
        ],
        source: `pragma solidity ^0.4.22;

contract Sample {
    function set(int n) {
        int o = 0;
        for (int i=0; i<n; i++) {
            o = i + 1;
        }
    }
}
`,
    },
    {
        name: "Single function call",
        send: ['set', 2],
        trace: [
            [8, 'Function'],
            [9, 'Jump'],
            [5, 'Function'],
            [6, 'Line'],
            [5, 'Return'],
            [9, 'Line'],
            [8, 'Return'],
        ],
        source: `pragma solidity ^0.4.22;

contract Sample {
    int i;
    function other(int n) {
        i = n;
    }
    function set(int n) {
        other(n);
    }
}
`
    },
    {
        name: "Multiple function calls in inheritance",
        send: ['set', 2],
        trace: [
            [13, 'Function'],
            [14, 'Jump'],
            [10, 'Function'],
            [11, 'Jump'],
            [4, 'Function'],
            [5, 'Line'],
            [4, 'Return'],
            [11, 'Line'],
            [10, 'Return'],
            [14, 'Line'],
            [13, 'Return'],
        ],
        source: `pragma solidity ^0.4.22;
contract Other {
    int i;
    function xx(int n) {        // 4
        i = n;                  // 5
    }
}

contract Sample is Other {
    function other(int n) {     // 10
        xx(n);                  // 11
    }
    function set(int n) {       // 13
        other(n);               // 14
    }
}
`
    },
    {
        name: "Multiple function calls",
        send: ['set', 2],
        trace: [
            [18, 'Function'],
            [19, 'Jump'],
            [15, 'Function'],
            [16, 'Call'],
            [4, 'Function'],
            [5, 'Line'],
            [4, 'Return'],
            [16, 'Line'],
            [15, 'Return'],
            [19, 'Line'],
            [18, 'Return'],
        ],
        source: `pragma solidity ^0.4.22;
contract Other {
    int i;
    function xx(int n) {        // 4
        i = n;                  // 5
    }
}

contract Sample {
    Other o;

    function Sample() {
        o = new Other();
    }
    function other(int n) {     // 15
        o.xx(n);                // 16
    }
    function set(int n) {       // 18
        other(n);               // 19
    }
}
`
    },
    {
        name: "Delegate calls",
        send: ['set', 2],
        trace: [
            [19, 'Function'],
            [20, 'Jump'],
            [16, 'Function'],
            [17, 'Call'],
            [5, 'Function'],
            [6, 'Line'],
            [5, 'Return'],
            [17, 'Line'],
            [16, 'Return'],
            [20, 'Line'],
            [19, 'Return'],
        ],
        source: `pragma solidity ^0.4.22;

contract A {
    int i;
    function xx(int n) {        // 5
        i = n;
    }
}

contract Sample {
    A a;

    function Sample() {
        a = new A();
    }
    function other(int n) { // 16
        a.delegatecall(bytes4(sha3("xx(int256)")), n);
    }
    function set(int n) {   // 19
        other(n);
    }
}
`
    }
]
