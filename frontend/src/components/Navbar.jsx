import { Link, useLocation, useNavigate } from "react-router-dom";
import { ExportProject, ImportProject, ResetProject } from "../../wailsjs/go/main/App";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useProxyStore } from "../stores/useProxyStore";
import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import clsx from 'clsx';
import netraxLogo from '../assets/images/netrax.png';
import {
    LayoutDashboard,
    History,
    Zap,
    ShieldAlert,
    Repeat,
    Code2,
    SlidersHorizontal,
    GitCompareArrows,
    Bot,
    Check,
    Moon,
    Sun,
    Settings as SettingsIcon
} from 'lucide-react';

const VISIBLE_SECTIONS_STORAGE_KEY = "netrax-visible-nav-sections";

const MAIN_NAV_ITEMS = [
    { id: "dashboard", to: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
    { id: "agent", to: "/agent", label: "Agent Chat", icon: "bot" },
    { id: "history", to: "/history", label: "History", icon: "history" },
    { id: "intercept", to: "/intercept", label: "Interceptor", icon: "shield-alert" },
    { id: "repeater", to: "/repeater", label: "Repeater", icon: "repeat" },
    { id: "decoder", to: "/decoder", label: "Decoder", icon: "code-2" },
    { id: "comparer", to: "/comparer", label: "Comparer", icon: "git-compare-arrows" },
    { id: "mcp", to: "/mcp", label: "MCP Server", icon: "bot" },
    { id: "setup", to: "/setup", label: "Setup", icon: "sliders-horizontal" }
];

const SETTINGS_ITEM = { id: "settings", to: "/settings", label: "Settings" };

function loadVisibleSections() {
    const defaults = Object.fromEntries(
        [...MAIN_NAV_ITEMS, SETTINGS_ITEM].map((item) => [item.id, true])
    );

    const raw = localStorage.getItem(VISIBLE_SECTIONS_STORAGE_KEY);
    if (!raw) return defaults;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return defaults;

        const merged = { ...defaults };
        for (const key of Object.keys(merged)) {
            if (typeof parsed[key] === "boolean") {
                merged[key] = parsed[key];
            }
        }
        return merged;
    } catch {
        return defaults;
    }
}

export default function Navbar({ theme, onToggleTheme }) {
    const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
    const fileMenuRef = useRef(null);
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const viewMenuRef = useRef(null);
    const [visibleSections, setVisibleSections] = useState(loadVisibleSections);
    const navigate = useNavigate();
    const location = useLocation();

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
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target)) {
                setIsViewMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        localStorage.setItem(VISIBLE_SECTIONS_STORAGE_KEY, JSON.stringify(visibleSections));
    }, [visibleSections]);

    const visibleMainNavItems = MAIN_NAV_ITEMS.filter((item) => visibleSections[item.id]);
    const isSettingsVisible = visibleSections[SETTINGS_ITEM.id];

    useEffect(() => {
        const allItems = [...MAIN_NAV_ITEMS, SETTINGS_ITEM];
        const activeItem = allItems.find((item) => location.pathname.startsWith(item.to));
        if (!activeItem || visibleSections[activeItem.id]) return;

        const fallback = visibleMainNavItems[0]?.to || (isSettingsVisible ? SETTINGS_ITEM.to : "/dashboard");
        if (fallback !== location.pathname) {
            navigate(fallback, { replace: true });
        }
    }, [location.pathname, visibleSections, visibleMainNavItems, isSettingsVisible, navigate]);

    const closeMenu = () => setIsFileMenuOpen(false);

    const openModal = (config) => {
        setModalConfig({ ...config, isOpen: true });
        closeMenu();
    };

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const toggleSectionVisibility = (sectionId) => {
        setVisibleSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

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
        <header className="w-full glass border-b border-white/6 flex flex-col shrink-0 relative z-40">
            <Modal {...modalConfig} onClose={closeModal} />

            <div className="flex items-center gap-6 px-4 h-12 border-b border-white/4 bg-background-dark">
                <div className="flex items-center">
                    <img
                        src={netraxLogo}
                        alt="NetraX"
                        className="h-32 w-32 object-contain"
                    />
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
                            <div className="absolute top-full left-0 mt-1 w-48 glass border border-white/8 rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                <button onClick={handleExport} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs">
                                    Save Project...
                                </button>
                                <button onClick={handleImport} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-text-secondary hover:text-white transition-colors text-xs">
                                    Open Project...
                                </button>
                                <div className="h-px bg-white/6 my-0.5" />
                                <button onClick={handleReset} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-accent-red hover:text-red-300 transition-colors text-xs">
                                    New Project (Reset)
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="relative" ref={viewMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                            className={clsx(
                                "hover:text-white transition-colors py-2 px-1 rounded-sm",
                                isViewMenuOpen ? "text-white bg-white/5" : ""
                            )}
                        >
                            View
                        </button>
                        {isViewMenuOpen && (
                            <div className="absolute top-full left-0 mt-1 w-60 glass border border-white/8 rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden p-2">
                                {[...MAIN_NAV_ITEMS, SETTINGS_ITEM].map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => toggleSectionVisibility(item.id)}
                                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-xs text-text-secondary hover:text-white cursor-pointer select-none text-left"
                                        aria-pressed={!!visibleSections[item.id]}
                                    >
                                        <span>{item.label}</span>
                                        <span className="w-4 h-4 flex items-center justify-center text-primary">
                                            {visibleSections[item.id] ? <Check size={14} /> : null}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </nav>
            </div>

            <div className="flex items-center px-4 h-12 gap-4 bg-panel-dark">
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {visibleMainNavItems.map((item) => (
                        <InternalNavItem key={item.id} to={item.to} label={item.label} icon={item.icon} />
                    ))}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onToggleTheme}
                        className="p-2 text-text-secondary hover:text-text-primary rounded-md hover:bg-white/5 transition-colors"
                        title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
                    >
                        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    {isSettingsVisible && (
                        <Link
                            to="/settings"
                            className="p-2 text-text-secondary hover:text-text-primary rounded-md hover:bg-white/5 transition-colors block"
                            title="Settings"
                        >
                            <SettingsIcon size={18} />
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}


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
        'sliders-horizontal': SlidersHorizontal,
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
