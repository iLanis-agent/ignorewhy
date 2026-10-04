'use strict';
var G = require('./engine.js'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
var checks = 0, fails = 0;
function eq(a, b, m) { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } }
function ign(text, p, dir) { var r = G.check(G.parse(text), p, dir); return r.ignored; }

// Worked examples from the gitignore manual (git-scm.com/docs/gitignore, read in full)
eq(ign('hello.*\n', 'hello.txt'), true, 'hello.*');
eq(ign('hello.*\n', 'hello.c'), true, 'hello.c');
eq(ign('hello.*\n', 'a/hello.java'), true, 'unanchored deeper');
eq(ign('/hello.*\n', 'hello.txt'), true, 'anchored');
eq(ign('/hello.*\n', 'a/hello.java'), false, 'anchored deeper');
eq(ign('foo/\n', 'foo/', true), true, 'foo/ dir');
eq(ign('foo/\n', 'foo'), false, 'foo/ file');
eq(ign('foo/\n', 'foo/bar.txt'), true, 'under foo/');
eq(ign('doc/frotz/\n', 'doc/frotz/', true), true, 'doc/frotz');
eq(ign('doc/frotz/\n', 'a/doc/frotz/', true), false, 'a/doc/frotz');
eq(ign('frotz/\n', 'a/frotz/', true), true, 'a/frotz');
eq(ign('doc/frotz\n', 'doc/frotz'), true, 'middle slash');
eq(ign('/doc/frotz\n', 'doc/frotz'), true, 'leading+middle slash');
eq(ign('doc/frotz\n', 'a/doc/frotz'), false, 'middle slash anchored');
eq(ign('foo/*\n', 'foo/test.json'), true, 'foo/* file');
eq(ign('foo/*\n', 'foo/bar/', true), true, 'foo/* dir');
eq(ign('foo/*\n', 'foo/bar/hello.c'), true, 'foo/* nested hits via foo/bar dir');
eq(G.check(G.parse('foo/*\n'), 'foo/bar/hello.c').via, 'foo/bar', 'via');
var doc = '*.html\n!foo.html\n';
eq(ign(doc, 'Documentation/gitignore.html'), true, 'doc html');
eq(ign(doc, 'Documentation/foo.html'), false, 'doc foo.html');
eq(ign('vmlinux*\n!/vmlinux*\n', 'vmlinux.lds.S'), false, 'reinclude');
var ex = '/*\n!/foo\n/foo/*\n!/foo/bar\n';
eq(ign(ex, 'other.txt'), true, 'except foo/bar: other'); eq(ign(ex, 'foo/x', false), true, 'foo/x'); eq(ign(ex, 'foo/bar/a.c'), false, 'foo/bar/a.c');
eq(ign('*.[oa]\n', 'src/internal.o'), true, '*.[oa]');
eq(ign('**/foo\n', 'a/b/foo'), true, '**/foo'); eq(ign('**/foo/bar\n', 'x/foo/bar'), true, '**/foo/bar'); eq(ign('**/foo/bar\n', 'x/foo/baz'), false, '**/foo/bar neg');
eq(ign('abc/**\n', 'abc/x/y'), true, 'abc/**'); eq(ign('abc/**\n', 'abc/', true), false, 'abc/** not abc itself');
eq(ign('a/**/b\n', 'a/b'), true, 'a/**/b zero'); eq(ign('a/**/b\n', 'a/x/y/b'), true, 'a/**/b deep'); eq(ign('a/**/b\n', 'ab'), false, 'a/**/b no');
eq(ign('a**b\n', 'axxb'), true, 'a**b as *'); eq(ign('a**b\n', 'a/b'), false, 'a**b does not cross /');
eq(ign('\\#x\n', '#x'), true, 'escaped hash'); eq(ign('#x\n', '#x'), false, 'comment');
eq(ign('\\!x\n', '!x'), true, 'escaped bang');
eq(ign('x \n', 'x'), true, 'trailing space dropped'); eq(ign('x\\ \n', 'x '), true, 'escaped trailing space'); eq(ign('x\\ \n', 'x'), false, 'escaped space literal');
eq(ign('x\\\n', 'x'), false, 'trailing backslash invalid');
eq(G.parse('x\\\n').warnings.length, 1, 'warning invalid');
eq(ign('\uFEFFfoo\n', 'foo'), true, 'BOM');

