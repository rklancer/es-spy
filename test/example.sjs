describe "ExpressionStatement" {
    it "should be spyable" {v

		var result, ctx;

		result = evaluate => {
		    a;
		} in ctx = {
		    a: {}
		}

		test "expression is spied" { result.spy("`a`") === ctx.a }
		test "returns its value"   { value === ctx.a; }
	}
}


describe "CallExpression" {

    it "sets this value" {
    	var ctx = {
    	    getThis: function() { "use strict"; return this; },
    	    getThisGetter: function() { return getThis; },
    	    base: { getThis: getThis },  	    
    	}

    	test "when environment reference -> this is global" { 
    	    in ctx evaluate => { getThis() }.value === global 
    	}
    	test "when property reference -> this is base" { 
    	    in ctx evaluate => { base.getThis() }.value === ctx.base 
    	}
    	test "when value -> this is undefined" { 
    	    in ctx evaluate => { getThisGetter()() }.value === undefined
    	}
    }
}



    // idea: allow partial evaluation so we can apply different "with" contexts ... 
    // (or the reverse, using different "evals" in a "with" context)

the reason we want to wrap the spied function in a with statement is to detect (and trap) variable accesses.
however, the with statement affects the this context of called functions.
