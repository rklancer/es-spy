/*jshint unused: false */
"use strict";
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');


// For now, hold intermediate values in variables named  _1, _2, _3, ...
var getTempVar = (function() {
    var count = 0;

    return function() {
        return '_' + (++count);
    };
}());


var statementTransformsByNodeType = {
};

// returns a node
function transformStatement(node) {
}

transformStatement.canTransform = function(node) {
    return statementTransformsByNodeType.hasOwnProperty(node.type);
};


function extendPrototypeOf(parent) {
    function F() {}
    F.prototype = parent.prototype;
    return new F();
}

// Marker type
function ExpressionResult() {
}

function Value(value, fromReference) {
    this.value = value;
    this.fromReference = fromReference;
}
Value.prototype = extendPrototypeOf(ExpressionResult);
Value.prototype.toNode = function() {
    return {
        type: 'Identifier',
        name: this.value
    };
};

function EnvironmentReference(referencedName) {
    this.referencedName = referencedName;
}
EnvironmentReference.prototype = extendPrototypeOf(ExpressionResult);
EnvironmentReference.prototype.toNode = function() {
    return {
        type: 'Identifier',
        name: this.referencedName
    };
};

function PropertyReference(baseValue, referencedName, isComputed) {
    this.baseValue = baseValue;
    this.referencedName = referencedName;
    this.isComputed = isComputed;

}
PropertyReference.prototype = extendPrototypeOf(ExpressionResult);
PropertyReference.prototype.toNode = function() {
    return {
        type: 'MemberExpression',
        computed: this.isComputed,
        object: {
            type: 'Identifier',
            name: this.baseValue
        },
        property: {
            type: 'Identifier',
            name: this.referencedName
        }
    };
};


function TransformedExpression(result, nodes) {
    this.result = result;
    this.nodes = [];
}

// Mutates the TransformedExpression to one that returns a value
TransformedExpression.prototype.getValue = function() {
    var reference;

    if (this.result instanceof Value) {
        return this;
    }
    reference = this.result;
    this.result = new Value(getTempVar(), reference);

    this.nodes.push({
        type: 'AssignmentExpression',
        operator: '=',
        left: this.result.toNode(),
        right: reference.toNode()
    });
    return this;
};

TransformedExpression.prototype.appendNodes = function(nodes) {
    for (var i = 0, len = nodes.length; i < len; i++) {
        this.nodes.push(nodes[i]);
    }
};

// Returns a single AST node corresponding the TransformedExpression. If the TransformedExpression's
// expressions array has more than one expression, they will be wrapped in a SequenceExpression
// first. This is used at the top level to turn a TransformedExpression into something that goes
// into the "expression slot" in the AST, but it can also be used by indidual expression transforms,
// such as the ternary expression transform, which need to consolidate an expression list into a
// single node.
TransformedExpression.prototype.toNode = function() {
    if (this.nodes.length === 0) {
        throw new Error("Can't convert empty node list to a single expression node");
    }
    if (this.nodes.length === 1) {
        return this.nodes[0];
    } else {
        return {
            type:'SequenceExpression',
            expressions: this.nodes
        };
    }
};

var expressionTransformsByNodeType = {
    Identifier: function(node) {
        return new TransformedExpression(new EnvironmentReference(node.name));
    },

    MemberExpression: function(node) {
        var ret = new TransformedExpression();
        var baseValue = transformExpression(node.object).getValue();
        var property;

        ret.result = new PropertyReference();
        ret.result.baseValue = baseValue.result.value;
        // TODO .appendNodesFrom(expression)
        ret.appendNodes(baseValue.nodes);

        if (node.computed) {
            ret.result.isComputed = true;
            property = transformExpression(node.property).getValue();
            ret.appendNodes(property.nodes);
            ret.result.referencedName = getTempVar();

            // TODO helpers for creating such assignments
            ret.nodes.push({
                type: 'AssignmentExpression',
                operator: '=',
                left: {
                    type: 'Identifier',
                    name: ret.result.referencedName
                },
                right: {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: {
                        type: 'Literal',
                        value: '',
                        raw: '""'
                    },
                    right: property.result.value
                }
            });
        } else {
            ret.result.isComputed = false;
            ret.result.referencedName = node.property.name;
        }

        return ret;
    }
};

/*jshint -W003*/
// Returns a TransformedExpression
function transformExpression(node) {
    return expressionTransformsByNodeType[node.type](node);
}

transformExpression.canTransform = function(node) {
    return expressionTransformsByNodeType.hasOwnProperty(node.type);
};
/*jshint +W003*/

var nodeTypesToTraverse = {
    Program: true,
    ExpressionStatement: true
};

// ====

var example = "a.b";
var ast = esprima.parse(example);

ast = estraverse.replace(ast, {
    enter: function (node, parent) {
        var expression;

        // Is this a statement we have to handle specially? (ForInStatements, VariableDeclarators
        // require special handling because they have "naked" left-hand-side expressions. We must
        // take care to not automatically transform these left-hand-side expressions into a form
        // that gets a value. Note also that ForInStatements must have a statement inserted just
        // prior to it and in its block in order to spy correctly.

        // TODO: handle object expressions which don't have node.type
        if (transformStatement.canTransform(node)) {
            this.skip();
            // transformStatement just returns a subtree
            return transformStatement(node);
        }

        if (transformExpression.canTransform(node)) {
            this.skip();
            // Our parent must be on the nodesToTraverse whitelist, so we may safely assume that
            // it getValue's the expression.
            expression = transformExpression(node);

            if (expression) {
                return expression.getValue().toNode();
            }
        } else if ( ! nodeTypesToTraverse.hasOwnProperty(node.type)) {
            // Again, to guard against getValue-ing expressions that are meant to be strictly on a
            // left-hand-side, skip any expression or statement nodes that we don't understand.
            this.skip();
        }

        // Return without skipping or replacing. Either transformExpression couldn't do it's magic,
        // or we're just traversing a BlockStatement or other non-expression that doesn't need to be
        // transformed.
    }
});
console.log(JSON.stringify(ast, null, 4));
console.log("\n" + escodegen.generate(ast));
