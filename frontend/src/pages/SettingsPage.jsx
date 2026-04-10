import { useState, useEffect } from 'react';
import { GetSettings, SaveSettings, GetCAInfo, RegenerateCA } from '../../wailsjs/go/main/App';
import { Shield, Settings as SettingsIcon, Save, RefreshCw, AlertTriangle, Download, Check } from 'lucide-react';
import Modal from '../components/Modal';

export default function SettingsPage() {
    const [settings, setSettings] = useState({ proxyPort: 8080, proxyAddr: '127.0.0.1' });
    const [caInfo, setCaInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Modal state for CA regeneration
    const [showModal, setShowModal] = useState(false);
    const [regenLoading, setRegenLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const s = await GetSettings();
            setSettings(s || { proxyPort: 8080, proxyAddr: '127.0.0.1' });
            const ca = await GetCAInfo();
            setCaInfo(ca);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await SaveSettings({
                proxyPort: parseInt(settings.proxyPort) || 8080,
                proxyAddr: settings.proxyAddr
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error(e);
        }
        setSaving(false);
    };

    const handleRegenerateCA = async () => {
        setRegenLoading(true);
        try {
            await RegenerateCA("NetraX Custom CA");
            await loadData();
        } catch (e) {
            console.error(e);
        }
        setRegenLoading(false);
        setShowModal(false);
    };

    if (loading) {
        return <div className="flex-1 bg-background-dark flex items-center justify-center text-text-secondary">Loading...</div>;
    }

    return (
        <div className="flex-1 bg-background-dark p-8 overflow-y-auto w-full h-full custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                        <SettingsIcon size={24} className="text-primary" />
                        Settings
                    </h1>
                    <p className="text-sm text-text-secondary">
                        Configure NetraX proxy behavior and manage SSL certificates.
                    </p>
                </div>

                {/* Proxy Bindings Section */}
                <div className="glass border border-white/[0.04] rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 border-b border-white/[0.04] bg-[#0c101c]">
                        <h2 className="text-base font-semibold text-white flex items-center gap-2">
                            <Shield size={18} className="text-primary" />
                            Proxy Bindings
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                    Bind Address
                                </label>
                                <input
                                    type="text"
                                    value={settings.proxyAddr}
                                    onChange={(e) => setSettings({ ...settings, proxyAddr: e.target.value })}
                                    className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                                    placeholder="127.0.0.1"
                                />
                                <p className="mt-1.5 text-xs text-text-secondary/60">
                                    The interface IP address the proxy will listen on. Use 0.0.0.0 for all interfaces.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                    Listening Port
                                </label>
                                <input
                                    type="number"
                                    value={settings.proxyPort}
                                    onChange={(e) => setSettings({ ...settings, proxyPort: e.target.value })}
                                    className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                                    placeholder="8080"
                                />
                                <p className="mt-1.5 text-xs text-text-secondary/60">
                                    The port number the proxy will bind to (1-65535).
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-white/[0.04]">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
                            >
                                {saving ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : saved ? (
                                    <Check size={16} />
                                ) : (
                                    <Save size={16} />
                                )}
                                {saved ? "Saved & Restarted" : "Save Settings"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* CA Certificate Section */}
                <div className="glass border border-white/[0.04] rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 border-b border-white/[0.04] bg-[#0c101c]">
                        <h2 className="text-base font-semibold text-white flex items-center gap-2">
                            <Shield size={18} className="text-accent-green" />
                            CA Certificate Management
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="bg-background-dark border border-panel-border rounded-lg p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-medium text-white mb-1">Current Root Certificate</h3>
                                    {caInfo?.exists ? (
                                        <div className="space-y-2 mt-3">
                                            <div className="flex items-center gap-3 text-xs">
                                                <span className="text-text-secondary w-20">Status:</span>
                                                <span className="text-accent-green flex items-center gap-1.5 font-medium">
                                                    <Check size={14} /> Installed and actively used
                                                </span>
                                            </div>
                                            <div className="flex gap-3 text-xs">
                                                <span className="text-text-secondary w-20 shrink-0">Path:</span>
                                                <code className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded break-all">
                                                    {caInfo.path}
                                                </code>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-accent-red mt-2">
                                            <AlertTriangle size={16} />
                                            <span>Certificate missing or inaccessible!</span>
                                            <span className="text-text-secondary text-xs ml-2">({caInfo?.errorMsg})</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-4 border-t border-white/[0.04]">
                            <button
                                onClick={() => setShowModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-panel-dark border border-accent-red/30 text-accent-red hover:bg-accent-red/10 text-sm font-medium rounded-lg transition-all"
                            >
                                <RefreshCw size={16} />
                                Regenerate CA
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await window.go.main.App.ExportCACertificate();
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-panel-dark border border-primary/30 text-primary hover:bg-primary/10 text-sm font-medium rounded-lg transition-all"
                            >
                                <Download size={16} />
                                Export Cert
                            </button>
                            <p className="text-xs text-text-secondary max-w-lg mt-1">
                                Regenerating the CA will break trust for any apps or browsers that have installed the current certificate. You will need to install the new certificate.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onConfirm={handleRegenerateCA}
                title="Regenerate Root Certificate?"
                message="Are you completely sure? Generating a new CA will instantly break trust for any clients that installed the old certificate. You will have to export and install the new certificate on your device/browser again."
                confirmText={regenLoading ? "Regenerating..." : "Yes, Regenerate"}
                cancelText="Cancel"
                type="danger"
            />
        </div>
    );
}
