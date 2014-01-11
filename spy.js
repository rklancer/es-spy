/*jshint unused: false, boss: true*/
"use strict";

var assert = require('assert');

var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');

var exp = require('./lib/expressions');

// For now, hold intermediate values in variables named  _1, _2, _3, ...
var getTempVar = (function() {
    var count = 0;

    return function() {
        return '_' + (++count);
    };
}());

function spy(node, range) {
    return exp.callExpression(
        exp.identifier('__spy'),   // TODO: recycle this object?
        [node, exp.literal(range[0], ''+range[0]), exp.literal(range[1], ''+range[1])]
    );
}

var statementTransformsByNodeType = {
};

// returns a node or false
function transformStatement(node) {
    return false;
}


function extend(child, parent) {
    function F() {}
    F.prototype = parent.prototype;
    child.prototype = new F();
    child.prototype.constructor = child;
}

// Marker type
function ExpressionResult() {
}

function Value() {
}
extend(Value, ExpressionResult);

function Reference() {
}
extend(Reference, ExpressionResult);

function IdentifierValue(identifier, fromReference) {
    this.identifier = identifier;
    this.fromReference = fromReference;
}
extend(IdentifierValue, Value);

IdentifierValue.prototype.toNode = function() {
    return exp.identifier(this.identifier);
};

function TempVar(range, fromReference) {
    // Later, we'll get a relocatable tempvar identifier "handle" from the scope
    IdentifierValue.call(this, getTempVar(), fromReference);
    this.range = range;
}
extend(TempVar, IdentifierValue);
// Later: TempVar.prototype.toNode should record the temp var-using ast node with the scope
// This way, the scope can rewrite tempvar handles with non-colliding variable names after the scope
// is analyzed.

function LiteralValue(value, raw) {
    this.value = value;
    this.raw = raw;
}
extend(LiteralValue, Value);

LiteralValue.prototype.toNode = function() {
    return exp.literal(this.value, this.raw);
};

function EnvironmentReference(referencedName) {
    this.referencedName = referencedName;
}
extend(EnvironmentReference, Reference);
EnvironmentReference.prototype.toNode = function() {
    return this.referencedName.toNode();
};


function PropertyReference(baseValue, referencedName, isComputed) {
    this.baseValue = baseValue;
    this.referencedName = referencedName;
    this.isComputed = isComputed;
}
extend(PropertyReference, Reference);
PropertyReference.prototype.toNode = function() {
    return exp.memberExpression(
        this.baseValue.toNode(),
        this.isComputed,
        this.referencedName.toNode()
    );
};


function TransformedExpression(range, result, nodes) {
    this.range = range;
    this.result = result;
    this.nodes = [];
}

// If the TransformedExpression's result is a Reference, mutate the TransformedExpression to return
// a Value instead, by dereferencing the Reference (assigning it to a temp var)
TransformedExpression.prototype.getValue = function() {
    var reference;

    if (this.result instanceof Value) {
        return this;
    }

    reference = this.result;
    this.result = new TempVar(this.range, reference);
    this.assign(this.result, reference.toNode());
    return this;
};

TransformedExpression.prototype.assign = function(tempVar, node) {
    this.appendNode(spy(exp.assign(tempVar.toNode(), node), tempVar.range));
};

TransformedExpression.prototype.appendNodes = function(nodes) {
    for (var i = 0, len = nodes.length; i < len; i++) {
        this.appendNode(nodes[i]);
    }
    return this;
};

TransformedExpression.prototype.appendNode = function(node) {
    this.nodes.push(node);
    return this;
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
        return exp.sequenceExpression(this.nodes);
    }
};


