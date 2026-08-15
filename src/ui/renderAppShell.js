export function renderAppShell() {
  document.querySelector("#app").innerHTML = `
    <main class="amba-shell">
      <header>
        <h1>AMBA Owlbear</h1>
        <p id="status">Connecting...</p>
      </header>

      <section class="panel">
        <h2>Prototype</h2>
        <button id="testRoom">Test Owlbear Scene</button>
        <button id="testAmbaAuth">Test AMBA Auth</button>
        <button id="connectAmba">Connect AMBA</button>
        <p id="ambaAuthStatus" aria-live="polite"></p>
      </section>

      <section class="panel">
        <h2>AMBA PCs</h2>
        <label class="field-label" for="modulePicker">{current-user} module</label>
        <select id="modulePicker" disabled>
          <option>Loading modules...</option>
        </select>
        <button id="loadPcs" disabled>Load all PCs</button>
        <button id="importSheetImages" disabled>Import character sheet images</button>
        <div id="pcList"></div>
        <p id="importStatus" aria-live="polite"></p>
      </section>

      <section class="panel">
        <h2>AMBA Encounters</h2>
        <label class="field-label" for="actPicker">Act</label>
        <select id="actPicker" disabled>
          <option>Select an act first</option>
        </select>
        <label class="field-label" for="scenePicker">Scene</label>
        <select id="scenePicker" disabled>
          <option>Select an act first</option>
        </select>
        <label class="field-label" for="encounterPicker">Encounter</label>
        <select id="encounterPicker" disabled>
          <option>Select an act first</option>
        </select>
        <fieldset class="option-group">
          <legend>Export Options</legend>
          <label><input id="optionImportMap" type="checkbox" checked /> Push map</label>
          <label><input id="optionImportMonsterTokens" type="checkbox" checked /> Push monster tokens</label>
          <label><input id="optionImportStatCards" type="checkbox" checked /> Push monster stat cards</label>
          <label><input id="optionIncludePcTokens" type="checkbox" /> Push PC tokens</label>
        </fieldset>
        <button id="importEncounter" disabled>Import encounter</button>
        <button id="importQueuedExports">Import queued exports</button>
        <button id="clearAndImportQueuedExports">Clear scene and import queued exports</button>
        <button id="saveEncounterPlacements" disabled>Save token placements to AMBA</button>
        <div id="encounterDiagnostics" aria-live="polite"></div>
        <p id="encounterStatus" aria-live="polite"></p>
      </section>
    </main>
  `;
}
