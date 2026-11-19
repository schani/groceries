import { useEffect, useRef } from "react";
import { startDiagnostics } from "./diag/report";
import { startUpdates } from "./pwa/update";
import { createStore } from "./store/store";
import { mountListView } from "./ui/list-view";

export default function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const store = createStore();
    const view = mountListView(host.current!, store);
    const stopUpdates = startUpdates(view.busy);
    const stopDiagnostics = startDiagnostics();
    return () => {
      stopDiagnostics();
      stopUpdates();
      view.destroy();
      store.destroy();
    };
  }, []);

  return <div ref={host} style={{ display: "contents" }} />;
}
