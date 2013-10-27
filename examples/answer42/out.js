/* __spy = function(num, args) { console.log(num, args); } */
function f() {
  __spy(8, arguments);
  __3 = {
    get answer() {
      __spy(10, arguments);
      __4 = 6 * 7;
      __spy(11, __4);
      return __4;
    }
  };
  __spy(9, __3);
  return(__3);
}
__spy(1, f);

__spy(2, f);
g = f;
__spy(3, g);

__spy(4, g);
__1 = g();
__spy(5, __1);
__2 = __1.answer;
__spy(6, __2);
var answer = __2;
__spy(7, answer);