export function renderAppShell() {
  document.querySelector("#app").innerHTML = `
    <main class="amba-shell">
      <header>
        <h1>AMBA Owlbear</h1>
        <p id="status">Connecting...</p>
      </header>

      <section class="panel">
        <h2>Prototype</h2>
        <button id="testRoom">Test Room Access</button>
      </section>

      <section class="panel">
        <h2>AMBA PCs</h2>
        <label class="field-label" for="modulePicker">Test-user module</label>
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
        <label class="field-label" for="encounterPicker">Encounter</label>
        <select id="encounterPicker" disabled>
          <option>Select a module first</option>
        </select>
        <button id="importEncounter" disabled>Import encounter</button>
        <button id="importQueuedExports">Import queued exports</button>
        <p id="encounterStatus" aria-live="polite"></p>
      </section>
    </main>
  `;
}
