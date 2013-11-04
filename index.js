/*jshint unused: false */
"use strict";
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var count = 0;

// TODO get spy info associated with an AST node. We can probably just put this in an _info
// node in the tree.
function getInfo(node) {
    return node._info;
}

function setInfo(node, info) {
    node._info = info;
}

function getValue(expression) {
    var ret;
    var reference = getInfo(expression).reference;
    var valueVar;

    if (reference.value) {
        // noop
        return expression;
    }

    ret = {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
            type: 'Identifier',
            name: valueVar = '_' + (++count)
        }
    };

    if (reference.identifier) {
        ret.right = {
            type: 'Identifier',
            name: reference.identifier
        };
    } else if (reference.baseValue) {
        ret.right = {
            type: "MemberExpression",
            computed: reference.computed,
            object: {
                type: 'Identifier',
                name: reference.baseValue
            },
            property: {
                type: 'Identifier',
                name: reference.propertyNameValue
            }
        };
    }

    setInfo(ret, {
        reference: {
            value: valueVar
        }
    });

    return ret;
}

function coerceToString(expression) {
    var valueVar;
    var ret = {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
            type: 'Identifier',
            name: valueVar = '_' + (++count)
        },
        right: {
            type: 'BinaryExpression',
            operator: '+',
            left: expression,
            right: {
                type: 'Literal',
                value: '',
                raw: '""'
            }
        }
    };

    setInfo(ret, {
        reference: {
            value: valueVar
        }
    });
    return ret;
}

var handlers = {
    Identifier: function(e) {
        setInfo(e, {
            reference: {
                identifier: e.name
            }
        });
        return e;
    },

    MemberExpression: function(e) {

        // Let baseReference be the result of evaluating MemberExpression.
        // Let baseValue be GetValue(baseReference).
        // Let propertyNameReference be the result of evaluating Expression.
        // Let propertyNameValue be GetValue(propertyNameReference).
        // Call CheckObjectCoercible(baseValue).
        // Let propertyNameString be ToString(propertyNameValue).
        // If the syntactic production that is being evaluated is contained in strict mode code, let strict be true, else let strict be false.
        // Return a value of type Reference whose base value is baseValue and whose referenced name is propertyNameString, and whose strict mode flag is strict.

        var subexpressions = [];
        var ret = {
            type: 'SequenceExpression',
            expressions: subexpressions
        };
        var baseValue = getValue(e.object);
        var baseIdentifier = getInfo(baseValue).reference.value;

        subexpressions.push(baseValue);

        var propertyNameValue;
        var propertyNameIdentifier;
        if (e.computed) {
            propertyNameValue = coerceToString(getValue(e.property));
            subexpressions.push(propertyNameValue);
            propertyNameIdentifier = getInfo(propertyNameValue).value;
        } else {
            propertyNameIdentifier = e.property.name;
        }

        subexpressions.push({
            type: 'MemberExpression',
            computed: e.computed,
            object: {
                type: 'Identifier',
                name: baseIdentifier
            },
            property: {
                type: 'Identifier',
                name: propertyNameIdentifier
            }
        });

        setInfo(ret, {
            reference: {
                computed: e.computed,
                baseValue: baseIdentifier,
                propertyNameValue: propertyNameIdentifier
            }
        });

        return ret;
    },

    CallExpression: function(e) {
        return e;
    },
};

function isExpression(node) {
    /*jshint -W015 */
    switch (node.type) {
        case 'CallExpression':
        case 'MemberExpression':
        case 'Identifier':
            return true;
        default:
            return false;
    }
    /*jshint +W015*/
}

function handleSubexpression(expression) {
    if (handlers[expression.type]) {
        return handlers[expression.type](expression);
    }
    // noop
    return expression;
}

function handleExpression(expression) {
    return estraverse.replace(expression, {
        enter: function(node, parent) {
            console.log("entering expression node ", node.type);
        },

        leave: function(node, parent) {
            console.log("leaving  expression node ", node.type);
            var ret = handleSubexpression(node);
            return ret;
        }
    });
}

// ====

var example = "a.c[b]";
var ast = esprima.parse(example);
var skip;
ast = estraverse.replace(ast, {
    enter: function (node, parent) {
        console.log("entering ", node.type);

        if (isExpression(node)) {
            console.log("\ntraversing expression");
            console.log("---------------------");
            skip = true;
        }
        if (skip) {
            this.skip();
        }
    },
    leave: function (node, parent) {
        var ret;

        if (skip) {
            ret = handleExpression(node);
            console.log("---------------------\n");
            skip = false;
        }

        console.log("leaving  ", node.type);
        return ret;
    }
});

console.log("\n" + escodegen.generate(ast));