var expressionTransformsByNodeType = {
    Identifier: function(node) {
        this.result = new EnvironmentReference(new IdentifierValue(node.name));
    },

    Literal: function(node) {
        this.result = new LiteralValue(node.value, node.raw);
    },

    MemberExpression: function(node) {
        // Section 11.2.1
        // http://www.ecma-international.org/ecma-262/5.1/#sec-11.2.1

        var base = transformExpression(node.object).getValue();
        var property;

        this.result = new PropertyReference(base.result);
        this.appendNodes(base.nodes);

        if (node.computed) {
            this.result.isComputed = true;
            property = transformExpression(node.property).getValue();
            this.appendNodes(property.nodes);
            this.result.referencedName = new TempVar(property.range);
            this.assign(
                this.result.referencedName,
                exp.binary(exp.literal('', '\'\''), '+', property.result.toNode())
            );
        } else {
            this.result.isComputed = false;
            // TODO the use of IdentifierValue is not formally correct, it just "happens to work":
            this.result.referencedName = new IdentifierValue(node.property.name);
        }
    },

    CallExpression: function(node) {
        // Section 11.2.3
        // http://www.ecma-international.org/ecma-262/5.1/#sec-11.2.3

        var func = transformExpression(node.callee).getValue();
        this.appendNodes(func.nodes);

        var argExp;
        var argExps = [];

        for (var i = 0, len = node.arguments.length; i < len; i++) {
            argExp = transformExpression(node.arguments[i]).getValue();
            this.appendNodes(argExp.nodes);
            argExps.push(argExp.result.toNode());
        }

        var ref = func.result.fromReference;
        var right;
        var thisArg;

        if (ref instanceof EnvironmentReference) {
            right = exp.callExpression(
                func.result.toNode(),
                argExps
            );
        } else {
            // both of these choices require using the .call form:

            if (ref instanceof PropertyReference) {
                // Having evaluated the callee to get 'func', we must not evaluate it again.
                // Therefore use Function.prototype.call on 'func' and pass the baseValue as the
                // thisArg.
                thisArg = ref.baseValue.toNode();
            } else {
                // ref is a Value, perhaps returned by another CallExpression: f()() According to
                // the spec, thisValue is undefined in this case. Therefore, transfrom to this:
                // <value>.call(void 0, <arg 0>, <arg 1>...);
                thisArg = exp.void0();
            }

            argExps.unshift(thisArg);

            right = exp.callExpression(
                exp.memberExpression(
                    func.result.toNode(),
                    false,
                    exp.identifier('call')
                ),
                argExps
            );

        }
        this.result = new TempVar(node.range);
        this.assign(this.result, right);
    },

    AssignmentExpression: function(node) {
        if (node.operator !== '=') {
            return false;
        }

        // Section 11.13.1
        // http://www.ecma-international.org/ecma-262/5.1/#sec-11.13.1
        var lref = transformExpression(node.left);
        this.appendNodes(lref.nodes);
        var rval = transformExpression(node.right).getValue();
        this.appendNodes(rval.nodes);
        this.appendNode(
            exp.assign(
                lref.result.toNode(),
                rval.result.toNode()
            )
        );
        this.result = rval.result;
    }
};

/*jshint -W003*/
// Returns a TransformedExpression
function transformExpression(node) {
    var transform = expressionTransformsByNodeType[node.type];
    var expression;

    if (transform) {
        expression = new TransformedExpression(node.range);
        if (transform.call(expression, node) === false) {
            return false;
        }
        return expression;
    }
    return false;
}
/*jshint +W003*/

var nodeTypesToTraverse = {
    Program: true,
    ExpressionStatement: true,
    IfStatement: true,
    BlockStatement: true
};

// ====

// Walk the ast, transforming expressions into spied form.
function transform(ast) {
    return estraverse.replace(ast, {
        enter: function (node, parent) {
            var expression;
            var statement;

            // TODO: handle object expressions which don't have node.type

            // Is this a statement we have to handle specially? (ForInStatements, VariableDeclarators
            // require special handling because they have "naked" left-hand-side expressions. We must
            // take care to not automatically transform these left-hand-side expressions into a form
            // that gets a value. Note also that ForInStatements must have a statement inserted just
            // prior to it and in its block in order to spy correctly.)
            if (statement = transformStatement(node)) {
                this.skip();
                return statement;
            }

            if (expression = transformExpression(node)) {
                this.skip();
                // Our parent must have been on the nodeTypesToTraverse 'whitelist' or else we would
                // have been skipped. The whitelist contains statements known to not use the expressions
                // as left hand sides. Therefore, it is safe to call getValue on the expression.
                return expression.getValue().toNode();
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
}

var example = "f()();";
var ast = transform(esprima.parse(example, { range: true }));
console.log("\n" + example +"\n\n==>\n");
console.log(escodegen.generate(ast));
