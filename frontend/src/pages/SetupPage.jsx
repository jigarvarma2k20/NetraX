import { ShieldAlert, Download, Activity, Globe, Lock } from 'lucide-react';
import { ExportCACertificate } from '../../wailsjs/go/main/App';

export default function SetupPage() {
    const handleExportCA = async () => {
        try {
            await ExportCACertificate();
        } catch (e) {
            console.error('Failed to export CA:', e);
        }
    };

    return (
        <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-background-dark custom-scrollbar">
            <div className="w-full px-6 py-8">
                <div className="text-center mb-12">
                    <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 mb-6">
                        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
                        <Activity size={40} className="relative z-10 text-primary" />
                    </div>
                    <h1 className="mb-4 text-4xl font-bold tracking-tight text-white">
                        Setup <span className="text-primary">NetraX</span>
                    </h1>
                    <p className="mx-auto max-w-xl text-lg text-text-secondary">
                        Configure the local proxy and install the CA certificate so NetraX can inspect HTTPS traffic.
                    </p>
                </div>

                <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="glass rounded-xl border border-white/6 p-6 transition-colors hover:bg-white/2">
                        <Globe className="mb-4 text-primary" size={24} />
                        <h3 className="mb-2 text-lg font-medium text-white">1. Setup your proxy</h3>
                        <p className="mb-4 text-sm leading-relaxed text-text-secondary">
                            Configure your browser or operating system to route HTTP/HTTPS traffic through the NetraX proxy. By default, NetraX binds to <code className="rounded bg-overlay-medium px-1.5 py-0.5 text-primary">127.0.0.1:8080</code>.
                        </p>
                    </div>

                    <div className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/2 p-6">
                        <Lock className="mb-4 text-accent-green" size={24} />
                        <h3 className="mb-2 text-lg font-medium text-white">2. Install CA certificate</h3>
                        <p className="mb-6 text-sm leading-relaxed text-text-secondary">
                            To inspect encrypted HTTPS traffic seamlessly, install and trust the NetraX Root Certificate in your browser or system keychain.
                        </p>
                        <button
                            onClick={handleExportCA}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent-green/20 bg-accent-green/10 px-4 py-2.5 text-sm font-semibold text-accent-green transition-all hover:bg-accent-green/20"
                        >
                            <Download size={16} />
                            Download Root Certificate
                        </button>
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-accent-blue/10 bg-accent-blue/5 p-4">
                    <ShieldAlert className="mt-0.5 shrink-0 text-primary" size={20} />
                    <div className="text-sm leading-relaxed text-text-secondary">
                        <strong className="mb-1 block font-medium text-primary">Security warning</strong>
                        The NetraX Root CA is generated dynamically and securely for your machine. Never share your private keys, and only trust this certificate for local debugging.
                    </div>
                </div>
            </div>
        </div>
    );
}