function f() {
  return {
    get answer() {
      return 6 * 7;
    }
  };
}

g = f;

var answer = g().answer;
