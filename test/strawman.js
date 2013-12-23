/*globals it, describe, evaluateWith*/
/*jshint strict: false, indent: false*/

require('spy-env.js');
var spy = require('../index.js');

describe("ExpressionStatements", function() {
    var ctx = { a: {} };
    var result = evaluateWith(ctx, "a");

    it("should return the expression value", function() {
        result.returns(ctx.a);
    });

    it("should spy the expression value", function() {
        result.observes("`a`", ctx.a);
    });
});


describe("CallExpressions", function() {

    describe("this value", function() {
        var getThis = function() { "use strict"; return this; };
        var ctx = {
            getThis: getThis,
            getThisGetter: function() { return getThis; },
            base: { getThis: getThis }
        };



        // Questions:


        var inCtx = evaluateWith(ctx, {});
        var res;

        // pointless style:
        // // name -> list -> list
        // var filterName = compose(filter, nameIs);
        // // list -> list
        // var filterGet = compose(filter, typeIs('get'));
        // // res -> number
        // var getcount = compose(length, filterName('getThis'), filterGet, call('log'));

        function accessCount(res, name) {
            return res.log().filter(nameIs(name)).filter(typeIs('get')).length;
        }

        it("is undefined when call is environment reference not from a with statement", function() {
            res = inCtx("getThis();");
            res.returns(undefined);

            // This should be more general: that access logs match overall.
            accessCount(res, 'getThis').should.equal(1);
        });

        it("is base value `when call is environment reference from with statement", function() {
            res = inCtx("with (base) { return getThis(); }");
            res.returns(ctx.base);
            accessCount(res, 'getThis').should.equal(1);
        });

        it("is base value when function is a property reference", function() {
            res = inCtx("base.getThis();");
            res.returns(ctx.base);
            accessCount(res, 'getThis').should.equal(1);
        });

        it("is undefined when function is a value", function() {
            res = inCtx("getThisGetter()();");
            res.returns(undefined);
            accessCount(res, 'getThisGetter').should.equal(1);
        });
    });
});
