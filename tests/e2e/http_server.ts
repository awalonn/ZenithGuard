import http from "node:http";

const MIN_SAFE_TEST_PORT = 20_000;
const MAX_SAFE_TEST_PORT = 49_999;
const MAX_LISTEN_ATTEMPTS = 30;

function pickSafePort(): number {
    const range = MAX_SAFE_TEST_PORT - MIN_SAFE_TEST_PORT + 1;
    return MIN_SAFE_TEST_PORT + Math.floor(Math.random() * range);
}

function listenOnPort(server: http.Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            server.off("error", onError);
            server.off("listening", onListening);
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };
        const onListening = () => {
            cleanup();
            resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
    });
}

export async function listenOnSafeLocalhost(server: http.Server): Promise<void> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_LISTEN_ATTEMPTS; attempt += 1) {
        try {
            await listenOnPort(server, pickSafePort());
            return;
        } catch (error) {
            lastError = error;
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EADDRINUSE" && code !== "EACCES") {
                throw error;
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Could not bind a safe localhost test port.");
}
