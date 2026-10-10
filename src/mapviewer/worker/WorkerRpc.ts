// Minimal typed RPC over postMessage, replacing the unmaintained `threads` library.

export class Transfer<T> {
    constructor(
        readonly value: T,
        readonly transferables: Transferable[],
    ) {}
}

export function transfer<T>(value: T, transferables: Transferable[]): Transfer<T> {
    return new Transfer(value, transferables);
}

type AnyFunction = (...args: any[]) => any;

export type WorkerApi = Record<string, AnyFunction>;

type Unwrap<T> = T extends Transfer<infer V> ? V : T;

export type WorkerResult<F extends AnyFunction> = Promise<Unwrap<Awaited<ReturnType<F>>>>;

type Request = {
    id: number;
    method: string;
    args: unknown[];
};

type Response = { id: number; result: unknown } | { id: number; error: unknown };

export function expose(api: WorkerApi): void {
    self.onmessage = async (event: MessageEvent<Request>) => {
        const { id, method, args } = event.data;
        try {
            let result = await api[method](...args);
            let transferables: Transferable[] = [];
            if (result instanceof Transfer) {
                transferables = result.transferables;
                result = result.value;
            }
            self.postMessage({ id, result } satisfies Response, { transfer: transferables });
        } catch (error) {
            self.postMessage({ id, error } satisfies Response);
        }
    };
}

type PendingCall = {
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
};

export class WorkerClient<Api extends WorkerApi> {
    private nextId = 0;
    private readonly pending = new Map<number, PendingCall>();

    constructor(readonly worker: Worker) {
        worker.onmessage = (event: MessageEvent<Response>) => {
            const data = event.data;
            const call = this.pending.get(data.id);
            if (!call) {
                return;
            }
            this.pending.delete(data.id);
            if ("error" in data) {
                call.reject(data.error);
            } else {
                call.resolve(data.result);
            }
        };
        worker.onerror = (event) => {
            const error = new Error(event.message);
            for (const call of this.pending.values()) {
                call.reject(error);
            }
            this.pending.clear();
        };
    }

    call<M extends keyof Api & string>(
        method: M,
        ...args: Parameters<Api[M]>
    ): WorkerResult<Api[M]> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, method, args } satisfies Request);
        });
    }

    terminate(): void {
        this.worker.terminate();
        const error = new Error("Worker terminated");
        for (const call of this.pending.values()) {
            call.reject(error);
        }
        this.pending.clear();
    }
}

type QueuedTask<Api extends WorkerApi> = {
    run: (client: WorkerClient<Api>) => Promise<unknown>;
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
};

// Runs queued tasks on a fixed set of workers, one task per worker at a time.
export class WorkerPool<Api extends WorkerApi> {
    readonly clients: WorkerClient<Api>[];
    private readonly idle: WorkerClient<Api>[];
    private readonly tasks: QueuedTask<Api>[] = [];

    constructor(createWorker: () => Worker, size: number) {
        this.clients = Array.from({ length: size }, () => new WorkerClient<Api>(createWorker()));
        this.idle = [...this.clients];
    }

    queue<T>(run: (client: WorkerClient<Api>) => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.tasks.push({ run, resolve, reject });
            this.dispatch();
        });
    }

    // Runs a call on every worker immediately, bypassing the queue.
    broadcast(run: (client: WorkerClient<Api>) => Promise<unknown>): Promise<void> {
        return Promise.all(this.clients.map(run)).then(() => undefined);
    }

    private dispatch(): void {
        while (this.idle.length > 0 && this.tasks.length > 0) {
            const client = this.idle.pop()!;
            const task = this.tasks.shift()!;
            task.run(client)
                .then(task.resolve, task.reject)
                .finally(() => {
                    this.idle.push(client);
                    this.dispatch();
                });
        }
    }

    terminate(): void {
        for (const client of this.clients) {
            client.terminate();
        }
        const error = new Error("Worker pool terminated");
        for (const task of this.tasks.splice(0)) {
            task.reject(error);
        }
    }
}
