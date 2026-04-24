import { Link, useLocation } from "react-router-dom";
import { ExportProject, ImportProject, ResetProject } from "../../wailsjs/go/main/App";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useProxyStore } from "../stores/useProxyStore";
import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import clsx from 'clsx';

export default function Navbar() {
    const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
    const fileMenuRef = useRef(null);

    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: "",
        message: "",
        type: "info",
        onConfirm: null
    });

    useEffect(() => {
        function handleClickOutside(event) {
            if (fileMenuRef.current && !fileMenuRef.current.contains(event.target)) {
                setIsFileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const closeMenu = () => setIsFileMenuOpen(false);

    const openModal = (config) => {
        setModalConfig({ ...config, isOpen: true });
        closeMenu();
    };

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const handleExport = async () => {
        closeMenu();
        try {
            await ExportProject();
            openModal({
                title: "Success",
                message: "Project exported successfully!",
                type: "success",
                onConfirm: null,
                cancelText: "Close"
            });
        } catch (e) {
            openModal({
                title: "Error",
                message: "Failed to export project: " + e,
                type: "danger",
                cancelText: "Close"
            });
        }
    };

    const refreshState = () => {
        useProxyStore.getState().reset();
        const historyStore = useHistoryStore.getState();
        historyStore.reset();
        historyStore.loadMore();
    };

    const handleImport = () => {
        closeMenu();
        openModal({
            title: "Import Project",
            message: "This will overwrite your current session. Do you want to continue?",
            type: "warning",
            confirmText: "Import",
            onConfirm: async () => {
                try {
                    await ImportProject();
                    refreshState();
                } catch (e) {
                    alert("Import failed: " + e);
                }
            }
        });
    };

    const handleReset = () => {
        closeMenu();
        openModal({
            title: "New Project",
            message: "Are you sure you want to start a new project? All unsaved data will be lost.",
            type: "danger",
            confirmText: "Create New",
            onConfirm: async () => {
                try {
                    await ResetProject();
                    refreshState();
                } catch (e) {
                    // silently handle
                }
            }
        });
    };

    return (
        <header className="w-full glass border-b border-white/[0.06] flex flex-col shrink-0 relative z-40">
            <Modal {...modalConfig} onClose={closeModal} />

            <div className="flex items-center gap-6 px-4 h-12 border-b border-white/[0.04] bg-[#0c101c]">
                <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                    <span className="font-bold text-primary text-sm tracking-wide">NetraX</span>
                </div>

                <nav className="flex items-center gap-7 text-xs font-medium text-text-secondary relative">
                    <div className="relative" ref={fileMenuRef}>
                        <button
                            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                            className={clsx(
                                "hover:text-white transition-colors py-2 px-1 rounded-sm",
                                isFileMenuOpen ? "text-white bg-white/5" : ""
                            )}
                        >
                            File
                        </button>
                        {isFileMenuOpen && (
                            <div className="absolute top-full left-0 mt-1 w-48 glass border border-white/[0.08] rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                <button onClick={handleExport} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs">
                                    Save Project...
                                </button>
                                <button onClick={handleImport} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs">
                                    Open Project...
                                </button>
                                <div className="h-px bg-white/[0.06] my-0.5" />
                                <button onClick={handleReset} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-accent-red hover:text-red-300 transition-colors text-xs">
                                    New Project (Reset)
                                </button>
                            </div>
                        )}
                    </div>
                    <Link to="" className="hover:text-white no-underline transition-colors">View</Link>
                    <Link to="" className="hover:text-white no-underline transition-colors">Preferences</Link>
                </nav>
            </div>

            <div className="flex items-center px-4 h-12 gap-4 bg-panel-dark">
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    <InternalNavItem to="/dashboard" label="Dashboard" icon="layout-dashboard" />
                    <InternalNavItem to="/history" label="History" icon="history" />
                    <InternalNavItem to="/intruder" label="Intruder" icon="zap" />
                    <InternalNavItem to="/intercept" label="Interceptor" icon="shield-alert" />
                    <InternalNavItem to="/repeater" label="Repeater" icon="repeat" />
                    <InternalNavItem to="/decoder" label="Decoder" icon="code-2" />
                    <InternalNavItem to="/comparer" label="Comparer" icon="git-compare-arrows" />
                    <InternalNavItem to="/mcp" label="MCP Server" icon="bot" />
                    <InternalNavItem to="/agent" label="Agent API" icon="bot" />
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    <Link
                        to="/settings"
                        className="p-2 text-text-secondary hover:text-white rounded-md hover:bg-white/5 transition-colors block"
                        title="Settings"
                    >
                        <SettingsIcon size={18} />
                    </Link>
                </div>
            </div>
        </header>
    );
}

import {
    LayoutDashboard,
    History,
    Zap,
    ShieldAlert,
    Repeat,
    Code2,
    GitCompareArrows,
    Settings as SettingsIcon,
    Bot
} from 'lucide-react';

const InternalNavItem = ({ to, icon, label, badge }) => {
    const location = useLocation();
    const isActive = location.pathname.startsWith(to);

    const IconMap = {
        'layout-dashboard': LayoutDashboard,
        'history': History,
        'zap': Zap,
        'shield-alert': ShieldAlert,
        'repeat': Repeat,
        'code-2': Code2,
        'git-compare-arrows': GitCompareArrows,
        'settings': SettingsIcon,
        'bot': Bot
    };
    const IconComp = IconMap[icon] || Code2;

    return (
        <Link
            to={to}
            className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline whitespace-nowrap",
                isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            )}
        >
            <IconComp size={16} />
            <span>{label}</span>
            {badge && (
                <span className="bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1.5">
                    {badge}
                </span>
            )}
        </Link>
    );
};
