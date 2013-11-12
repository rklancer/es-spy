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

function spy(range, value) {
    return exp.callExpression(
        exp.identifier('_spy'),   // TODO: recycle this object?
        [exp.literal(range[0], ''+range[0]), exp.literal(range[1], ''+range[1]), value.toNode()]
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
    this.result = new IdentifierValue(getTempVar(), reference);
    this.nodes.push(
        exp.assign(
            this.result.toNode(),
            reference.toNode()
        )
    );
    this.nodes.push(spy(this.range, this.result));
    return this;
};

TransformedExpression.prototype.appendNodes = function(nodes) {
    for (var i = 0, len = nodes.length; i < len; i++) {
        this.nodes.push(nodes[i]);
    }
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
        return new TransformedExpression(node.range, new EnvironmentReference(new IdentifierValue(node.name)));
    },

    Literal: function(node) {
        return new TransformedExpression(node.range, new LiteralValue(node.value, node.raw));
    },

    MemberExpression: function(node) {
        var ret = new TransformedExpression(node.range);
        var base = transformExpression(node.object).getValue();
        var property;

        ret.result = new PropertyReference(base.result);
        ret.appendNodes(base.nodes);

        if (node.computed) {
            ret.result.isComputed = true;
            property = transformExpression(node.property).getValue();
            ret.appendNodes(property.nodes);
            ret.result.referencedName = new IdentifierValue(getTempVar());

            ret.nodes.push(exp.assign(
                ret.result.referencedName.toNode(),
                exp.binary(exp.literal('', '\'\''), '+', property.result.toNode())
            ));
            ret.nodes.push(spy(node.property.range, ret.result.referencedName));

        } else {
            ret.result.isComputed = false;
            ret.result.referencedName = new IdentifierValue(node.property.name);
        }

        return ret;
    },

    CallExpression: function(node) {
        // Section 11.2.3
        // http://www.ecma-international.org/ecma-262/5.1/#sec-11.2.3

        var ret = new TransformedExpression(node.range);
        var func = transformExpression(node.callee).getValue();
        ret.appendNodes(func.nodes);

        var argExp;
        var argExps = [];

        for (var i = 0, len = node.arguments.length; i < len; i++) {
            argExp = transformExpression(node.arguments[i]).getValue();
            ret.appendNodes(argExp.nodes);
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
                thisArg = exp.undef();
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
        ret.result = new IdentifierValue(getTempVar());
        ret.nodes.push(exp.assign(ret.result.toNode(), right));
        ret.nodes.push(spy(node.range, ret.result));
        return ret;
    },

    AssignmentExpression: function(node) {
        if (node.operator !== '=') {
            return false;
        }

        // Section 11.13.1
        // http://www.ecma-international.org/ecma-262/5.1/#sec-11.13.1
        var ret = new TransformedExpression(node.range);
        var lref = transformExpression(node.left);
        ret.appendNodes(lref.nodes);
        var rval = transformExpression(node.right).getValue();
        ret.appendNodes(rval.nodes);
        ret.nodes.push(
            exp.assign(
                lref.result.toNode(),
                rval.result.toNode()
            )
        );
        ret.result = rval.result;
        return ret;
    }
};

/*jshint -W003*/
// Returns a TransformedExpression
function transformExpression(node) {
    var transform = expressionTransformsByNodeType[node.type];

    if (transform) {
        // TODO pass new TransformedExpression to the transform function. Possibly set as the
        // 'this' value of the transform methiod.
        return transform(node);
    }
    return false;
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

var example = "a[b];";
var ast = esprima.parse(example, { range: true });

ast = estraverse.replace(ast, {
    enter: function (node, parent) {
        var expression;
        var statement;

        // Is this a statement we have to handle specially? (ForInStatements, VariableDeclarators
        // require special handling because they have "naked" left-hand-side expressions. We must
        // take care to not automatically transform these left-hand-side expressions into a form
        // that gets a value. Note also that ForInStatements must have a statement inserted just
        // prior to it and in its block in order to spy correctly.

        // TODO: handle object expressions which don't have node.type
        if (statement = transformStatement(node)) {
            this.skip();
            // transformStatement just returns a subtree
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
console.log(JSON.stringify(ast, null, 4));
console.log("\n" + escodegen.generate(ast));
