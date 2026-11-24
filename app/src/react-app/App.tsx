import { useEffect, useRef } from "react";
import { startUpdates } from "./pwa/update";
import { createStore } from "./store/store";
import { mountListView } from "./ui/list-view";

export default function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const store = createStore();
    const view = mountListView(host.current!, store);
    const stopUpdates = startUpdates(view.busy);
    return () => {
      stopUpdates();
      view.destroy();
      store.destroy();
    };
  }, []);

  return <div ref={host} style={{ display: "contents" }} />;
}
