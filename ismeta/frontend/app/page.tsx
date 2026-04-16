export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        gap: "0.75rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "2rem" }}>ISMeta — dev environment</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        Frontend skeleton. Реальные экраны появятся в эпиках E9+.
      </p>
      <p style={{ margin: 0, opacity: 0.5, fontSize: "0.875rem" }}>
        Backend health: <code>http://localhost:8000/health</code>
      </p>
    </main>
  );
}
