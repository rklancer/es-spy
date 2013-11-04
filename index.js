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
        // We need to generate an empty node!
        var ret = {
            type:'SequenceExpression',
            expressions: []
        };

        setInfo(ret, {
            reference: {
                identifier: e.name
            }
        });
        return ret;
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
        subexpressions.push(e.object);

        var baseValue = getValue(e.object);
        var baseIdentifier = getInfo(baseValue).reference.value;

        subexpressions.push(baseValue);

        var propertyNameValue;
        var propertyNameIdentifier;
        if (e.computed) {
            subexpressions.push(e.property);
            propertyNameValue = coerceToString(getValue(e.property));
            subexpressions.push(propertyNameValue);
            propertyNameIdentifier = getInfo(propertyNameValue).reference.value;
        } else {
            propertyNameIdentifier = getInfo(e.property).reference.identifier;
        }

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
        //  The production CallExpression : MemberExpression Arguments is evaluated as follows:
        //
        // Let ref be the result of evaluating MemberExpression.
        // Let func be GetValue(ref).
        // Let argList be the result of evaluating Arguments, producing an internal list of argument values (see 11.2.4).
        // If Type(func) is not Object, throw a TypeError exception.
        // If IsCallable(func) is false, throw a TypeError exception.
        // If Type(ref) is Reference, then
        // If IsPropertyReference(ref) is true, then
        // Let thisValue be GetBase(ref).
        // Else, the base of ref is an Environment Record
        // Let thisValue be the result of calling the ImplicitThisValue concrete method of GetBase(ref).
        // Else, Type(ref) is not Reference.
        // Let thisValue be undefined.
        // Return the result of calling the [[Call]] internal method on func, providing thisValue as the this value and providing the list argList as the argument values.
        // The production CallExpression : CallExpression Arguments is evaluated in exactly the same manner, except that the contained CallExpression is evaluated in step 1.

        var subexpressions = [];
        var ret = {
            type: 'SequenceExpression',
            expressions: subexpressions
        };

        var ref = e.callee;
        subexpressions.push(ref);

        var func = getValue(ref);
        var funcIdentifier = getInfo(func).reference.value;
        subexpressions.push(func);

        var argValues = [];
        e.arguments.forEach(function(arg) {
            var argVal;
            subexpressions.push(arg);
            argVal = getValue(arg);
            subexpressions.push(argVal);
            argValues.push({
                type: 'Identifier',
                name: getInfo(argVal).reference.value
            });
        });

        var refReference = getInfo(ref).reference;
        var assignment;
        var valueVar;

        subexpressions.push(assignment = {
            type: 'AssignmentExpression',
            operator: '=',
            left: {
                type: 'Identifier',
                name: valueVar = '_' + (++count)
            }
        });

        if ( refReference.baseValue ) {
            // a.f() => (_1 = a, _2 = a.f), _3 = _2.call(_1)
            assignment.right = {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    computed: false,
                    object: {
                        type: 'Identifier',
                        name: funcIdentifier
                    },
                    property: {
                        type: 'Identifier',
                        name: 'call'
                    }
                },
                arguments: [{
                    type: 'Identifier',
                    name: refReference.baseValue
                }].concat(argValues)
            };
        } else if ( refReference.identifier ) {
            // f() => _1 = f, _2 = _1()
            assignment.right = {
                type: 'CallExpression',
                callee: {
                    type: 'Identifier',
                    name: funcIdentifier
                },
                arguments: argValues
            };
        } else if (refReference.value) {
            // f()() => (_1 = f, _2 = _1()), _3 = _2.call()
            // Need to set 'this' to undefined.
            // This matters if the called function is strict mode
            // See this handy explanation in addition to spec: http://stackoverflow.com/a/4295955

            // a.f() => (_1 = a, _2 = a.f), _3 = _2.call(_1)
            assignment.right = {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    computed: false,
                    object: {
                        type: 'Identifier',
                        name: funcIdentifier
                    },
                    property: {
                        type: 'Identifier',
                        name: 'call'
                    }
                },
                arguments: [{
                    type: 'Identifier',
                    name: 'undefined'
                }].concat(argValues)
            };
        }

        // CallExpresion always returns a Value (except for host objects, which we will NOT support)
        setInfo(ret, {
            reference: {
                value: valueVar
            }
        });

        return ret;
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

var example = "a(b);";
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
        var expression;

        if (skip) {
            // Expressions may return references. Assume that here (for example, in an ExpressionStatement)
            // that we want the value;

            expression = handleExpression(node);
            ret = {
                type: 'SequenceExpression',
                expressions: [
                    expression,
                    getValue(expression)
                ]
            };
            console.log("---------------------\n");
            skip = false;
        }

        console.log("leaving  ", node.type);
        return ret;
    }
});

console.log("\n" + escodegen.generate(ast));
