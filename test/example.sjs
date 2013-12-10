describe "ExpressionStatement" {
    it "should be spyable" {

		var result, ctx;

		result = evaluate {
		    a;
		} with ctx = {
		    a: {}
		}

		test "expression is spied" { result.spy("`a`") === ctx.a }
		test "returns its value"   { result.value === ctx.a; }
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
    	    with ctx evaluate { getThis(); }.value === global 
    	}
    	test "when property reference -> this is base" { 
    	    with ctx evaluate { base.getThis() }.value === ctx.base 
    	}
    	test "when value -> this is undefined" { 
    	    with ctx evaluate { getThisGetter()() }.value === undefined
    	}
    }
}



    // idea: allow partial evaluation so we can apply different "with" contexts ... 
    // (or the reverse, using different "evals" with a "with" context)

