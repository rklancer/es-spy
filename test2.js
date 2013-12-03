'use strict';
/* global Proxy, Reflect, WeakMap */

// Proof-of-concept for verify side effects of expressions. Use to create test helpers that check
// equivalence of the side effects of original and transformed (spied) code.

// TODO: Deal with possible strict mode in test function:
//   1. Preserve directive statements; right now we hoist function declarations above the 
//      "use strict" directive, disabling it.
//   2. Convert all var statements to assignmentExpression form ... var statements inside the
//      test function become part of the inner scope instead of referring to the outer "with" scope
//   3. Decide what to do about undeclared variable in the test function ... this is especially
//      important because escope doesn't find any "implicit globals" if the test function is strict;
//      also, you might want to test side effects of code that aborts due to a reference error.
//   4. (other context creating cases: catch blocks?
// 
// TODO: Observe function invocation as well; may want to do this after converting this to a proper
// test helper.

require('harmony-reflect');
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var escope = require('escope');

function f() {
    a = {};
    b = 0;

    g();
    g.toString();

    function g() {
        a[b++] = 0;
        a[a[0]] = 1;
    }
}

function hoist(node) {
    var name = node.id.name;

    return {
        "type": "ExpressionStatement",
        "expression": {
            "type": "AssignmentExpression",
            "operator": "=",
            "left": {
                "type": "Identifier",
                "name": name
            },
            "right": {
                "type": "FunctionExpression",
                "id": {
                    "type": "Identifier",
                    "name": name
                },
                "params": [],
                "defaults": [],
                "body": node.body,
                "rest": null,
                "generator": false,
                "expression": false
            }
        }
    };
}

function isVariable(variable) {
    var defs = variable.defs;
    if (defs.length > 1) {
        throw new Error("Redefinition of " + variable.name);
    }
    return defs.length > 0 && defs[0].type === 'Variable';
}

function isFunctionName(variable) {
    var defs = variable.defs;
    if (defs.length > 1) {
        throw new Error("Redefinition of " + variable.name);
    }
    return defs.length > 0 && defs[0].type === 'FunctionName';
}

function name(variable) {
    return variable.name;
}

var ast = esprima.parse(f.toString());
var scopes = escope.analyze(ast).scopes;
var variables = scopes[0].implicit.variables.map(name).concat(scopes[1].variables.filter(isVariable).map(name)).concat('arguments');
var functionDeclarations = new Set();
var foundVariables = new Set();
variables.forEach(foundVariables.add.bind(foundVariables));
scopes[1].variables.filter(isFunctionName).forEach(function(functionName) {
    // could map, and create set from array. But construction from an array doesn't seem to work
    // in node --harmony yet.
    functionDeclarations.add(functionName.defs[0].node);

    var actualName = name(functionName);
    if (foundVariables.has(actualName)) {
        throw new Error("Redefinition of " + actualName);
    }
    variables.push(actualName);
});

var hoistedFunctions = [];
ast = estraverse.replace(ast, {
    enter: function(node) {
        if (node.type && node.type === 'BlockStatement') {
            var ret = {
                type: 'BlockStatement',
                body: node.body.filter(function(statement) {
                    var isFunctionDeclaration = functionDeclarations.has(statement);
                    if (isFunctionDeclaration) {
                        hoistedFunctions.push(hoist(statement));
                    }
                    return !isFunctionDeclaration;
                })
            };
            return ret;
        }
    }
});

var withStatementWrapper = {
    "type": "WithStatement",
    "object": {
        "type": "Identifier",
        "name": "__context"
    },
    "body": {
        "type": "BlockStatement",
        "body": [
            {
                "type": "ReturnStatement",
                "argument": {
                    "type": "FunctionExpression",
                    "id": null,
                    "params": [],
                    "defaults": [],
                    "body": {
                        "type": "BlockStatement",
                        "body": hoistedFunctions.concat(ast.body[0].body.body)
                    },
                    "rest": null,
                    "generator": false,
                    "expression": false
                }
            }
        ]
    }
};


function spy(trap, target, name, value) {
    var printableName, printableValue;

    if (target === context) {
        printableName = name;
    } else {
        printableName = "(object)['" + name + "']";
    }

    if (trap === 'get') {
        console.log("get " + printableName);
    } else if (trap === 'set') {
        if (typeof value === 'function') {
            printableValue = "(function)";
        } else if (typeof value === 'object' && value !== null) {
            printableValue = "(object)";
        } else {
            printableValue = value;
        }

        console.log("set " + printableName + " to " + printableValue);
    }
}


function isPrimitive(value) {
    return (typeof value !== 'function' && typeof value !== 'object') || value === null;
}

var wrap = (function() {
    var proxiedValues = new WeakMap();

    return function(obj) {
        // Don't wrap primitive values
        if (isPrimitive(obj)) {
            return obj;
        }

        return new Proxy(obj, {
            get: function(target, name) {
                spy('get', target, name);
                return Reflect.get(target, name);
            },

            set: function(target, name, value) {
                // only wrap objects
                if (!isPrimitive(value) && !proxiedValues.has(value)) {
                    value = proxiedValues[value] = wrap(value);
                }
                spy('set', target, name, value);
                Reflect.set(target, name, value);
            }
        });
    };
}());

var context = Object.create(null);
var values = Object.create(null);

// Can't use proxy wrapper for the with-context because with doesn't work properly with proxies
variables.forEach(function(variable) {
    Object.defineProperty(context, variable, {
        get: function() {
            spy('get', context, variable);
            return values[variable];
        },
        set: function(value) {
            spy('set', context, variable, value);
            values[variable] = wrap(value);
        }
    });
    values[variable] = undefined;
});

var code = escodegen.generate(withStatementWrapper);
var g = new Function('__context', code)(context);
g();
