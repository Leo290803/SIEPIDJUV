import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AccountGate from "./AccountGate.jsx";
import "./style.css";
const Demo = lazy(() => import("./DemoApp.jsx"));
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Suspense
      fallback={
        <div className="account-shell">
          <p role="status">Carregando…</p>
        </div>
      }
    >
      <AccountGate Demo={Demo} />
    </Suspense>
  </BrowserRouter>,
);
