      try {
        const preference = localStorage.getItem('forma-theme') || 'system';
        document.documentElement.dataset.theme = preference === 'system'
          ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference === 'bento-aurora' || preference === 'bento-space-gray' ? 'bento' : preference;
        document.documentElement.dataset.bentoVariant = preference === 'bento-aurora' ? 'aurora' : preference === 'bento-space-gray' ? 'space-gray' : '';
      } catch (_) {}

      // Boot watchdog (plain ES5, runs even if the app's JavaScript cannot): if Forma has not started within
      // 15 seconds, show what went wrong, clear the offline cache and service worker (a stuck cache can keep
      // the app files from loading), and reload by itself — at most twice per session.
      (function () {
        var bootError = '';
        var failedFiles = [];
        window.addEventListener('error', function (event) {
          if (window.__formaBooted) return;
          var target = event.target;
          // A file that could not load (script, style) reports on the element, not as a script error.
          if (target && target !== window && (target.src || target.href)) { failedFiles.push(target.src || target.href); return; }
          if (event.error || event.message) bootError = String((event.error && event.error.stack) || event.message);
        }, true);
        function resetOfflineCache() {
          var jobs = [];
          try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (list) { return Promise.all(list.map(function (r) { return r.unregister(); })); })); } catch (_) {}
          try { if (window.caches) jobs.push(caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })); } catch (_) {}
          // Never wait more than three seconds for the browser to clean up.
          return Promise.race([Promise.all(jobs), new Promise(function (resolve) { setTimeout(resolve, 3000); })]).catch(function () {});
        }
        window.__formaReset = function () { resetOfflineCache().then(function () { location.reload(); }); };
        setTimeout(function () {
          if (window.__formaBooted) return;
          var count = 0;
          try { count = Number(sessionStorage.getItem('forma-boot-reloads') || 0); } catch (_) {}
          var controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
          var detail = bootError || (failedFiles.length ? 'Kunde inte ladda: ' + failedFiles.join(', ') : 'Appens filer startade aldrig' + (controlled ? ' (offline-cachen styrde sidan)' : '') + '.');
          try { localStorage.setItem('forma-last-error', JSON.stringify({ message: detail, stack: '', source: 'boot', at: new Date().toISOString(), version: 'boot', userAgent: navigator.userAgent, url: location.pathname })); } catch (_) {}
          var root = document.getElementById('root');
          if (!root) return;
          root.innerHTML = '<main class="crash-screen" role="alert" data-testid="boot-failed"><div class="crash-card"><p class="crash-brand">forma.</p><h1>Forma startade inte</h1><p>Offline-cachen rensas och appen laddas om. Inget du sparat har försvunnit.</p><button class="button primary" type="button">Ladda om</button><p class="crash-auto"></p><details><summary>Teknisk information</summary><pre></pre></details></div></main>';
          root.querySelector('button').addEventListener('click', window.__formaReset);
          root.querySelector('pre').textContent = detail + '\n' + navigator.userAgent;
          if (count < 2) {
            root.querySelector('.crash-auto').textContent = 'Laddar om automatiskt om 5 s.';
            try { sessionStorage.setItem('forma-boot-reloads', String(count + 1)); } catch (_) {}
            setTimeout(window.__formaReset, 5000);
          } else {
            root.querySelector('.crash-auto').textContent = 'Tryck på Ladda om när du vill försöka igen.';
          }
        }, 15000);
      })();
