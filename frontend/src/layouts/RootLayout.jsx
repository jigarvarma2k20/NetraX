import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useEffect, useState, useRef } from "react";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useProxyStore } from "../stores/useProxyStore";
import { EventsOn } from "../../wailsjs/runtime/runtime";

export default function RootLayout() {
    const startHistoryListening = useHistoryStore(state => state.startListening);
    const addPendingRequest = useProxyStore(state => state.addPendingRequest);
    const addPendingResponse = useProxyStore(state => state.addPendingResponse);

    const [uptime, setUptime] = useState("0s");
    const mountTime = useRef(Date.now());

    useEffect(() => {
        startHistoryListening();

        const cancelRequest = EventsOn("interceptedRequest", (id) => {
            addPendingRequest(id);
        });

        const cancelResponse = EventsOn("interceptedResponse", (id) => {
            addPendingResponse(id);
        });

        const cancelStatus = EventsOn("interceptStatus", (enabled) => {
            useProxyStore.getState().setInterceptStatus(enabled);
        });

        // Real uptime counter
        const uptimeInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - mountTime.current) / 1000);
            if (elapsed < 60) setUptime(`${elapsed}s`);
            else if (elapsed < 3600) setUptime(`${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
            else setUptime(`${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`);
        }, 1000);

        return () => {
            if (cancelRequest) cancelRequest();
            if (cancelResponse) cancelResponse();
            if (cancelStatus) cancelStatus();
            clearInterval(uptimeInterval);
        };

    }, []);

    return (
        <div className="flex flex-col h-screen w-full bg-background-dark text-text-primary font-sans selection:bg-primary/20">
            <Navbar />
            <main className="flex-1 overflow-hidden relative px-4 pb-4 pt-4">
                <div className="h-full w-full overflow-hidden">
                    <Outlet />
                </div>
            </main>

            {/* Status Bar */}
            <footer className="h-6 bg-[#0c101c] border-t border-white/6 flex items-center px-4 text-[10px] text-text-secondary/60 shrink-0 select-none">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                        <span>Ready</span>
                    </div>
                    <span className="text-primary/60">NetraX v1.0.0</span>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <span>Up: {uptime}</span>
                </div>
            </footer>
        </div>
    );
}
