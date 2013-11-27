// Crude first cut creating an object capable of detecting assignments
!function() {
    'use strict';

    function f() {
        x = 10;
        var y = 20;
        function g() {
            x = 1;
            console.log("g(): x is ", x);
        }
        var h = function() {
            y = 2;
        };
        g();
        console.log("after g(): x is ", x);
        h();
    }

    function hoist(node) {
        var name = node.id.name;

        return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": name
                    },
                    "init": {
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
            ],
            "kind": "var"
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

    var esprima = require('esprima');
    var escodegen = require('escodegen');
    var estraverse = require('estraverse');

    var escope = require('escope');

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

    var withStatement = {
        type: "Program",
        body: [{
            "type": "WithStatement",
            "object": {
                "type": "Identifier",
                "name": "__context"
            },
            "body": {
                type: "BlockStatement",
                body: hoistedFunctions.concat(ast.body[0].body.body)
            }
        }]
    };

    var context = {};
    var values = {};

    variables.forEach(function(variable) {
        Object.defineProperty(context, variable, {
            get: function() {
                console.log("read " + variable);
                return values[variable];
            },
            set: function(value) {
                console.log("write " + value + " to " + variable);
                values[variable] = value;
            }
        });
        values[variable] = undefined;
    });

    var g = new Function('__context', escodegen.generate(withStatement));
    g(context);
}();
