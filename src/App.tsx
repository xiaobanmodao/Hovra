function App() {
  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">Browser-only interaction</p>
        <h1>Hand Gesture Control</h1>
        <p>Recognition stays in this browser.</p>
      </header>

      <section className="gesture-workspace" aria-label="Gesture control workspace">
        <p>Camera preview and gesture controls will appear here.</p>
      </section>
    </main>
  );
}

export default App;
