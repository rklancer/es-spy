"use strict";

function assign(left, right) {
    return {
        type: 'AssignmentExpression',
        operator: '=',
        left: left,
        right: right
    };
}

function identifier(name) {
    return {
        type: 'Identifier',
        name: name
    };
}

function memberExpression(object, computed, property) {
    return {
        type: 'MemberExpression',
        object: object,
        computed: computed,
        property: property
    };
}

function binary(left, operator, right) {
    return {
        type: 'BinaryExpression',
        left: left,
        operator: operator,
        right: right
    };
}

function literal(value, raw) {
    return {
        type: 'Literal',
        value: value,
        raw: raw
    };
}

function sequenceExpression(expressions) {
    return {
        type: 'SequenceExpression',
        expressions: expressions
    };
}

exports.assign = assign;
exports.identifier = identifier;
exports.memberExpression = memberExpression;
exports.binary = binary;
exports.literal = literal;
exports.sequenceExpression = sequenceExpression;

