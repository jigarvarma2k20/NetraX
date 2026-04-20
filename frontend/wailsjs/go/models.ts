export namespace config {
	
	export class Settings {
	    proxyPort: number;
	    proxyAddr: string;
	    proxyBindings?: ports.ProxyBinding[];
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.proxyPort = source["proxyPort"];
	        this.proxyAddr = source["proxyAddr"];
	        this.proxyBindings = this.convertValues(source["proxyBindings"], ports.ProxyBinding);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace domain {
	
	export class HTTPRequestDTO {
	    id?: number;
	    method: string;
	    url: string;
	    proto: string;
	    host: string;
	    remote_addr: string;
	    header: string;
	    content_length: number;
	    transfer_encoding: string;
	    close: boolean;
	    body: string;
	
	    static createFrom(source: any = {}) {
	        return new HTTPRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.proto = source["proto"];
	        this.host = source["host"];
	        this.remote_addr = source["remote_addr"];
	        this.header = source["header"];
	        this.content_length = source["content_length"];
	        this.transfer_encoding = source["transfer_encoding"];
	        this.close = source["close"];
	        this.body = source["body"];
	    }
	}
	export class HTTPResponseDTO {
	    id?: number;
	    status: string;
	    status_code: number;
	    proto: string;
	    header: string;
	    content_length: number;
	    content_type: string;
	    body: string;
	
	    static createFrom(source: any = {}) {
	        return new HTTPResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.status = source["status"];
	        this.status_code = source["status_code"];
	        this.proto = source["proto"];
	        this.header = source["header"];
	        this.content_length = source["content_length"];
	        this.content_type = source["content_type"];
	        this.body = source["body"];
	    }
	}
	export class HTTPTransactionDTO {
	    request: HTTPRequestDTO;
	    response?: HTTPResponseDTO;
	    index: number;
	
	    static createFrom(source: any = {}) {
	        return new HTTPTransactionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.request = this.convertValues(source["request"], HTTPRequestDTO);
	        this.response = this.convertValues(source["response"], HTTPResponseDTO);
	        this.index = source["index"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class CAInfo {
	    exists: boolean;
	    path: string;
	    errorMsg: string;
	
	    static createFrom(source: any = {}) {
	        return new CAInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exists = source["exists"];
	        this.path = source["path"];
	        this.errorMsg = source["errorMsg"];
	    }
	}

}

export namespace ports {
	
	export class BindingAvailability {
	    address: string;
	    port: number;
	    available: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new BindingAvailability(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	        this.port = source["port"];
	        this.available = source["available"];
	        this.error = source["error"];
	    }
	}
	export class ProxyBinding {
	    address: string;
	    port: number;
	
	    static createFrom(source: any = {}) {
	        return new ProxyBinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	        this.port = source["port"];
	    }
	}

}

export namespace sqlite {
	
	export class RepeaterRequest {
	    id: number;
	    name: string;
	    method: string;
	    url: string;
	    proto: string;
	    header: string;
	    body: string;
	    modified_at: string;
	
	    static createFrom(source: any = {}) {
	        return new RepeaterRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.proto = source["proto"];
	        this.header = source["header"];
	        this.body = source["body"];
	        this.modified_at = source["modified_at"];
	    }
	}

}

