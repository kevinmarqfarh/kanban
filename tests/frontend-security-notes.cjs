const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/notes.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent('<div id="output"></div>');
    const result = await page.evaluate(code => {
      const exports = {};
      new Function('exports', code)(exports);
      const { sanitizeNoteHtml, notePlainText } = exports;
      const output = document.getElementById('output');
      const failures = [];
      const check = (condition, message) => { if (!condition) failures.push(message); };
      const allowed = new Set(['DIV', 'P', 'BR', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'A']);
      const payloads = [
        '<script>window.frontendSecurityAttack=true</script><p onclick="window.frontendSecurityAttack=true">Keep</p>',
        '<img src="https://example.invalid/security-image" onerror="window.frontendSecurityAttack=true">',
        '<iframe src="https://example.invalid/security-frame"></iframe><object data="https://example.invalid/security-object"></object>',
        '<style>@import "https://example.invalid/security-style";</style><link rel="stylesheet" href="https://example.invalid/security-link">',
        '<svg><a xlink:href="javascript:window.frontendSecurityAttack=true"><text>SVG</text></a></svg>',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=window.frontendSecurityAttack=true>">',
        '<noscript><p title="</noscript><img src=x onerror=window.frontendSecurityAttack=true>">text</p>',
        '<form id="output"><input name="innerHTML"><button formaction="javascript:window.frontendSecurityAttack=true">text</button></form>',
        '<template><img src="https://example.invalid/security-template"></template>',
        '<a href="javascript:window.frontendSecurityAttack=true">JS</a><a href="java&#10;script:alert(1)">Encoded</a><a href="data:text/html,x">Data</a>',
        '<a data-note-kind="__proto__" data-note-target="x" href="javascript:alert(1)">Unknown</a>',
        '<p style="background:url(https://example.invalid/security-background)" id="clobber" onmouseover="window.frontendSecurityAttack=true">Text</p>',
      ];
      for (const [index, html] of payloads.entries()) {
        output.innerHTML = sanitizeNoteHtml(html);
        for (const node of output.querySelectorAll('*')) {
          check(allowed.has(node.tagName), `payload ${index}: unexpected ${node.tagName}`);
          check(node.attributes.length === 0, `payload ${index}: untrusted attribute survived`);
        }
      }
      check(sanitizeNoteHtml('<h1>Title</h1><p><b>Bold</b> <em>Italic</em></p><ul><li>Item</li></ul>') === '<h1>Title</h1><p><b>Bold</b> <em>Italic</em></p><ul><li>Item</li></ul>', 'rich text formatting must survive');
      for (const kind of exports.noteLinkKinds) {
        const id = 'javascript:alert(1)/?x="&🍋';
        output.innerHTML = sanitizeNoteHtml(`<a data-note-kind="${kind}" data-note-target="javascript:alert(1)/?x=&quot;&amp;🍋" href="javascript:alert(1)" onclick="window.frontendSecurityAttack=true">Link</a>`);
        const anchor = output.querySelector('a');
        check(anchor?.getAttribute('href') === `#forma/${kind}/${encodeURIComponent(id)}`, `${kind}: internal link must be encoded and confined to a fragment`);
        check(anchor?.dataset.noteTarget === id && anchor?.getAttribute('contenteditable') === 'false', `${kind}: preserve valid target`);
        check(anchor?.attributes.length === 4, `${kind}: copy only trusted attributes`);
      }
      for (const id of ['', ' ', 'x'.repeat(201), '\ud800', '\udfff', 'prefix\ud800suffix']) {
        const html = `<p>Before <a data-note-kind="task" data-note-target="${id}"><b>Link text</b></a> after</p>`;
        try {
          const sanitized = sanitizeNoteHtml(html);
          check(sanitized === '<p>Before <b>Link text</b> after</p>', 'invalid target must become text, retaining inline formatting');
          check(notePlainText(html) === 'Before Link text after', 'invalid target must not break note previews/search');
        } catch (error) { failures.push(`invalid target ${JSON.stringify(id)} threw ${error.name}`); }
      }
      output.innerHTML = sanitizeNoteHtml('<p>&lt;img src=x onerror=alert(1)&gt; &amp; safe</p>');
      check(!output.querySelector('img') && output.textContent === '<img src=x onerror=alert(1)> & safe', 'escaped markup must remain text');
      return { failures };
    }, compiled);
    // Give resource-loading and event-handler tasks a chance to run.
    await page.waitForTimeout(100);
    assert.deepEqual(result.failures, []);
    assert.equal(await page.evaluate(() => !!window.frontendSecurityAttack), false);
    assert.deepEqual(requests, [], 'sanitizing or displaying a note must not request external resources');
    console.log(`PASS ${engine.name()}: note sanitizer XSS corpus, URL confinement, inert resource handling, formatting and malformed UTF-16 targets`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
