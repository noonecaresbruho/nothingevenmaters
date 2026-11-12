// Copies the 2016 client's console output (what F9 "Client" shows) to the host.
// Hooks StandardOut print(obj, type, fmt, ...args): 0x59bc60 in the 2016M (0.256.0.83059) player, 0x5691d0 in the watrbx one.
const m = Process.getModuleByName(Process.enumerateModules()[0].name);
const B = m.base.sub(0x400000);
const TYPES = { 0: 'OUT', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };
function fmt(f, args) {
  let i = 0;
  return f.replace(/%[-+ #0]*\d*(?:\.\d+)?(?:l|ll|h|I64)?([sdiuxXfgcp%])/g, (all, c) => {
    if (c === '%') return '%';
    const a = args[i++];
    try {
      if (c === 's') return a.isNull() ? '(null)' : a.readAnsiString(2000);
      if (c === 'f' || c === 'g') { i++; return '<float>'; }
      if (c === 'x' || c === 'X' || c === 'p') return a.toString(16);
      return a.toInt32().toString();
    } catch (e) { return '?'; }
  });
}
const PRINT = /Player2016M/i.test(m.path) ? 0x59bc60 : 0x5691d0;
Interceptor.attach(B.add(PRINT), {
  onEnter(a) {
    try {
      const type = a[1].toInt32();
      const f = a[2].readAnsiString(2000);
      send({ t: TYPES[type] || String(type), msg: fmt(f, [a[3], a[4], a[5], a[6], a[7], a[8]]) });
    } catch (e) {}
  }
});
send({ t: 'TOOL', msg: 'client log attached (' + m.path + ', print 0x' + PRINT.toString(16) + ')' });
