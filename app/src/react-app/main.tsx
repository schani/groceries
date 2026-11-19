import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// iOS's own home-screen signal; styles.css accepts it as well as (display-mode: standalone)
if ((navigator as Navigator & { standalone?: boolean }).standalone === true) document.documentElement.classList.add("standalone");

createRoot(document.getElementById("root")!).render(<App />);
