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

    function isVar(variable) {
        var defs = variable.defs;
        if (defs.length > 1) {
            throw new Error("Redefinition of " + variable.name);
        }
        if (defs.length === 0) {
            return false;
        }
        return defs[0].type === "Variable"; // reject FunctionName
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
    scopes.shift();
    scopes.forEach(function(scope) {
        variables = variables.concat(scope.variables.filter(isVar).map(name));
    });

    console.log(variables);

    var withStatement = escodegen.generate({
        "type": "Program",
        "body": [
            {
                "type": "WithStatement",
                "object": {
                    "type": "Identifier",
                    "name": "__context"
                },
                "body": ast.body[0].body
            }
        ]
    });

    var context = {};
    variables.forEach(function(variable) {
        context[variable] = undefined;
    });

    var g = new Function('__context', withStatement);
    console.log(g.toString());
    g(context);

    console.log(context);
}();
