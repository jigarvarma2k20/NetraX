import { ShieldAlert, Download, Activity, Globe, Lock } from 'lucide-react';
import { ExportCACertificate } from '../../wailsjs/go/main/App';

export default function DashboardPage() {
    const handleExportCA = async () => {
        try {
            await ExportCACertificate();
        } catch (e) {
            console.error("Failed to export CA:", e);
        }
    };

    return (
        <div className="flex-1 bg-background-dark p-8 overflow-y-auto w-full h-full custom-scrollbar flex items-center justify-center">
            <div className="max-w-3xl w-full">

                {/* Welcome Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-6 relative">
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                        <Activity size={40} className="text-primary relative z-10" />
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tight mb-4">
                        Welcome to <span className="text-primary">NetraX</span>
                    </h1>
                    <p className="text-text-secondary text-lg max-w-xl mx-auto">
                        Professional Web Traffic Interception and Analysis
                    </p>
                </div>

                {/* Getting Started Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {/* Setup Proxy */}
                    <div className="glass border border-white/[0.04] p-6 rounded-xl hover:bg-white/[0.02] transition-colors">
                        <Globe className="text-primary mb-4" size={24} />
                        <h3 className="text-white font-medium mb-2 text-lg">1. Setup Your Proxy</h3>
                        <p className="text-text-secondary text-sm leading-relaxed mb-4">
                            Configure your browser or operating system to route HTTP/HTTPS traffic through the NetraX proxy. By default, NetraX binds to <code className="bg-black/30 px-1.5 py-0.5 rounded text-primary">127.0.0.1:8080</code>.
                        </p>
                    </div>

                    {/* Install CA */}
                    <div className="glass border border-white/[0.04] p-6 rounded-xl relative overflow-hidden group">
                        <Lock className="text-accent-green mb-4" size={24} />
                        <h3 className="text-white font-medium mb-2 text-lg">2. Install CA Certificate</h3>
                        <p className="text-text-secondary text-sm leading-relaxed mb-6">
                            To inspect encrypted HTTPS traffic seamlessly, you must install and trust the NetraX Root Certificate in your browser or system keychain.
                        </p>
                        <button
                            onClick={handleExportCA}
                            className="flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-accent-green/10 text-accent-green hover:bg-accent-green/20 border border-accent-green/20 text-sm font-semibold rounded-lg transition-all"
                        >
                            <Download size={16} />
                            Download Root Certificate
                        </button>
                    </div>
                </div>

                {/* Bottom Tip */}
                <div className="flex items-start gap-3 p-4 bg-accent-blue/5 border border-accent-blue/10 rounded-xl">
                    <ShieldAlert className="text-accent-blue shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-text-secondary leading-relaxed">
                        <strong className="text-accent-blue font-medium block mb-1">Security Warning</strong>
                        The NetraX Root CA is generated dynamically and securely specifically for your machine. Never share your private keys, and only trust this certificate for local debugging purposes.
                    </div>
                </div>

            </div>
        </div>
    );
}
