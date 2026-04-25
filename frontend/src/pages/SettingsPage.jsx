import { useState, useEffect } from 'react';
import { GetSettings, SaveSettings, GetCAInfo, RegenerateCA, CheckProxyBindingsAvailability } from '../../wailsjs/go/main/App';
import { Shield, Settings as SettingsIcon, Save, RefreshCw, AlertTriangle, Download, Check, Plus, Trash2, XCircle } from 'lucide-react';
import Modal from '../components/Modal';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        proxyPort: 8080,
        proxyAddr: '127.0.0.1',
        proxyBindings: [{ address: '127.0.0.1', port: 8080 }]
    });
    const [caInfo, setCaInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState('idle'); // idle | dirty | saving | saved | error
    const [saveError, setSaveError] = useState('');
    const [checkingBindings, setCheckingBindings] = useState(false);
    const [bindingStatus, setBindingStatus] = useState({});
    const [savedBindingsSignature, setSavedBindingsSignature] = useState('[]');

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
            const resolvedBindings = Array.isArray(s?.proxyBindings) && s.proxyBindings.length > 0
                ? s.proxyBindings.map((b) => ({
                    address: b.address || '127.0.0.1',
                    port: parseInt(b.port) || 8080
                }))
                : [{
                    address: s?.proxyAddr || '127.0.0.1',
                    port: parseInt(s?.proxyPort) || 8080
                }];

            const primary = resolvedBindings[0] || { address: '127.0.0.1', port: 8080 };
            setSettings({
                proxyPort: parseInt(primary.port) || 8080,
                proxyAddr: primary.address || '127.0.0.1',
                proxyBindings: resolvedBindings
            });
            setSavedBindingsSignature(JSON.stringify(normalizeBindingsForCheck(resolvedBindings)));
            const ca = await GetCAInfo();
            setCaInfo(ca);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const normalizeBindingsForCheck = (bindings) => {
        const candidate = Array.isArray(bindings) && bindings.length > 0
            ? bindings
            : [{ address: '127.0.0.1', port: 8080 }];

        return candidate.map((binding) => ({
            address: (binding.address || '').trim() || '127.0.0.1',
            port: parseInt(binding.port) || 8080
        }));
    };

    const isWildcardAddress = (address) => {
        const value = (address || '').trim();
        return value === '0.0.0.0' || value === '::' || value === '[::]';
    };

    const isValidAddress = (address) => {
        const value = (address || '').trim();
        if (!value) {
            return false;
        }
        if (value === 'localhost') {
            return true;
        }

        const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
        const hostname = /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(\.(?!-)[a-zA-Z0-9-]{1,63})*$/;
        const ipv6Loose = /^\[?[0-9a-fA-F:]+\]?$/;

        return ipv4.test(value) || hostname.test(value) || ipv6Loose.test(value);
    };

    const buildBindingsValidation = (bindings) => {
        const rows = Array.isArray(bindings) && bindings.length > 0
            ? bindings
            : [{ address: '127.0.0.1', port: 8080 }];

        const errorsByIndex = {};
        const normalizedRows = rows.map((binding) => ({
            address: (binding.address || '').trim(),
            port: Number(binding.port)
        }));

        normalizedRows.forEach((row, index) => {
            const rowErrors = [];
            if (!row.address) {
                rowErrors.push('Address is required.');
            } else if (!isValidAddress(row.address)) {
                rowErrors.push('Address format is invalid.');
            }

            if (!Number.isInteger(row.port) || row.port < 1 || row.port > 65535) {
                rowErrors.push('Port must be an integer between 1 and 65535.');
            }

            if (rowErrors.length > 0) {
                errorsByIndex[index] = rowErrors;
            }
        });

        for (let i = 0; i < normalizedRows.length; i += 1) {
            for (let j = i + 1; j < normalizedRows.length; j += 1) {
                const a = normalizedRows[i];
                const b = normalizedRows[j];

                const aValid = !errorsByIndex[i];
                const bValid = !errorsByIndex[j];
                if (!aValid || !bValid) {
                    continue;
                }

                if (a.address === b.address && a.port === b.port) {
                    errorsByIndex[i] = [...(errorsByIndex[i] || []), 'Duplicate binding found.'];
                    errorsByIndex[j] = [...(errorsByIndex[j] || []), 'Duplicate binding found.'];
                }

                if (a.port === b.port && (isWildcardAddress(a.address) || isWildcardAddress(b.address))) {
                    errorsByIndex[i] = [...(errorsByIndex[i] || []), 'Wildcard address conflicts with another binding on this port.'];
                    errorsByIndex[j] = [...(errorsByIndex[j] || []), 'Wildcard address conflicts with another binding on this port.'];
                }
            }
        }

        const hasErrors = Object.keys(errorsByIndex).length > 0;
        return { errorsByIndex, hasErrors };
    };

    const bindingKey = (binding) => {
        const address = (binding.address || '').trim() || '127.0.0.1';
        const port = parseInt(binding.port) || 8080;
        return `${address}:${port}`;
    };

    const currentBindingsSignature = JSON.stringify(normalizeBindingsForCheck(settings.proxyBindings || []));
    const hasUnsavedBindingChanges = currentBindingsSignature !== savedBindingsSignature;
    const bindingValidation = buildBindingsValidation(settings.proxyBindings || []);

    const hasKnownUnavailableBinding = normalizeBindingsForCheck(settings.proxyBindings || []).some((binding) => {
        const status = bindingStatus[bindingKey(binding)];
        return status && !status.available;
    });

    const canSave = hasUnsavedBindingChanges
        && !bindingValidation.hasErrors
        && !hasKnownUnavailableBinding
        && !checkingBindings
        && saveState !== 'saving';

    const refreshBindingAvailability = async (bindings) => {
        setCheckingBindings(true);
        try {
            const normalized = normalizeBindingsForCheck(bindings);
            const result = await CheckProxyBindingsAvailability(normalized);
            const map = {};
            (result || []).forEach((item) => {
                map[`${item.address}:${item.port}`] = item;
            });
            setBindingStatus(map);
        } catch (e) {
            console.error(e);
        }
        setCheckingBindings(false);
    };

    useEffect(() => {
        if (loading) {
            return;
        }

        if (bindingValidation.hasErrors) {
            setCheckingBindings(false);
            setBindingStatus({});
            return;
        }

        const timer = setTimeout(() => {
            refreshBindingAvailability(settings.proxyBindings || []);
        }, 220);

        return () => clearTimeout(timer);
    }, [settings.proxyBindings, loading, bindingValidation.hasErrors]);

    const handleSave = async () => {
        if (!canSave) {
            return;
        }

        setSaveState('saving');
        setSaveError('');
        try {
            const cleanedBindings = normalizeBindingsForCheck(settings.proxyBindings || [])
                .map((binding) => ({
                    address: (binding.address || '').trim() || '127.0.0.1',
                    port: parseInt(binding.port) || 8080
                }))
                .filter((binding) => binding.port >= 1 && binding.port <= 65535);

            const nextBindings = cleanedBindings.length > 0
                ? cleanedBindings
                : [{ address: '127.0.0.1', port: 8080 }];

            const primary = nextBindings[0];
            await SaveSettings({
                proxyPort: parseInt(primary.port) || 8080,
                proxyAddr: primary.address || '127.0.0.1',
                proxyBindings: nextBindings
            });
            setSettings({
                proxyPort: parseInt(primary.port) || 8080,
                proxyAddr: primary.address || '127.0.0.1',
                proxyBindings: nextBindings
            });
            setSavedBindingsSignature(JSON.stringify(normalizeBindingsForCheck(nextBindings)));
            setSaveState('saved');
            setTimeout(() => {
                setSaveState('idle');
            }, 1800);
        } catch (e) {
            console.error(e);
            setSaveState('error');
            setSaveError(e?.message || 'Failed to save settings.');
        }
    };

    const updateBinding = (index, key, value) => {
        setSettings((prev) => {
            const nextBindings = [...(prev.proxyBindings || [])];
            nextBindings[index] = {
                ...nextBindings[index],
                [key]: value
            };

            const primary = nextBindings[0] || { address: '127.0.0.1', port: 8080 };
            return {
                ...prev,
                proxyBindings: nextBindings,
                proxyAddr: primary.address,
                proxyPort: primary.port
            };
        });
        if (saveState !== 'saving') {
            setSaveState('dirty');
            setSaveError('');
        }
    };

    const addBinding = () => {
        setSettings((prev) => ({
            ...prev,
            proxyBindings: [...(prev.proxyBindings || []), { address: '127.0.0.1', port: 8080 }]
        }));
        if (saveState !== 'saving') {
            setSaveState('dirty');
            setSaveError('');
        }
    };

    const removeBinding = (index) => {
        setSettings((prev) => {
            const currentBindings = [...(prev.proxyBindings || [])];
            if (currentBindings.length <= 1) {
                return prev;
            }
            currentBindings.splice(index, 1);
            const primary = currentBindings[0] || { address: '127.0.0.1', port: 8080 };
            return {
                ...prev,
                proxyBindings: currentBindings,
                proxyAddr: primary.address,
                proxyPort: primary.port
            };
        });
        if (saveState !== 'saving') {
            setSaveState('dirty');
            setSaveError('');
        }
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

    const saveLabel = saveState === 'saving'
        ? 'Saving...'
        : saveState === 'saved'
            ? 'Saved & Restarted'
            : saveState === 'error'
                ? 'Retry Save'
                : 'Save Settings';

    return (
        <div className="flex-1 bg-background-dark p-8 overflow-y-auto w-full h-full custom-scrollbar">
            <div className="w-full space-y-8">
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
                        <div className="space-y-4">
                            {(settings.proxyBindings || []).map((binding, index) => {
                                const status = bindingStatus[bindingKey(binding)];
                                const title = status?.available
                                    ? 'Available: address:port can be bound'
                                    : (status?.error || (checkingBindings ? 'Checking availability...' : 'Availability unknown'));
                                const validationMessage = bindingValidation.errorsByIndex[index]?.[0];
                                const availabilityError = !checkingBindings && status && !status.available && status.error
                                    ? status.error
                                    : '';
                                const inlineErrorMessage = validationMessage || availabilityError;

                                return (
                                    <div key={`binding-${index}`} className="space-y-1">
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto_auto] gap-4 items-end">
                                            <div>
                                                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                                    Bind Address {index === 0 ? '(Primary)' : ''}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={binding.address}
                                                    onChange={(e) => updateBinding(index, 'address', e.target.value)}
                                                    className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                                                    placeholder="127.0.0.1"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                                    Listening Port
                                                </label>
                                                <input
                                                    type="number"
                                                    value={binding.port}
                                                    onChange={(e) => updateBinding(index, 'port', e.target.value)}
                                                    className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all"
                                                    placeholder="8080"
                                                    min="1"
                                                    max="65535"
                                                />
                                            </div>
                                            <button
                                                onClick={() => removeBinding(index)}
                                                disabled={(settings.proxyBindings || []).length <= 1}
                                                className="h-[42px] px-3 rounded-lg border border-accent-red/40 text-accent-red hover:bg-accent-red/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                title="Remove binding"
                                            >
                                                <Trash2 size={16} />
                                            </button>

                                            {checkingBindings && !status ? (
                                                <div className="h-[42px] flex items-center justify-center text-text-secondary" title={title}>
                                                    <RefreshCw size={16} className="animate-spin" />
                                                </div>
                                            ) : status?.available ? (
                                                <div className="h-[42px] flex items-center justify-center text-accent-green" title={title}>
                                                    <Check size={16} />
                                                </div>
                                            ) : (
                                                <div className="h-[42px] flex items-center justify-center text-accent-red" title={title}>
                                                    <XCircle size={16} />
                                                </div>
                                            )}
                                        </div>

                                        {inlineErrorMessage ? (
                                            <p className="text-xs text-accent-red/90">
                                                {inlineErrorMessage}
                                            </p>
                                        ) : null}
                                    </div>
                                );
                            })}

                            <div className="flex items-center justify-between">
                                <p className="text-xs text-text-secondary/60">
                                    Add multiple address:port listeners. Use 0.0.0.0 to listen on all interfaces.
                                </p>
                                <button
                                    onClick={addBinding}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all"
                                >
                                    <Plus size={14} />
                                    Add Binding
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-white/[0.04]">
                            {bindingValidation.hasErrors ? (
                                <div className="mr-auto flex items-center text-xs text-accent-red/90">
                                    <AlertTriangle size={14} className="mr-1.5" />
                                    Fix invalid binding values to save settings.
                                </div>
                            ) : hasUnsavedBindingChanges ? (
                                <div className="mr-auto flex items-center text-xs text-amber-300/90">
                                    <AlertTriangle size={14} className="mr-1.5" />
                                    Address/port updated. Save settings to apply changes.
                                </div>
                            ) : null}
                            {saveState === 'error' && saveError ? (
                                <div className="mr-3 flex items-center text-xs text-accent-red/90">
                                    <XCircle size={14} className="mr-1.5" />
                                    {saveError}
                                </div>
                            ) : null}
                            <button
                                onClick={handleSave}
                                disabled={!canSave}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
                            >
                                {saveState === 'saving' ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : saveState === 'saved' ? (
                                    <Check size={16} />
                                ) : (
                                    <Save size={16} />
                                )}
                                {saveLabel}
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
