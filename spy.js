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

// or: make a .canTransform property of transformStatement
var statementTransformsByNodeType = {
};

// TODO: require underscore, use _.forEach to convert statementTransformsByNodeType to a whitelist
// of statementsToTransform (stick to ES3 in case running in an ES3 enviroment)
var statementNodeTypesToTransform = statementTransformsByNodeType;


// Returns a TransformResult
function transformExpression(node) {
}

var expressionTransformsByNodeType = {
    Identifier: function(node) {
    },

    MemberExpression: function(node) {
    },

    CallExpression: function(node) {
    },

    AssignmentExpression: function(node) {
    }
};

// TODO: _.forEach
var expressionNodeTypesToTransform = expressionNodeTypesToTransform;

// Just a list of nodes we can safely traverse. Exceptions are mainly statement types that treat
// child expressions as left hand sides, but we do this in whitelist form so we don't traverse
// statement types we don't understand.
var nodeTypesToTraverse = {
};

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
        var result;

        // Is this a statement we have to handle specially? (ForInStatements, VariableDeclarators
        // require special handling because they have "naked" left-hand-side expressions. We must
        // take care to not automatically transform these left-hand-side expressions into a form
        // that gets a value. Note also that ForInStatements must have a statement inserted just
        // prior to it and in its block in order to spy correctly.

        // TODO: handle object expressions which don't have node.type
        if (statementNodeTypesToTransform.hasOwnProperty(node.type)) {
            this.skip();
            // transformStatement just returns a subtree
            return transformStatement(node);
        }

        // Is this node's type NOT on our white list of node types? (nodes we want to traverse)
        // (remember to handle the case of object initializers, which have nodes w/o a type
        // property)

        if ( ! nodeTypesToTraverse.hasOwnProperty(node.type) &&
             ! expressionNodeTypesToTransform.hasOwnProperty(node.type) ) {
            this.skip();
            return;
        }

        if (expressionNodeTypesToTransform.hasOwnProperty(node.type)) {
            // Is this node (remember, it's on our whitelist) an expression?

            // If so:
            this.skip();
            result = transformExpression(node);

            if (result) {
                // Our whitelist checking is supposed to guarantee that all expressions are getValue'd
                // at this point.
                return getValue(result).toNode();
            }
        }

        // Return without skipping or replacing. Either transformExpression couldn't do it's magic,
        // or we're just traversing a BlockStatement or other non-expression that doesn't need to be
        // transformed.
    }
});

console.log("\n" + escodegen.generate(ast));