// Oracle: real git check-ignore -v -n (pass-through of the same patterns on a real repo)
var gitv = cp.execSync('git --version').toString().trim();
var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
var NAMES = ['a', 'b', 'foo', 'bar', 'x.txt', 'y.log', 'build', 'src', '.env', 'Foo', 'bar.o'];
var SEG = ['a', 'b', 'foo', 'bar', 'build', 'src', '*', '*.log', '*.txt', '?', '[ab]', '[!a]', '**', 'f*', '*o*', 'ba[rz]', 'ba?', 'x.*', '.*', '[a-c]*', '\\*', '[[:alpha:]]', 'bar.[oa]', 'a**', '**b', 'a[', '[]a]', '[z-a]', 'b\\', '[[:foo:]]', '[a-]', '\\a', 'f\\o*', 'foo ', '*\\ '];
function randPattern() {
  var s = '', segs = 1 + Math.floor(rnd() * 3), i;
  if (rnd() < 0.4) s += '/';
  for (i = 0; i < segs; i++) { if (i) s += '/'; s += pick(SEG); }
  if (rnd() < 0.3) s += '/';
  if (rnd() < 0.25) s = '!' + s;
  return s;
}
function randTree() { // paths: [relpath, isDir]
  var out = {}, n = 4 + Math.floor(rnd() * 8), i;
  for (i = 0; i < n; i++) {
    var d = 1 + Math.floor(rnd() * 3), parts = [], j;
    for (j = 0; j < d; j++) parts.push(pick(NAMES));
    var ok = true;
    for (j = 1; j <= d; j++) { var pre = parts.slice(0, j).join('/'); if (out[pre] === 'f' && j < d) ok = false; }
    var full = parts.join('/');
    if (!ok) continue;
    if (out[full] === 'd' && false) continue;
    for (j = 1; j < d; j++) out[parts.slice(0, j).join('/')] = 'd';
    if (out[full] === undefined) out[full] = rnd() < 0.5 ? 'd' : 'f';
  }
  return out;
}
var ROUNDS = 1200, cmp = 0;
for (var round = 0; round < ROUNDS; round++) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igw-'));
  cp.execSync('git init -q', { cwd: dir });
  var pats = [], np = 1 + Math.floor(rnd() * 5), k;
  for (k = 0; k < np; k++) pats.push(randPattern());
  var text = pats.join('\n') + '\n';
  fs.writeFileSync(path.join(dir, '.gitignore'), text);
  var tree = randTree(), keys = Object.keys(tree);
  keys.forEach(function (p) { if (tree[p] === 'd') fs.mkdirSync(path.join(dir, p), { recursive: true }); });
  keys.forEach(function (p) { if (tree[p] === 'f') { fs.mkdirSync(path.join(dir, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), 'x'); } });
  var res = cp.spawnSync('git', ['check-ignore', '-v', '-n', '--no-index', '--stdin'], { cwd: dir, input: keys.join('\n') + '\n' }).stdout.toString().split('\n').filter(Boolean);
  var parsed = G.parse(text), byPath = {};
  res.forEach(function (l) { var m = /^(.*?):(\d*):(.*)\t(.*)$/.exec(l); if (m) byPath[m[4]] = { line: m[2] ? +m[2] : null, pat: m[3] }; });
  keys.forEach(function (p) {
    var g = byPath[p], mine = G.check(parsed, p, tree[p] === 'd');
    if (!g) { checks++; fails++; console.log('NO GIT OUTPUT', p); return; }
    var gi = g.line !== null && g.pat[0] !== '!';
    cmp++;
    eq([mine.ignored, mine.rule ? mine.rule.line : null], [gi, g.line], 'git oracle ' + JSON.stringify(text) + ' path ' + p + ' (' + tree[p] + ')');
  });
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(checks + ' checks, ' + fails + ' failures (' + cmp + ' paths compared with ' + gitv + ')');
process.exit(fails ? 1 : 0);
