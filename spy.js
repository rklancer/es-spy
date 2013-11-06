/*jshint unused: false */
"use strict";
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var _ = require('underscore');


// For now, hold intermediate values in variables named  _1, _2, _3, ...
var getTempVar = function() {
    var count = 0;

    return function() {
        return '_' + (++count);
    };
};


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

function Value(value) {
    this.value = value;
}
Value.prototype = extendPrototypeOf(ExpressionResult);


function EnvironmentReference(referencedName) {
    this.referencedName = referencedName;
}
EnvironmentReference.prototype = extendPrototypeOf(ExpressionResult);

function PropertyReference(baseValue, referencedName) {
    this.baseValue = baseValue;
    this.referencedName = referencedName;
}
PropertyReference.prototype = extendPrototypeOf(ExpressionResult);


// This is the return type of transformExpression. It contains AST nodes corresponding to a
// transformed version of the expression which stashes intermediate evaluation results in temporary
// variables, and metadata with information about the temporary variables and what kind of data
// will be stored in them after the expression nodes are evaluated at runtime.
//  There are three cases. After the expression nodes are evaluated by the runtime:
//    1. The variable named by 'baseValue' contains an object and 'referenceName' is a string value
//       corresponding to a property of that object (which may be undefined). This corresponds
//       roughly to a Reference specification type in ECMA-262 having isPropertyReference = true
//    2. The variable named by 'referenceName' is a variable name in local scope. It can be
//       dereferenced or assigned to.
//    3. The value in 'value' is a plain Javascript value.Javascript
//
// Properties:
// type: 'Reference' or 'Value'
// baseValue: name of temp identifier corresponding to BaseValue of reference (object part), or null
// referencedName: name of identifier
// value: if type is Value,
// expressions: list of expression nodes which need to be evaluated first to make this Value or
// Reference valid.
//
// I don't think we need runtime considerations like IsStrictReference or HasPrimitiveBase
function TransformedExpression(expressionResult, nodes) {
    if ( ! expressionResult instanceof ExpressionResult ) {
        throw new TypeError("expression must return an ExpressionResult");
    }

    nodes = nodes || [];
    var _nodes = this.nodes = [];
    _.each(nodes, function(node) {
        _nodes.push(node);
    });
}

// Returns a TransformedExpression consisting of getValue applied to the
TransformedExpression.prototype.getValue = function(expression) {

};

// Returns a single AST node corresponding the TransformedExpression. If the TransformedExpression's
// expressions array has more than one expression, they will be wrapped in a SequenceExpression
// first. This is used at the top level to turn a TransformedExpression into something that goes
// into the "expression slot" in the AST, but it can also be used by indidual expression transforms,
// such as the ternary expression transform, which need to consolidate an expression list into a
// single node.
TransformedExpression.prototype.toNode = function() {

};

// TODO: should this be a method of TransformedExpression?
// returns a TransformedExpression
function coerceToString(expression) {
}

var expressionTransformsByNodeType = {
    Identifier: function(node) {
        return new TransformedExpression(new EnvironmentReference(node.name));
    },

    MemberExpression: function(node) {

    }
};

// Returns a TransformedExpression
function transformExpression(node) {
    return expressionTransformsByNodeType[node.type](node);
}

transformExpression.canTransform = function(node) {
    return expressionTransformsByNodeType.hasOwnProperty(node.type);
};


var nodeTypesToTraverse = {
    Program: true,
    ExpressionStatement: true
};

// ====

var example = "++a.b;";
var ast = esprima.parse(example);

ast = estraverse.replace(ast, {
    enter: function (node, parent) {
        var result;

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
            result = transformExpression(node);

            if (result) {
                return result.getValue().toNode();
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

console.log("\n" + escodegen.generate(ast));
