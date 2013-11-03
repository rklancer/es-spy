/*jshint unused: false */
"use strict";
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');

var handlers = {
    Identifier: function(e) {
        return e;
    },

    MemberExpression: function(e) {
        return e;
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

function spiedExpression(expression) {
    estraverse.traverse(expression, {
        enter: function(node, parent) {
            console.log("entering expression node ", node.type);
        },

        leave: function(node, parent) {
            console.log("leaving  expression node ", node.type);
            return spiedSubexpression(node);
        }
    });

    return expression;
}

function spiedSubexpression(expression) {
    if (handlers[expression.type]) {
        return handlers[expression.type](expression);
    }
    // noop
    return expression;
}

// ====

var example = "svg.selectAll('path').data(theData);";
var ast = esprima.parse(example);
var skip;
estraverse.traverse(ast, {
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
            ret = spiedExpression(node);
            console.log("---------------------\n");
            skip = false;
        }

        console.log("leaving  ", node.type);
        return ret;
    }
});

console.log("\n" + escodegen.generate(ast));
