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
        //g();
        console.log("after g(): x is ", x);
        h();
    }

    function isVariable(variable) {
        var defs = variable.defs;
        if (defs.length > 1) {
            throw new Error("Redefinition of " + variable.name);
        }
        if (defs.length === 0) {
            return false;
        }
        return defs[0].type === 'Variable';
    }

    function isFunctionName(variable) {
        var defs = variable.defs;
        if (defs.length > 1) {
            throw new Error("Redefinition of " + variable.name);
        }
        if (defs.length === 0) {
            return false;
        }        
        return defs[0].type === 'FunctionName';
    }

    function name(variable) {
        return variable.name;
    }

    var esprima = require('esprima');
    var escodegen = require('escodegen');
    var escope = require('escope');

    var ast = esprima.parse(f.toString());
    var scopes = escope.analyze(ast).scopes;
    var variables = scopes[0].implicit.variables.map(name);
    var functionNames = [];
    scopes.shift();
    scopes.forEach(function(scope) {
        variables = variables.concat(scope.variables.filter(isVariable).map(name));
        functionNames = functionNames.concat(scope.variables.filter(isFunctionName).map(name));
    });


    var withStatement = {
        type: "Program",
        body: [{
            "type": "WithStatement",
            "object": {
                "type": "Identifier",
                "name": "__context"
            },
            "body": ast.body[0].body
        }]
    };

    // Doesn't work. Function bodies are hoisted outside of the with statement, meaning that 
    // semantics are broken (behavior of the block inside the with statement will be observably
    // different from behavior of the source function)
    // What we need to do is "manually" hoist any function declarations to the top of the with
    // statement. Convert
    // function f() { ... }
    // to 
    // var f = function f() { ... }
    // and move it up in the source body
    // - Also be sure to add 'f' to the __context
    // - Also, just add implicit globals and variables/functions declared in the first child scope
    //   (skip declarations found in subsequent scopes)
    // - Also, 'arguments' too!

    functionNames.forEach(function(functionName) {
        withStatement.body.unshift({
            "type": "ExpressionStatement",
            "expression": {
                "type": "AssignmentExpression",
                "operator": "=",
                "left": {
                    "type": "MemberExpression",
                    "computed": true,
                    "object": {
                        "type": "Identifier",
                        "name": "__context"
                    },
                    "property": {
                        "type": "Literal",
                        "value": functionName,
                        "raw": "'" + functionName + "'"
                    }
                },
                "right": {
                    "type": "Identifier",
                    "name": functionName
                }
            }
        });
    });

    var context = {};
    variables.forEach(function(variable) {
        context[variable] = undefined;
    });

    var g = new Function('__context', escodegen.generate(withStatement));
    console.log(g.toString());
    g(context);

    console.log(context);
}();
