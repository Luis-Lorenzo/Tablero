import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [apiStatus, setApiStatus] = useState("Comprobando API...");

  useEffect(() => {
    fetch("/api/health")
      .then(response => {
        if (!response.ok) throw new Error("API no disponible");
        return response.json();
      })
      .then(data => setApiStatus(`API: ${data.status}`))
      .catch(() => setApiStatus("No se pudo conectar con la API"));
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">TU ESPACIO DE AVENTURAS</p>
        <h1>Las historias empiezan aquí.</h1>
        <p className="description">
          Estamos preparando un espacio para crear mundos,
          compartir cartas y jugar tus propias campañas de rol.
        </p>
        <div className="status">{apiStatus}</div>
        <p className="note">
          Proyecto en desarrollo · Primera versión
        </p>
      </section>
    </main>
  );
}

export default App;
