import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { InventoryProvider } from "./context/InventoryContext";
import { applySavedTheme } from "./lib/theme";
import "./index.css";

applySavedTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <InventoryProvider>
        <App />
      </InventoryProvider>
    </AuthProvider>
  </StrictMode>,
);
