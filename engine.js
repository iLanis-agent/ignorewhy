(function (root) {
  'use strict';
  var POSIX = {
    alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z',
    space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f',
    cntrl: '\\x00-\\x1f\\x7f', graph: '!-~', print: ' -~'
  };
  function lit(c) { return c.replace(/[\\^$.*+?()[\]{}|\/-]/g, '\\$&'); }
  function clsChar(c) { return c.replace(/[\\\]\[^-]/g, '\\$&'); }

  // Translate one gitignore glob (leading "!" and trailing "/" already removed) to a RegExp source.
  // Returns null when git treats the pattern as invalid (it never matches).
  function globToRe(p) {
    var out = '', i = 0, n = p.length, wild = false;
    while (i < n) {
      var c = p[i];
      if (c === '\\') {
        wild = true;
        if (i === n - 1) return null;
        out += lit(p[i + 1]); i += 2;
      } else if (c === '*') {
        var j = i; while (j < n && p[j] === '*') j++;
        var cnt = j - i;
        if (cnt >= 2 && (i === 0 || p[i - 1] === '/' || !wild) && (j === n || p[j] === '/')) {
          if (j === n) { out += '.*'; i = j; }
          else { out += '(?:.*\\/)?'; i = j + 1; }
        } else { out += '[^/]*'; i = j; }
        wild = true;
      } else if (c === '?') { wild = true; out += '[^/]'; i++; }
      else if (c === '[') {
        wild = true;
        var k = i + 1, neg = false, items = '', first = true, closed = false;
        if (p[k] === '!' || p[k] === '^') { neg = true; k++; }
        while (k < n) {
          var d = p[k];
          if (d === ']' && !first) { closed = true; break; }
          first = false;
          if (d === '[' && p[k + 1] === ':') {
            var e = p.indexOf(':]', k + 2);
            if (e > 0) {
              var nm = p.slice(k + 2, e);
              if (!POSIX[nm]) return null;
              items += POSIX[nm]; k = e + 2; continue;
            }
          }
          var lo;
          if (d === '\\') { if (k + 1 >= n) return null; lo = p[k + 1]; k += 2; } else { lo = d; k++; }
          if (p[k] === '-' && k + 1 < n && p[k + 1] !== ']') {
            var hi;
            if (p[k + 1] === '\\') { if (k + 2 >= n) return null; hi = p[k + 2]; k += 3; } else { hi = p[k + 1]; k += 2; }
            if (hi < lo) { return null; }
            items += clsChar(lo) + '-' + clsChar(hi);
          } else items += clsChar(lo);
        }
        if (!closed) return null;
        out += '(?!\\/)[' + (neg ? '^' : '') + items + ']'; i = k + 1;
      } else { out += lit(c); i++; }
    }
    return out;
  }

  function parse(text) {
    var rules = [], warnings = [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split('\n');
    lines.forEach(function (raw, idx) {
      var ln = idx + 1, s = raw;
      if (s === '' || s[0] === '#') return;
      // trailing spaces are dropped unless escaped with a backslash
      var e = s.length;
      while (e > 0 && s[e - 1] === ' ') {
        var bs = 0, q = e - 2; while (q >= 0 && s[q] === '\\') { bs++; q--; }
        if (bs % 2 === 1) break;
        e--;
      }
      s = s.slice(0, e);
      if (s === '') return;
      var neg = false;
      if (s[0] === '!') { neg = true; s = s.slice(1); }
      if (s === '') return;
      var dirOnly = false;
      if (s.length > 0 && s[s.length - 1] === '/') { dirOnly = true; s = s.slice(0, -1); }
      var anchored = s.indexOf('/') >= 0;
      if (s[0] === '/') s = s.slice(1);
      var src = globToRe(s), re = null;
      if (src === null) warnings.push('Line ' + ln + ': "' + raw + '" is not a valid pattern, so it never matches.');
      else re = new RegExp('^' + src + '$');
      rules.push({ line: ln, raw: raw.slice(0, e), neg: neg, dirOnly: dirOnly, anchored: anchored, re: re, invalid: re === null });
    });
    return { rules: rules, warnings: warnings };
  }

  function ruleMatches(r, rel, isDir) {
    if (r.invalid) return false;
    if (r.dirOnly && !isDir) return false;
    var subject = r.anchored ? rel : rel.slice(rel.lastIndexOf('/') + 1);
    return r.re.test(subject);
  }
  function decide(parsed, rel, isDir) {
    var ms = [];
    parsed.rules.forEach(function (r) { if (ruleMatches(r, rel, isDir)) ms.push(r); });
    var last = ms.length ? ms[ms.length - 1] : null;
    return { rule: last, ignored: !!last && !last.neg, matches: ms };
  }
  // path: "a/b/c.txt"; a trailing slash means "this is a directory".
  function normalizePath(p) {
    var isDir = false, s = p.replace(/^\s+/, '');
    while (s.indexOf('./') === 0) s = s.slice(2);
    s = s.replace(/\/{2,}/g, '/').replace(/^\//, '');
    if (s.length > 0 && s[s.length - 1] === '/') { isDir = true; s = s.slice(0, -1); }
    return { path: s, isDir: isDir };
  }
  function check(parsed, input, forceDir) {
    var np = normalizePath(input), rel = np.path, isDir = np.isDir || !!forceDir;
    if (!rel) return { error: 'Empty path' };
    var parts = rel.split('/'), trail = [];
    for (var i = 1; i < parts.length; i++) {
      var sub = parts.slice(0, i).join('/'), d = decide(parsed, sub, true);
      trail.push({ path: sub, rule: d.rule, ignored: d.ignored, matches: d.matches });
      if (d.ignored) return { path: rel, isDir: isDir, ignored: true, rule: d.rule, via: sub, matches: d.matches, trail: trail };
    }
    var f = decide(parsed, rel, isDir);
    return { path: rel, isDir: isDir, ignored: f.ignored, rule: f.rule, via: null, matches: f.matches, trail: trail };
  }
  var api = { parse: parse, check: check, globToRe: globToRe, normalizePath: normalizePath };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IgnoreWhy = api;
})(typeof window !== 'undefined' ? window : this);
