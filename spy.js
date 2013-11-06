/*jshint unused: false */
"use strict";
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');

// For now, hold intermediate values in variables named  _1, _2, _3, ...
var getTempVar = function() {
    var count = 0;

    return function() {
        return '_' + (++count);
    };
};

// Returns a TransformResult
function getValue(transformResult) {
}

// returns a TransformResult
function coerceToString(transformResult) {
}

// returns a node
function transformStatement(node) {
}

// Returns a TransformResult
function transformExpression(node) {
}

var transformByType = {
    Identifier: function(node) {
    },

    MemberExpression: function(node) {
    },

    CallExpression: function(node) {
    },

    AssignmentExpression: function(node) {
    }
};

var STATEMENT = 'statement';
var EXPRESSION = 'expression';

var nodeTypeWhitelist = {
    ExpressionStatement: STATEMENT,
    MemberExpression: EXPRESSION,
    // etc.
};

// Properties:
//
// type: 'Reference' or 'Value'
// baseValue: name of temp identifier corresponding to BaseValue of reference (object part), or null
// referencedName: name of identifier
// value: if type is Value,
// expressions: list of expression nodes which need to be evaluated first to make this Value or
// Reference valid.
//
// I don't think we need runtime considerations like IsStrictReference or HasPrimitiveBase
function TransformResult() {

}

// Returns a single AST node corresponding the TransformResult. If the TransformResult's
// expressions array has more than one expression, they will be wrapped in a SequenceExpression
// first. This is used at the top level to turn a TransformResult into something that goes into the
// "expression slot" in the AST, but it can also be used by indidual expression transforms, such as
// the ternary expression transform, which need to consolidate an expression list into a single
// node.,
TransformResult.prototype.toNode = function() {

};

TransformResult.prototype.isPropertyReference = function() {

};

// ====

var example = "++a.b;";
var ast = esprima.parse(example);
var skip;

ast = estraverse.replace(ast, {
    enter: function (node, parent) {

        // Is this a statement we have to handle specially? (ForInStatements, VariableDeclarators
        // require special handling because they have "naked" left-hand-side expressions. We must
        // take care to not automatically transform these left-hand-side expressions into a form
        // that gets a value. Note also that ForInStatements must have a statement inserted just
        // prior to it and in its block in order to spy correctly.

        // If so:
        this.skip();
        // transformStatement just returns a subtree
        return transformStatement(node);

        // Is this node's type NOT on our white list of node types? (nodes we want to traverse)
        // (remember to handle the case of object initializers, which have nodes w/o a type
        // property)

        // If so:
        this.skip();
        return;         // leave node as-is.

        // Is this node (remember, it's on our whitelist) an expression?

        // If so:
        this.skip();
        result = transformExpression(node);
        if (result) {
            // Our whitelist checking is supposed to guarantee that all expressions are getValue'd
            // at this point.
            return getValue(result).toNode();
        }

        // Return without skipping or replacing. Either transformExpression couldn't do it's magic,
        // or we're just traversing a BlockStatement or other non-expression that doesn't need to be
        // transformed.
    }
});

console.log("\n" + escodegen.generate(ast));
